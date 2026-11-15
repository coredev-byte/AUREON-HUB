// Quem transmite: captura a fonte, cria a sala no servidor de sinalização e abre uma conexão WebRTC
// (DTLS-SRTP, criptografada) para cada espectador aceito. Vídeo/áudio vão direto (ou pelo TURN), nunca pelo servidor.
import { captureSource, stopStream } from "./capture"
import { adapt, grade, initialSend, worst, PROFILES, type AdaptState, type Profile, type QualityId } from "./quality"
import { summarize, type LinkStats } from "./rtc"
import { SignalClient } from "./signal"

export interface ViewerInfo { peer: string; name: string; state: RTCPeerConnectionState | "new"; stats: LinkStats | null; grade: "good" | "fair" | "poor"; since: number }
export interface HostState {
  phase: "idle" | "capturing" | "connecting" | "live" | "source-lost" | "ending" | "error"
  error: string
  code: string
  codeExpires: number
  room: string
  source: { id: string; name: string; kind: string } | null
  audio: boolean
  quality: QualityId
  viewers: ViewerInfo[]
  requests: { peer: string; name: string }[]
  startedAt: number
  signal: "online" | "reconnecting" | "offline"
  approval: boolean
  locked: boolean
  stats: LinkStats | null
}
export const idleHost = (): HostState => ({
  phase: "idle", error: "", code: "", codeExpires: 0, room: "", source: null, audio: false, quality: "auto", viewers: [], requests: [],
  startedAt: 0, signal: "online", approval: true, locked: false, stats: null,
})

export interface StartOpts {
  signalUrl: string
  sourceId: string
  sourceName: string
  sourceKind: string
  audio: boolean
  quality: QualityId
  approval: boolean
  name: string
  preferHardware: boolean
}

interface Peer {
  pc: RTCPeerConnection
  name: string
  since: number
  adapt: AdaptState
  mark: { bytes: number; at: number } | null
  stats: LinkStats | null
  restartAt: number
}

export class HostSession {
  state: HostState = idleHost()
  private sig: SignalClient | null = null
  private stream: MediaStream | null = null
  private peers = new Map<string, Peer>()
  private ice: RTCIceServer[] = []
  private profile: Profile = PROFILES.auto
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private opts: StartOpts | null = null
  private ended = false
  constructor(private onChange: (s: HostState) => void, private onEvent: (e: { type: string; [k: string]: any }) => void) {}

  private set(p: Partial<HostState>) { this.state = { ...this.state, ...p }; this.onChange(this.state) }
  private syncViewers() {
    this.set({
      viewers: [...this.peers].map(([peer, p]) => ({ peer, name: p.name, state: p.pc.connectionState, stats: p.stats, grade: grade(p.stats), since: p.since })),
    })
  }

  async start(o: StartOpts) {
    this.opts = o
    this.profile = PROFILES[o.quality]
    this.set({ ...idleHost(), phase: "capturing", quality: o.quality, audio: o.audio, approval: o.approval, source: { id: o.sourceId, name: o.sourceName, kind: o.sourceKind } })
    try {
      this.stream = await captureSource({ sourceId: o.sourceId, audio: o.audio, profile: this.profile, motion: this.profile.fps >= 60 })
      this.watchTracks()
      this.set({ phase: "connecting", audio: this.stream.getAudioTracks().length > 0 })
      const sig = new SignalClient(o.signalUrl)
      this.sig = sig
      await sig.connect()
      this.bindSignal(sig)
      const r = await sig.request({ t: "create", name: o.name, approval: o.approval }, ["created"])
      this.ice = r.ice
      sig.resumeMsg = { t: "resume", room: r.room, role: "host", key: r.hostKey }
      this.set({ phase: "live", code: r.code, codeExpires: r.codeExpires, room: r.room, startedAt: Date.now(), signal: "online" })
      this.statsTimer = setInterval(() => void this.tickStats(), 2000)
    } catch (e: any) {
      this.cleanup()
      this.set({ phase: "error", error: e?.message || String(e) })
      throw e
    }
  }

  private watchTracks() {
    const v = this.stream?.getVideoTracks()[0]
    if (!v) return
    // a janela compartilhada foi fechada ou o monitor desconectado: a sala continua, falta escolher outra fonte
    v.addEventListener("ended", () => {
      if (this.ended || this.stream?.getVideoTracks()[0] !== v) return
      this.set({ phase: "source-lost" })
      this.onEvent({ type: "source-lost" })
    })
  }

