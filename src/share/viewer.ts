// Quem assiste: entra com o convite, espera a aprovação e recebe o vídeo (e o som, se houver) do transmissor.
import { grade } from "./quality"
import { summarize, withStartBitrate, type LinkStats } from "./rtc"
import { SignalClient } from "./signal"

export interface ViewerState {
  phase: "idle" | "connecting" | "waiting" | "joining" | "watching" | "host-away" | "ended" | "error"
  error: string
  hostName: string
  stream: MediaStream | null
  stats: LinkStats | null
  grade: "good" | "fair" | "poor"
  signal: "online" | "reconnecting" | "offline"
  ice: RTCIceConnectionState | "new"
}
export const idleViewer = (): ViewerState => ({ phase: "idle", error: "", hostName: "", stream: null, stats: null, grade: "good", signal: "online", ice: "new" })

const ENDED: Record<string, string> = {
  "host-ended": "A transmissão foi encerrada por quem transmitia.",
  "host-lost": "Quem transmitia perdeu a conexão e não voltou.",
  expired: "A sala venceu.",
  kicked: "Você foi removido da transmissão.",
}

export class ViewerSession {
  state: ViewerState = idleViewer()
  private sig: SignalClient | null = null
  private pc: RTCPeerConnection | null = null
  private host = ""
  private ice: RTCIceServer[] = []
  private pending: RTCIceCandidateInit[] = []
  private mark: { bytes: number; at: number; jbDelay?: number; jbCount?: number } | null = null
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private failTimer: ReturnType<typeof setTimeout> | undefined
  private done = false
  constructor(private onChange: (s: ViewerState) => void) {}
  private set(p: Partial<ViewerState>) { this.state = { ...this.state, ...p }; this.onChange(this.state) }

  async join(signalUrl: string, code: string, name: string) {
    this.set({ ...idleViewer(), phase: "connecting" })
    try {
      const sig = new SignalClient(signalUrl)
      this.sig = sig
      await sig.connect()
      this.bind(sig)
      const first = await sig.request({ t: "join", code, name }, ["waiting", "joined"], 15000)
      if (first.t === "waiting") {
        this.set({ phase: "waiting" })
        // a aprovação pode demorar: espera até 3 minutos
        const r = await sig.wait(["joined"], 180000, "join").catch((e) => { if (e.code === "timeout") throw new Error("Ninguém aprovou sua entrada a tempo."); throw e })
        this.onJoined(r)
      } else this.onJoined(first)
    } catch (e: any) {
      this.cleanup()
      this.set({ phase: "error", error: e?.message || String(e) })
    }
  }

  private onJoined(r: any) {
    this.host = r.host
    this.ice = r.ice
    this.sig!.resumeMsg = { t: "resume", room: r.room, role: "viewer", peer: r.peer, key: r.resume }
    this.set({ phase: r.hostAway ? "host-away" : "joining", hostName: r.name || "" })
    this.statsTimer = setInterval(() => void this.tickStats(), 2000)
  }

  private bind(sig: SignalClient) {
    sig.on("signal", (m) => { if (m.from === this.host) void this.onSignal(m.data) })
    sig.on("host-away", () => this.set({ phase: "host-away" }))
    sig.on("host-back", () => this.set({ phase: this.state.stream ? "watching" : "joining" }))
    sig.on("ended", (m) => this.finish(ENDED[m.reason] ?? "A transmissão terminou."))
    sig.on("reconnecting", () => this.set({ signal: "reconnecting" }))
    sig.on("reconnected", (m) => { this.ice = m.ice ?? this.ice; this.set({ signal: "online" }); sig.flush() })
    sig.on("lost", (m) => { if (m.code === "no-room") this.finish("A transmissão terminou."); else this.set({ signal: "offline" }) })
  }

  private ensurePc() {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" })
    const stream = new MediaStream()
    pc.ontrack = (e) => {
      for (const t of stream.getTracks()) if (t.kind === e.track.kind) stream.removeTrack(t)
      stream.addTrack(e.track)
      this.set({ stream, phase: "watching" })
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.sig?.send({ t: "signal", to: this.host, data: { kind: "candidate", candidate: e.candidate.toJSON() } }) }
    pc.oniceconnectionstatechange = () => {
      this.set({ ice: pc.iceConnectionState })
      clearTimeout(this.failTimer)
      // caiu e não voltou sozinho: pede ao transmissor para refazer o caminho (ICE restart)
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
        this.failTimer = setTimeout(() => this.sig?.send({ t: "signal", to: this.host, data: { kind: "restart" } }), pc.iceConnectionState === "failed" ? 0 : 3000)
      }
    }
    this.pc = pc
    return pc
  }

  private async onSignal(data: any) {
    if (!data || this.done) return
    const pc = this.ensurePc()
    try {
      if (data.kind === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: String(data.sdp) })
        for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {})
        const answer = await pc.createAnswer()
        // começa já com uma taxa boa (sem isso a imagem fica borrada nos primeiros segundos)
        answer.sdp = withStartBitrate(answer.sdp ?? "", 2500, 300)
        await pc.setLocalDescription(answer)
        this.sig?.send({ t: "signal", to: this.host, data: { kind: "answer", sdp: pc.localDescription!.sdp } })
      } else if (data.kind === "candidate" && data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
        else this.pending.push(data.candidate)
      }
    } catch (e) { console.warn("Aureon: sinal inválido", e) }
  }

  private async tickStats() {
    if (!this.pc) return
    const reports: any[] = []
    try { (await this.pc.getStats()).forEach((r) => reports.push(r)) } catch { return }
    const { stats, mark } = summarize(reports, this.mark, performance.now())
    this.mark = mark
    // perda do lado de quem recebe
    const inb = reports.find((r) => r.type === "inbound-rtp" && r.kind === "video")
    const pair = reports.find((r) => r.type === "candidate-pair" && r.nominated && r.state === "succeeded")
    if (stats && pair?.currentRoundTripTime != null) stats.rttMs = Math.round(pair.currentRoundTripTime * 1000)
    if (stats && inb && inb.packetsReceived) stats.lossPct = Math.round(((inb.packetsLost || 0) / (inb.packetsReceived + (inb.packetsLost || 0))) * 1000) / 10
    this.set({ stats, grade: grade(stats) })
  }

  private finish(msg: string) {
    if (this.done) return
    this.cleanup()
    this.set({ phase: "ended", error: msg, stream: null })
  }

  private cleanup() {
    this.done = true
    clearInterval(this.statsTimer); clearTimeout(this.failTimer)
    this.state.stream?.getTracks().forEach((t) => t.stop())
    try { this.pc?.close() } catch { /* já fechou */ }
    this.pc = null
    this.sig?.close(); this.sig = null
  }

  leave() {
    this.sig?.send({ t: "leave" })
    this.cleanup()
    this.set(idleViewer())
  }
}
