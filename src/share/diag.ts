// Diagnóstico da transmissão, igual ao caminho real: servidor responde? WebSocket abre? dá para criar sala?
// a rede deixa sair UDP (STUN)? o TURN do servidor responde? Cria uma sala de teste e a encerra na hora.
import { invoke } from "@/shared/bridge"
import { SignalClient } from "./signal"

export interface DiagStep { id: string; label: string; ok: boolean | null; detail: string }
export interface DiagResult { steps: DiagStep[]; verdict: { level: "ok" | "warn" | "bad"; title: string; fixes: string[] } }

async function gather(servers: RTCIceServer[], relayOnly: boolean, wait = 6000): Promise<Set<string>> {
  const types = new Set<string>()
  if (typeof RTCPeerConnection !== "function" || !servers.length) return types
  const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: relayOnly ? "relay" : "all" })
  try {
    pc.createDataChannel("teste")
    await new Promise<void>((res) => {
      const t = setTimeout(res, wait)
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(t); return res() }
        const k = / typ (\w+)/.exec(e.candidate.candidate)?.[1]
        if (k) types.add(k)
        if (relayOnly ? types.has("relay") : types.has("srflx")) { clearTimeout(t); res() }
      }
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => { clearTimeout(t); res() })
    })
  } finally { pc.close() }
  return types
}

const KIND: Record<string, string> = {
  dns: "o endereço não foi encontrado (DNS)", clock: "o relógio do PC está errado", cert: "algo intercepta a conexão segura (antivírus/proxy)",
  proxy: "um proxy está bloqueando", offline: "sem internet", refused: "conexão recusada", reset: "conexão interrompida (firewall/antivírus?)",
  timeout: "sem resposta", server: "o servidor respondeu com erro", wrong: "esse endereço não é um servidor Aureon", config: "endereço inválido",
}

export async function diagnose(url: string): Promise<DiagResult> {
  const steps: DiagStep[] = []
  const add = (s: DiagStep) => { steps.push(s); return s }
  const fixes: string[] = []
  if (!url) return { steps, verdict: { level: "bad", title: "Nenhum servidor de transmissão configurado.", fixes: ["Cole o endereço wss:// do seu servidor (veja docs/servidor-transmissao.md)."] } }

  const probe = await invoke("share:probe", url)
  add({ id: "http", label: "Servidor responde", ok: !!probe.ok, detail: probe.ok ? `${probe.ms} ms · versão ${probe.version}${probe.turn ? ` · com TURN${probe.turnProvider ? " (" + probe.turnProvider + ")" : ""}` : probe.turnError ? ` · TURN com erro: ${probe.turnError}` : " · sem TURN"}` : KIND[probe.kind] ?? probe.error })
  if (probe.ok && probe.clockSkewMs != null && Math.abs(probe.clockSkewMs) > 5 * 60e3) fixes.push("O relógio do PC está errado: ative \"Definir hora automaticamente\" no Windows.")
  if (!probe.ok) {
    if (probe.kind === "cert" || probe.kind === "reset") fixes.push("Libere o Aureon Hub no antivírus/firewall ou desligue a verificação de HTTPS.")
    if (probe.kind === "dns") fixes.push("Confira o endereço ou troque o DNS para 1.1.1.1.")
    if (probe.kind === "clock") fixes.push("Acerte o relógio do Windows.")
    return { steps, verdict: { level: "bad", title: "Não foi possível falar com o servidor de transmissão.", fixes: fixes.length ? fixes : ["Confira o endereço e se o servidor está no ar."] } }
  }

  const sig = new SignalClient(url)
  let ice: RTCIceServer[] = []
  try {
    const t0 = performance.now()
    await sig.connect(8000)
    add({ id: "ws", label: "Conexão em tempo real (WebSocket)", ok: true, detail: Math.round(performance.now() - t0) + " ms" })
    const r = await sig.request({ t: "create", name: "teste", approval: true }, ["created"], 8000)
    ice = r.ice
    sig.send({ t: "end" })
    add({ id: "room", label: "Criar sala", ok: true, detail: "sala de teste criada e encerrada" })
    if (r.protocol !== 2) {
      add({ id: "version", label: "Versão do servidor", ok: false, detail: "antiga (salas de uma pessoa só)" })
      sig.close()
      return { steps, verdict: { level: "bad", title: "O servidor de transmissão está desatualizado.", fixes: ["Publique a pasta server/ desta versão (2.0): no Render, um novo deploy a partir do repositório basta. Todos na sala precisam do Aureon Hub 0.5 ou mais novo."] } }
    }
  } catch (e: any) {
    add({ id: "ws", label: "Conexão em tempo real (WebSocket)", ok: false, detail: e?.message || String(e) })
    sig.close()
    return { steps, verdict: { level: "bad", title: "O servidor responde, mas a conexão em tempo real é bloqueada.", fixes: ["Antivírus com proteção web, proxy ou VPN costumam bloquear WebSocket: libere o Aureon Hub ou o endereço do servidor."] } }
  }
  setTimeout(() => sig.close(), 300)

  const stun = ice.filter((s) => [s.urls].flat().some((u) => String(u).startsWith("stun:")))
  const turn = ice.filter((s) => [s.urls].flat().some((u) => /^turns?:/.test(String(u))))
  const [direct, relay] = await Promise.all([gather(stun, false), turn.length ? gather(turn, true) : Promise.resolve(null)])
  add({ id: "stun", label: "Conexão direta (UDP/STUN)", ok: direct.has("srflx"), detail: direct.has("srflx") ? "a rede permite" : "bloqueada nesta rede" })
  add({ id: "turn", label: "Retransmissão (TURN)", ok: relay ? relay.has("relay") : null, detail: relay == null ? "o servidor não tem TURN configurado" : relay.has("relay") ? "respondeu" : "não respondeu" })

  if (!direct.has("srflx") && !relay?.has("relay")) return { steps, verdict: { level: "bad", title: "Dá para criar salas, mas o vídeo não vai passar nesta rede.", fixes: ["Configure um servidor TURN (docs/servidor-transmissao.md) — de preferência na porta 443/TCP.", "Libere o Aureon Hub no Firewall do Windows (redes privadas e públicas)."] } }
  if (relay == null) return { steps, verdict: { level: "warn", title: "Funciona em redes comuns. Sem TURN, redes muito fechadas (empresa, CGNAT rígido) podem falhar.", fixes: [probe.turnError ? "O TURN do servidor deu erro: " + probe.turnError + " (confira as chaves no Render)." : "Para funcionar em qualquer rede, configure TURN no servidor: no Render, adicione CF_TURN_KEY_ID e CF_TURN_API_TOKEN (Cloudflare, gratuito). Passo a passo em docs/servidor-transmissao.md."] } }
  if (relay && !relay.has("relay")) return { steps, verdict: { level: "warn", title: "O TURN do servidor não respondeu: só conexões diretas vão funcionar.", fixes: ["Confira TURN_URLS e TURN_SECRET no servidor e as portas do coturn."] } }
  return { steps, verdict: { level: "ok", title: "Tudo certo: servidor, conexão em tempo real, conexão direta e retransmissão.", fixes } }
}

export function report(r: DiagResult) {
  return ["Diagnóstico de transmissão do Aureon Hub", "Resultado: " + r.verdict.title, ...r.steps.map((s) => `${s.ok == null ? "—" : s.ok ? "ok" : "falhou"} · ${s.label}: ${s.detail}`)].join("\n")
}