  private bindSignal(sig: SignalClient) {
    sig.on("request", (m) => {
      this.set({ requests: [...this.state.requests.filter((x) => x.peer !== m.peer), { peer: m.peer, name: m.name }] })
      this.onEvent({ type: "request", peer: m.peer, name: m.name })
    })
    sig.on("request-cancel", (m) => { this.set({ requests: this.state.requests.filter((x) => x.peer !== m.peer) }); this.onEvent({ type: "request-cancel", peer: m.peer }) })
    sig.on("peer", (m) => { this.set({ requests: this.state.requests.filter((x) => x.peer !== m.peer) }); void this.addPeer(m.peer, m.name) })
    sig.on("peer-left", (m) => { const p = this.peers.get(m.peer); this.dropPeer(m.peer); if (p) this.onEvent({ type: "left", name: p.name }) })
    sig.on("signal", (m) => void this.onSignal(m.from, m.data))
    sig.on("alert", (m) => this.onEvent({ type: "alert", code: m.code }))
    sig.on("code", (m) => this.set({ code: m.code, codeExpires: m.codeExpires, locked: false }))
    sig.on("settings", (m) => this.set({ approval: m.approval, locked: m.locked }))
    sig.on("reconnecting", () => this.set({ signal: "reconnecting" }))
    sig.on("reconnected", (m) => {
      this.ice = m.ice ?? this.ice
      this.set({ signal: "online", requests: m.requests ?? this.state.requests })
      // espectadores que saíram enquanto estávamos fora
      const live = new Set((m.viewers ?? []).map((v: any) => v.peer))
      for (const peer of [...this.peers.keys()]) if (!live.has(peer)) this.dropPeer(peer)
      sig.flush()
    })
    sig.on("lost", () => { this.set({ signal: "offline" }); this.onEvent({ type: "signal-lost" }) })
    sig.on("ended", (m) => { if (!this.ended) { this.onEvent({ type: "ended", reason: m.reason }); this.stop(false) } })
  }

