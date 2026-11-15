// Cliente do servidor de sinalização (WebSocket). Reconecta sozinho com espera crescente e retoma a sala
// com a chave de retomada; as conexões WebRTC já abertas continuam enquanto isso.

type Msg = { t: string; [k: string]: any }
type Handler = (m: Msg) => void

export const ERRORS: Record<string, string> = {
  "bad-code": "Convite inválido. Confira o código.",
  expired: "Este convite venceu. Peça um novo para quem está transmitindo.",
  locked: "A sala está trancada para novas entradas.",
  full: "A sala está cheia.",
  rate: "Muitas tentativas erradas. Espere alguns minutos.",
  denied: "Quem transmite recusou sua entrada.",
  busy: "Você já está em uma sala.",
  "no-room": "A sala não existe mais.",
  "bad-key": "Não foi possível retomar a sala.",
}

export class SignalClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private closed = false
  private tries = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  /** o que mandar ao reconectar (null: não retoma) */
  resumeMsg: Msg | null = null
  connected = false

  constructor(readonly url: string) {}

  on(type: string, fn: Handler) {
    const s = this.handlers.get(type) ?? new Set()
    s.add(fn); this.handlers.set(type, s)
    return () => s.delete(fn)
  }
  private emit(m: Msg) { for (const fn of this.handlers.get(m.t) ?? []) fn(m); for (const fn of this.handlers.get("*") ?? []) fn(m) }

  connect(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      let ws: WebSocket
      try { ws = new WebSocket(this.url) } catch (e) { return reject(new Error("Endereço do servidor inválido.")) }
      this.ws = ws
      const to = setTimeout(() => { if (!settled) { settled = true; try { ws.close() } catch { /* nada */ } reject(new Error("O servidor de transmissão não respondeu.")) } }, timeoutMs)
      ws.onopen = () => {
        clearTimeout(to); this.connected = true; this.tries = 0
        clearInterval(this.pingTimer)
        this.pingTimer = setInterval(() => this.send({ t: "ping" }), 25000)
        if (!settled) { settled = true; resolve() }
      }
      ws.onmessage = (ev) => { try { this.emit(JSON.parse(String(ev.data))) } catch { /* ignora */ } }
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error("Não deu para conectar ao servidor de transmissão.")) } }
      ws.onclose = () => {
        clearTimeout(to); clearInterval(this.pingTimer)
        const was = this.connected
        this.connected = false
        if (this.ws !== ws) return
        if (!settled) { settled = true; reject(new Error("A conexão com o servidor caiu.")) }
        if (!this.closed && was && this.resumeMsg) this.reconnect()
        else if (!this.closed && was) this.emit({ t: "lost" })
      }
    })
  }

  private reconnect() {
    clearTimeout(this.timer)
    if (this.closed) return
    this.emit({ t: "reconnecting", attempt: this.tries + 1 })
    const delay = Math.min(15000, 800 * 2 ** this.tries++)
    this.timer = setTimeout(async () => {
      if (this.closed) return
      try {
        await this.connect(8000)
        const r = await this.request(this.resumeMsg!, ["resumed"], 8000)
        this.emit({ ...r, t: "reconnected" })
      } catch (e: any) {
        // sala não existe mais / chave recusada: desiste; queda de rede: tenta de novo
        if (e?.code === "no-room" || e?.code === "bad-key") { this.emit({ t: "lost", code: e.code }); return }
        if (this.tries > 8) { this.emit({ t: "lost" }); return }
        this.reconnect()
      }
    }, delay)
  }

  send(m: Msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); else if (m.t !== "ping") this.queue.push(m) }
  private queue: Msg[] = []
  /** mensagens que não puderam sair durante a queda (sinais WebRTC) vão quando voltar */
  flush() { const q = this.queue; this.queue = []; for (const m of q) this.send(m) }

  /** envia e espera a primeira resposta de um dos tipos (ou erro para esta mensagem) */
  request(m: Msg, expect: string[], timeoutMs = 10000): Promise<Msg> {
    const p = this.wait(expect, timeoutMs, m.t)
    this.send(m)
    return p
  }

  /** espera uma mensagem de um dos tipos; erro com re === `re` rejeita */
  wait(expect: string[], timeoutMs: number, re: string): Promise<Msg> {
    return new Promise((resolve, reject) => {
      const offs: (() => void)[] = []
      const done = () => { clearTimeout(to); offs.forEach((o) => o()) }
      const to = setTimeout(() => { done(); reject(Object.assign(new Error("O servidor não respondeu."), { code: "timeout" })) }, timeoutMs)
      for (const t of expect) offs.push(this.on(t, (r) => { done(); resolve(r) }))
      offs.push(this.on("error", (r) => {
        if (r.re && r.re !== re) return
        done(); reject(Object.assign(new Error(ERRORS[r.code] ?? "Erro do servidor: " + r.code), { code: r.code }))
      }))
    })
  }

  close() {
    this.closed = true
    clearTimeout(this.timer); clearInterval(this.pingTimer)
    const ws = this.ws; this.ws = null
    try { ws?.close() } catch { /* nada */ }
    this.handlers.clear()
  }
}