  private async addPeer(peer: string, name: string) {
    if (!this.stream || this.peers.has(peer)) return
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" })
    const p: Peer = { pc, name, since: Date.now(), adapt: initialSend(this.profile), mark: null, stats: null, restartAt: 0 }
    this.peers.set(peer, p)
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream)
    this.preferCodec(pc)
    pc.onicecandidate = (e) => { if (e.candidate) this.sig?.send({ t: "signal", to: peer, data: { kind: "candidate", candidate: e.candidate.toJSON() } }) }
    pc.onconnectionstatechange = () => {
      this.syncViewers()
      if (pc.connectionState === "failed") void this.restart(peer)
    }
    this.syncViewers()
    this.onEvent({ type: "joined", name })
    await this.offer(peer)
  }

  /** H.264 primeiro quando o usuário prefere a placa de vídeo (o Chromium usa NVENC/QuickSync/AMF se houver) */
  private preferCodec(pc: RTCPeerConnection) {
    if (!this.opts?.preferHardware || typeof RTCRtpSender.getCapabilities !== "function") return
    const caps = RTCRtpSender.getCapabilities("video")?.codecs ?? []
    const h264 = caps.filter((c) => /h264/i.test(c.mimeType))
    if (!h264.length) return
    const rest = caps.filter((c) => !/h264/i.test(c.mimeType))
    for (const t of pc.getTransceivers()) if (t.sender.track?.kind === "video") try { t.setCodecPreferences([...h264, ...rest]) } catch { /* navegador sem suporte */ }
  }

  private async offer(peer: string, iceRestart = false) {
    const p = this.peers.get(peer)
    if (!p) return
    const offer = await p.pc.createOffer({ iceRestart })
    await p.pc.setLocalDescription(offer)
    await this.applyParams(p)
    this.sig?.send({ t: "signal", to: peer, data: { kind: "offer", sdp: p.pc.localDescription!.sdp, restart: iceRestart } })
  }

  private async restart(peer: string) {
    const p = this.peers.get(peer)
    if (!p || Date.now() - p.restartAt < 4000) return
    p.restartAt = Date.now()
    try { await this.offer(peer, true) } catch { /* a próxima falha tenta de novo */ }
  }

  private async onSignal(from: string, data: any) {
    const p = this.peers.get(from)
    if (!p || !data) return
    try {
      if (data.kind === "answer") await p.pc.setRemoteDescription({ type: "answer", sdp: String(data.sdp) })
      else if (data.kind === "candidate" && data.candidate) await p.pc.addIceCandidate(data.candidate).catch(() => {})
      else if (data.kind === "restart") await this.restart(from)
    } catch (e) { console.warn("Aureon: sinal inválido", e) }
  }

  private async applyParams(p: Peer) {
    for (const s of p.pc.getSenders()) {
      if (s.track?.kind !== "video") continue
      const prm = s.getParameters()
      if (!prm.encodings?.length) prm.encodings = [{}]
      const e = prm.encodings[0]
      e.maxBitrate = p.adapt.params.maxKbps * 1000
      e.scaleResolutionDownBy = p.adapt.params.scale
      e.maxFramerate = p.adapt.params.fps
      ;(prm as any).degradationPreference = this.profile.fps >= 60 ? "maintain-framerate" : "maintain-resolution"
      try { await s.setParameters(prm) } catch { /* antes da negociação terminar */ }
    }
  }

  private async tickStats() {
    const grades: ("good" | "fair" | "poor")[] = []
    let first: LinkStats | null = null
    for (const p of this.peers.values()) {
      if (p.pc.connectionState !== "connected") continue
      const reports: any[] = []
      try { (await p.pc.getStats()).forEach((r) => reports.push(r)) } catch { continue }
      const { stats, mark } = summarize(reports, p.mark, performance.now())
      p.mark = mark; p.stats = stats
      const next = adapt(p.adapt, stats, this.profile)
      if (JSON.stringify(next.params) !== JSON.stringify(p.adapt.params)) { p.adapt = next; await this.applyParams(p) } else p.adapt = next
      grades.push(grade(stats))
      first ??= stats
    }
    this.syncViewers()
    this.set({ stats: first })
    this.onEvent({ type: "grade", grade: grades.length ? worst(grades) : "good" })
  }

  /** troca a tela/janela sem derrubar ninguém (replaceTrack, sem renegociar) */
  async switchSource(sourceId: string, sourceName: string, sourceKind: string) {
    if (!this.opts || !this.stream) return
    const next = await captureSource({ sourceId, audio: this.state.audio, profile: this.profile, motion: this.profile.fps >= 60 })
    const old = this.stream
    this.stream = next
    const v = next.getVideoTracks()[0], a = next.getAudioTracks()[0] ?? null
    for (const p of this.peers.values()) {
      for (const t of p.pc.getTransceivers()) {
        const kind = t.receiver.track?.kind
        if (kind === "video") await t.sender.replaceTrack(v)
        else if (kind === "audio") await t.sender.replaceTrack(a)
      }
    }
    stopStream(old)
    this.watchTracks()
    this.set({ phase: "live", source: { id: sourceId, name: sourceName, kind: sourceKind } })
  }

  async setQuality(q: QualityId) {
    this.profile = PROFILES[q]
    const v = this.stream?.getVideoTracks()[0]
    if (v) {
      v.contentHint = this.profile.fps >= 60 ? "motion" : "detail"
      try { await v.applyConstraints({ frameRate: { max: this.profile.fps }, width: { max: this.profile.width }, height: { max: this.profile.height } }) } catch { /* fonte não aceita */ }
    }
    for (const p of this.peers.values()) { p.adapt = initialSend(this.profile); await this.applyParams(p) }
    this.set({ quality: q })
  }

  admit(peer: string, ok: boolean) {
    this.sig?.send({ t: "admit", peer, ok })
    this.set({ requests: this.state.requests.filter((x) => x.peer !== peer) })
  }
  kick(peer: string) { this.sig?.send({ t: "kick", peer }); this.dropPeer(peer) }
  rotateCode() { this.sig?.send({ t: "rotate" }) }
  setApproval(on: boolean) { this.sig?.send({ t: "set", approval: on }) }
  setLocked(on: boolean) { this.sig?.send({ t: "set", locked: on }) }
  get localStream() { return this.stream }

  private dropPeer(peer: string) {
    const p = this.peers.get(peer)
    if (!p) return
    this.peers.delete(peer)
    try { p.pc.close() } catch { /* já fechou */ }
    this.syncViewers()
  }

  private cleanup() {
    clearInterval(this.statsTimer)
    for (const peer of [...this.peers.keys()]) this.dropPeer(peer)
    stopStream(this.stream); this.stream = null
    this.sig?.close(); this.sig = null
  }

  /** encerra tudo: avisa o servidor, fecha as conexões e para a captura (nenhuma trilha fica viva) */
  stop(notify = true) {
    if (this.ended) return
    this.ended = true
    this.set({ phase: "ending" })
    if (notify) this.sig?.send({ t: "end" })
    this.cleanup()
    this.set({ ...idleHost() })
  }
}
