// Sala de transmissão no estilo "canal de voz": várias pessoas na mesma sala, qualquer uma pode transmitir a
// própria tela e cada pessoa escolhe quais telas assistir (uma ou várias ao mesmo tempo).
//
// Conexões WebRTC (DTLS-SRTP, criptografadas), uma por par "quem transmite → quem assiste":
//   - saída (out): eu transmito para cada pessoa que pediu para me assistir;
//   - entrada (in): eu assisto cada pessoa que escolhi.
// Os sinais levam `dir`: "up" (de quem assiste para quem transmite) ou "down" (de quem transmite para quem assiste).
// Nada começa sem a pessoa escolher a tela (consentimento) e ninguém controla o PC de ninguém.
import { captureSource, stopStream } from "./capture"
import { adapt, grade, initialSend, withResolution, worst, PROFILES, type AdaptState, type Profile, type QualityId, type ResolutionId } from "./quality"
import { summarize, withStartBitrate, type LinkStats } from "./rtc"
import { SignalClient } from "./signal"
import { audioError, startPcmAudio, type PcmAudio } from "./pcmAudio"

export interface LiveInfo { label: string; audio: boolean; since: number }
export interface Member { peer: string; name: string; live: LiveInfo | null; away: boolean; owner: boolean }
/** alguém me assistindo */
export interface ViewerInfo { peer: string; name: string; state: RTCPeerConnectionState | "new"; stats: LinkStats | null; grade: "good" | "fair" | "poor"; since: number }
/** uma tela que eu estou assistindo */
export interface Watch { peer: string; phase: "connecting" | "watching" | "away" | "stopped"; stream: MediaStream | null; stats: LinkStats | null; grade: "good" | "fair" | "poor"; ice: RTCIceConnectionState | "new" }
export interface MyShare {
  phase: "off" | "capturing" | "live" | "source-lost"
  source: { id: string; name: string; kind: string } | null
  audio: boolean
  quality: QualityId
  resolution: ResolutionId
  startedAt: number
  viewers: ViewerInfo[]
  stats: LinkStats | null
  error: string
  /** som do PC: "all" (tudo) ou "no-discord" (tudo menos o Discord) */
  audioMode: "all" | "no-discord"
  /** com "no-discord": o Discord estava aberto e ficou de fora? */
  discordExcluded: boolean
  /** aviso sobre o som (ex.: Windows sem suporte); a transmissão continua */
  audioNote: string
}
export interface RoomState {
  phase: "idle" | "connecting" | "waiting" | "in-room" | "ended" | "error"
  error: string
  room: string
  /** nome da sala (escolhido por quem criou) e a senha (só quem criou ou digitou sabe; nunca vem do servidor) */
  roomName: string
  password: string
  code: string
  codeExpires: number
  me: string
  owner: string
  name: string
  members: Member[]
  requests: { peer: string; name: string }[]
  signal: "online" | "reconnecting" | "offline"
  approval: boolean
  locked: boolean
  share: MyShare
  watching: Watch[]
}
export const idleShare = (): MyShare => ({ phase: "off", source: null, audio: false, quality: "auto", resolution: "auto", startedAt: 0, viewers: [], stats: null, error: "", audioMode: "all", discordExcluded: false, audioNote: "" })
export const idleRoom = (): RoomState => ({
  phase: "idle", error: "", room: "", roomName: "", password: "", code: "", codeExpires: 0, me: "", owner: "", name: "", members: [], requests: [], signal: "online",
  approval: true, locked: false, share: idleShare(), watching: [],
})

export interface ShareOpts { sourceId: string; sourceName: string; sourceKind: string; audio: boolean; audioMode?: "all" | "no-discord"; quality: QualityId; resolution?: ResolutionId; preferHardware: boolean }
export type RoomEvent =
  | { type: "request"; peer: string; name: string } | { type: "request-cancel"; peer: string }
  | { type: "member"; name: string } | { type: "member-left"; name: string }
  | { type: "live"; peer: string; name: string; label: string } | { type: "viewer"; name: string }
  | { type: "source-lost" } | { type: "alert"; code: string } | { type: "signal-lost" } | { type: "owner"; me: boolean; name: string }
  | { type: "ended"; reason: string } | { type: "grade"; grade: "good" | "fair" | "poor" }

const ENDED: Record<string, string> = {
  "host-ended": "A sala foi encerrada.",
  "host-lost": "A sala fechou: todo mundo caiu.",
  expired: "A sala venceu.",
  kicked: "Você foi removido da sala.",
}

interface Out { pc: RTCPeerConnection; since: number; adapt: AdaptState; mark: { bytes: number; at: number } | null; stats: LinkStats | null; restartAt: number }
interface In { pc: RTCPeerConnection | null; stream: MediaStream; pending: RTCIceCandidateInit[]; mark: any; failTimer?: ReturnType<typeof setTimeout> }

export class RoomSession {
  state: RoomState = idleRoom()
  private sig: SignalClient | null = null
  private ice: RTCIceServer[] = []
  private stream: MediaStream | null = null
  private profile: Profile = PROFILES.auto
  private shareOpts: ShareOpts | null = null
  /** som do PC sem o Discord (captura por processo do Windows), quando escolhido */
  private pcm: PcmAudio | null = null
  private outs = new Map<string, Out>()
  private ins = new Map<string, In>()
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private done = false
  constructor(private onChange: (s: RoomState) => void, private onEvent: (e: RoomEvent) => void) {}

  private set(p: Partial<RoomState>) { this.state = { ...this.state, ...p }; this.onChange(this.state) }
  private setShare(p: Partial<MyShare>) { this.set({ share: { ...this.state.share, ...p } }) }
  private setWatch(peer: string, p: Partial<Watch>) {
    this.set({ watching: this.state.watching.map((w) => (w.peer === peer ? { ...w, ...p } : w)) })
  }
  private nameOf(peer: string) { return this.state.members.find((m) => m.peer === peer)?.name ?? "Alguém" }
  get isOwner() { return !!this.state.me && this.state.me === this.state.owner }
  get localStream() { return this.stream }

  /* ───────────── entrar / criar ───────────── */
  /** cria a sala com o nome e a senha escolhidos */
  async create(signalUrl: string, name: string, approval: boolean, room: string, password: string) {
    this.set({ ...idleRoom(), phase: "connecting" })
    try {
      const sig = await this.open(signalUrl)
      const r = await sig.request({ t: "create", name, approval, room, password }, ["created"])
      // servidor antigo ignora nome/senha e cria uma sala de código: fecha ela e avisa
      if (r.protocol !== 2 || !r.roomName) { sig.send({ t: "end" }); throw new Error("O servidor de transmissão está desatualizado (precisa da versão 2.1 para salas com senha). Publique a pasta server/ de novo.") }
      this.enter(r)
      this.set({ roomName: r.roomName, password, code: "", codeExpires: r.codeExpires })
    } catch (e: any) { this.fail(e) ; throw e }
  }

  /** entra com o nome da sala e a senha */
  async join(signalUrl: string, room: string, password: string, name: string) {
    this.set({ ...idleRoom(), phase: "connecting" })
    try {
      const sig = await this.open(signalUrl)
      const first = await sig.request({ t: "join", room, password, name }, ["waiting", "joined"], 15000)
      if (first.t === "waiting") {
        this.set({ phase: "waiting", room: first.room })
        // a aprovação pode demorar: espera até 3 minutos
        const r = await sig.wait(["joined"], 180000, "join").catch((e) => { if (e.code === "timeout") throw new Error("Ninguém aprovou sua entrada a tempo."); throw e })
        this.enter(r)
      } else this.enter(first)
      this.set({ roomName: this.state.roomName || String(room).toLowerCase(), password })
    } catch (e: any) { this.fail(e); throw e }
  }

  private async open(url: string) {
    const sig = new SignalClient(url)
    this.sig = sig
    try { await sig.connect() } catch (e) { throw e }
    this.bind(sig)
    return sig
  }

  private fail(e: any) {
    const msg = e?.code === "unknown" ? "O servidor de transmissão está desatualizado. Publique a versão nova (pasta server/)." : e?.message || String(e)
    this.cleanup()
    this.set({ ...idleRoom(), phase: "error", error: msg })
  }

  private enter(r: any) {
    if (r.protocol != null && r.protocol !== 2) throw new Error("O servidor de transmissão está desatualizado. Publique a versão nova (pasta server/).")
    this.ice = r.ice
    this.sig!.resumeMsg = { t: "resume", room: r.room, peer: r.peer, key: r.key }
    this.set({ phase: "in-room", room: r.room, roomName: r.roomName || this.state.roomName, me: r.peer, owner: r.owner, name: r.name || "", members: this.members(r.members), approval: r.approval !== false, locked: !!r.locked, signal: "online" })
    clearInterval(this.statsTimer)
    this.statsTimer = setInterval(() => void this.tickStats(), 2000)
  }

  private members(list: any[]): Member[] {
    return (list ?? []).map((m) => ({ peer: m.peer, name: m.name, live: m.live ?? null, away: !!m.away, owner: !!m.owner }))
  }

  private bind(sig: SignalClient) {
    sig.on("request", (m) => {
      this.set({ requests: [...this.state.requests.filter((x) => x.peer !== m.peer), { peer: m.peer, name: m.name }] })
      this.onEvent({ type: "request", peer: m.peer, name: m.name })
    })
    sig.on("request-cancel", (m) => { this.set({ requests: this.state.requests.filter((x) => x.peer !== m.peer) }); this.onEvent({ type: "request-cancel", peer: m.peer }) })
    sig.on("member", (m) => {
      if (this.state.members.some((x) => x.peer === m.peer)) return
      this.set({ members: [...this.state.members, { peer: m.peer, name: m.name, live: m.live ?? null, away: false, owner: false }], requests: this.state.requests.filter((x) => x.peer !== m.peer) })
      this.onEvent({ type: "member", name: m.name })
    })
    sig.on("member-left", (m) => {
      const name = this.nameOf(m.peer)
      this.dropOut(m.peer); this.closeIn(m.peer)
      this.set({ members: this.state.members.filter((x) => x.peer !== m.peer), watching: this.state.watching.filter((w) => w.peer !== m.peer) })
      if (m.peer !== this.state.me) this.onEvent({ type: "member-left", name })
    })
    sig.on("member-away", (m) => { this.patchMember(m.peer, { away: true }); if (this.ins.has(m.peer)) this.setWatch(m.peer, { phase: "away" }) })
    sig.on("member-back", (m) => { this.patchMember(m.peer, { away: false }); const w = this.state.watching.find((x) => x.peer === m.peer); if (w) this.setWatch(m.peer, { phase: w.stream ? "watching" : "connecting" }) })
    sig.on("member-live", (m) => {
      this.patchMember(m.peer, { live: m.live ?? null })
      if (m.peer === this.state.me) return
      if (m.live) this.onEvent({ type: "live", peer: m.peer, name: this.nameOf(m.peer), label: m.live.label })
      else if (this.ins.has(m.peer)) { this.closeIn(m.peer); this.setWatch(m.peer, { phase: "stopped", stream: null, stats: null }) }
    })
    sig.on("owner", (m) => {
      this.set({ owner: m.peer, members: this.state.members.map((x) => ({ ...x, owner: x.peer === m.peer })) })
      this.onEvent({ type: "owner", me: m.peer === this.state.me, name: this.nameOf(m.peer) })
    })
    sig.on("signal", (m) => void this.onSignal(m.from, m.data))
    sig.on("alert", (m) => this.onEvent({ type: "alert", code: m.code }))
    sig.on("code", (m) => this.set({ code: m.code, codeExpires: m.codeExpires, locked: false }))
    sig.on("settings", (m) => this.set({ approval: m.approval, locked: m.locked }))
    sig.on("reconnecting", () => this.set({ signal: "reconnecting" }))
    sig.on("reconnected", (m) => {
      this.ice = m.ice ?? this.ice
      const members = this.members(m.members)
      const live = new Set(members.map((x) => x.peer))
      for (const peer of [...this.outs.keys()]) if (!live.has(peer)) this.dropOut(peer)
      for (const peer of [...this.ins.keys()]) if (!live.has(peer)) this.closeIn(peer)
      this.set({ signal: "online", members, owner: m.owner ?? this.state.owner, requests: m.requests ?? [], approval: m.approval ?? this.state.approval, locked: !!m.locked, watching: this.state.watching.filter((w) => live.has(w.peer)) })
      sig.flush()
    })
    sig.on("lost", (m) => {
      if (m.code === "no-room" || m.code === "bad-key") return this.finish("A sala terminou.")
      this.set({ signal: "offline" }); this.onEvent({ type: "signal-lost" })
    })
    sig.on("ended", (m) => this.finish(ENDED[m.reason] ?? "A sala terminou.", m.reason))
  }
  private patchMember(peer: string, p: Partial<Member>) { this.set({ members: this.state.members.map((x) => (x.peer === peer ? { ...x, ...p } : x)) }) }
  private send(to: string, data: Record<string, unknown>) { this.sig?.send({ t: "signal", to, data }) }

  /* ───────────── transmitir a minha tela ───────────── */
  async startShare(o: ShareOpts) {
    if (this.state.phase !== "in-room") throw new Error("Entre numa sala primeiro.")
    if (this.state.share.phase !== "off") throw new Error("Você já está transmitindo.")
    this.shareOpts = o
    this.profile = withResolution(PROFILES[o.quality], o.resolution ?? "auto")
    const noDiscord = o.audio && o.audioMode === "no-discord"
    this.setShare({ ...idleShare(), phase: "capturing", quality: o.quality, resolution: o.resolution ?? "auto", audio: o.audio, audioMode: noDiscord ? "no-discord" : "all", source: { id: o.sourceId, name: o.sourceName, kind: o.sourceKind } })
    try {
      // sem o Discord: a captura de tela vem sem som e o som do PC entra por outro caminho (por processo)
      this.stream = await captureSource({ sourceId: o.sourceId, audio: o.audio && !noDiscord, profile: this.profile, motion: this.profile.fps >= 60 })
    } catch (e: any) {
      this.setShare({ ...idleShare(), error: e?.message || String(e) })
      throw e
    }
    if (noDiscord) await this.startPcm()
    this.watchTracks()
    this.setShare({ phase: "live", audio: this.stream.getAudioTracks().length > 0, startedAt: Date.now() })
    this.sig?.send({ t: "live", on: true, label: o.sourceName, audio: this.state.share.audio })
  }

  /** liga o som do PC sem o Discord; se o Windows não deixar, segue sem som e avisa (nunca manda o Discord junto) */
  private async startPcm() {
    try {
      const pcm = await startPcmAudio((err) => {
        if (this.pcm !== pcm) return
        this.dropPcm()
        this.setShare({ audio: false, audioNote: audioError(err) })
      })
      if (!this.stream) { pcm.stop(); return }
      this.pcm = pcm
      this.stream.addTrack(pcm.track)
      this.setShare({ discordExcluded: pcm.excluded === "discord", audioNote: pcm.excluded === "discord" ? "" : "O Discord não estava aberto ao começar. Se abrir agora, pare e comece a transmissão de novo para deixá-lo de fora." })
    } catch (e: any) {
      this.setShare({ audio: false, audioNote: e?.message || String(e) })
    }
  }
  private dropPcm() {
    const p = this.pcm
    if (!p) return
    this.pcm = null
    try { this.stream?.removeTrack(p.track) } catch { /* já saiu */ }
    p.stop()
  }

  stopShare() {
    if (this.state.share.phase === "off") return
    for (const peer of [...this.outs.keys()]) { this.send(peer, { dir: "down", kind: "stopped" }); this.dropOut(peer) }
    this.dropPcm()
    stopStream(this.stream); this.stream = null
    this.sig?.send({ t: "live", on: false })
    this.setShare(idleShare())
  }

  private watchTracks() {
    const v = this.stream?.getVideoTracks()[0]
    if (!v) return
    // a janela compartilhada fechou ou o monitor foi desconectado: continua na sala, falta escolher outra fonte
    v.addEventListener("ended", () => {
      if (this.done || this.stream?.getVideoTracks()[0] !== v) return
      this.setShare({ phase: "source-lost" })
      this.onEvent({ type: "source-lost" })
    })
  }

  /** troca a tela/janela sem derrubar ninguém (replaceTrack, sem renegociar) */
  async switchSource(sourceId: string, sourceName: string, sourceKind: string) {
    if (!this.stream) return
    const next = await captureSource({ sourceId, audio: this.state.share.audio && !this.pcm, profile: this.profile, motion: this.profile.fps >= 60 })
    const old = this.stream
    // o som sem o Discord continua o mesmo: passa para a nova captura (e não é parado junto com a antiga)
    if (this.pcm) { try { old.removeTrack(this.pcm.track) } catch { /* nada */ } next.addTrack(this.pcm.track) }
    this.stream = next
    const v = next.getVideoTracks()[0], a = next.getAudioTracks()[0] ?? null
    for (const p of this.outs.values()) {
      for (const t of p.pc.getTransceivers()) {
        const kind = t.receiver.track?.kind
        if (kind === "video") await t.sender.replaceTrack(v)
        else if (kind === "audio") await t.sender.replaceTrack(a)
      }
    }
    stopStream(old)
    this.watchTracks()
    this.setShare({ phase: "live", source: { id: sourceId, name: sourceName, kind: sourceKind } })
    this.sig?.send({ t: "live", on: true, label: sourceName, audio: this.state.share.audio })
  }

  async setQuality(q: QualityId) { await this.applyProfile(q, this.state.share.resolution) }
  async setResolution(r: ResolutionId) { await this.applyProfile(this.state.share.quality, r) }

  /** troca qualidade/resolução durante a transmissão: recorta a captura e reinicia o envio, sem reconectar */
  private async applyProfile(q: QualityId, r: ResolutionId) {
    this.profile = withResolution(PROFILES[q], r)
    const v = this.stream?.getVideoTracks()[0]
    if (v) {
      v.contentHint = this.profile.fps >= 60 ? "motion" : "detail"
      try { await v.applyConstraints({ frameRate: { max: this.profile.fps }, width: { max: this.profile.width }, height: { max: this.profile.height } }) } catch { /* fonte não aceita */ }
    }
    for (const p of this.outs.values()) { p.adapt = initialSend(this.profile); await this.applyParams(p) }
    this.setShare({ quality: q, resolution: r })
  }

  private syncViewers() {
    this.setShare({ viewers: [...this.outs].map(([peer, p]) => ({ peer, name: this.nameOf(peer), state: p.pc.connectionState, stats: p.stats, grade: grade(p.stats), since: p.since })) })
  }

  /** alguém pediu para me assistir */
  private async addOut(peer: string) {
    if (!this.stream || this.state.share.phase === "off") { this.send(peer, { dir: "down", kind: "stopped" }); return }
    this.dropOut(peer)
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" })
    const p: Out = { pc, since: Date.now(), adapt: initialSend(this.profile), mark: null, stats: null, restartAt: 0 }
    this.outs.set(peer, p)
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream)
    this.preferCodec(pc)
    pc.onicecandidate = (e) => { if (e.candidate) this.send(peer, { dir: "down", kind: "candidate", candidate: e.candidate.toJSON() }) }
    pc.onconnectionstatechange = () => { this.syncViewers(); if (pc.connectionState === "failed") void this.restart(peer) }
    this.syncViewers()
    this.onEvent({ type: "viewer", name: this.nameOf(peer) })
    await this.offer(peer)
  }

  /** H.264 primeiro quando o usuário prefere a placa de vídeo (o Chromium usa NVENC/QuickSync/AMF se houver) */
  private preferCodec(pc: RTCPeerConnection) {
    if (!this.shareOpts?.preferHardware || typeof RTCRtpSender.getCapabilities !== "function") return
    const caps = RTCRtpSender.getCapabilities("video")?.codecs ?? []
    const h264 = caps.filter((c) => /h264/i.test(c.mimeType))
    if (!h264.length) return
    const rest = caps.filter((c) => !/h264/i.test(c.mimeType))
    for (const t of pc.getTransceivers()) if (t.sender.track?.kind === "video") try { t.setCodecPreferences([...h264, ...rest]) } catch { /* sem suporte */ }
  }

  private async offer(peer: string, iceRestart = false) {
    const p = this.outs.get(peer)
    if (!p) return
    const offer = await p.pc.createOffer({ iceRestart })
    await p.pc.setLocalDescription(offer)
    await this.applyParams(p)
    this.send(peer, { dir: "down", kind: "offer", sdp: p.pc.localDescription!.sdp, restart: iceRestart })
  }

  private async restart(peer: string) {
    const p = this.outs.get(peer)
    if (!p || Date.now() - p.restartAt < 4000) return
    p.restartAt = Date.now()
    try { await this.offer(peer, true) } catch { /* a próxima falha tenta de novo */ }
  }

  private async applyParams(p: Out) {
    for (const s of p.pc.getSenders()) {
      if (s.track?.kind !== "video") continue
      const prm = s.getParameters()
      if (!prm.encodings?.length) prm.encodings = [{}]
      const e = prm.encodings[0]
      e.maxBitrate = p.adapt.params.maxKbps * 1000
      e.scaleResolutionDownBy = p.adapt.params.scale
      e.maxFramerate = p.adapt.params.fps
      ;(prm as any).degradationPreference = this.profile.fixedRes ? "maintain-resolution" : this.profile.fps >= 60 ? "maintain-framerate" : "maintain-resolution"
      try { await s.setParameters(prm) } catch { /* antes da negociação terminar */ }
    }
  }

  private dropOut(peer: string) {
    const p = this.outs.get(peer)
    if (!p) return
    this.outs.delete(peer)
    try { p.pc.close() } catch { /* já fechou */ }
    this.syncViewers()
  }

  kickViewer(peer: string) { this.send(peer, { dir: "down", kind: "stopped" }); this.dropOut(peer) }

  /* ───────────── assistir a tela de alguém ───────────── */
  watch(peer: string) {
    if (peer === this.state.me || this.ins.has(peer)) return
    this.ins.set(peer, { pc: null, stream: new MediaStream(), pending: [], mark: null })
    const rest = this.state.watching.filter((w) => w.peer !== peer)
    this.set({ watching: [...rest, { peer, phase: "connecting", stream: null, stats: null, grade: "good", ice: "new" }] })
    this.send(peer, { dir: "up", kind: "watch" })
  }

  unwatch(peer: string) {
    if (this.ins.has(peer)) this.send(peer, { dir: "up", kind: "unwatch" })
    this.closeIn(peer)
    this.set({ watching: this.state.watching.filter((w) => w.peer !== peer) })
  }

  private inPc(peer: string, c: In) {
    if (c.pc) return c.pc
    const pc = new RTCPeerConnection({ iceServers: this.ice, bundlePolicy: "max-bundle" })
    pc.ontrack = (e) => {
      for (const t of c.stream.getTracks()) if (t.kind === e.track.kind) c.stream.removeTrack(t)
      c.stream.addTrack(e.track)
      this.setWatch(peer, { stream: c.stream, phase: "watching" })
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.send(peer, { dir: "up", kind: "candidate", candidate: e.candidate.toJSON() }) }
    pc.oniceconnectionstatechange = () => {
      this.setWatch(peer, { ice: pc.iceConnectionState })
      clearTimeout(c.failTimer)
      // caiu e não voltou sozinho: pede para quem transmite refazer o caminho (ICE restart)
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
        c.failTimer = setTimeout(() => this.send(peer, { dir: "up", kind: "restart" }), pc.iceConnectionState === "failed" ? 0 : 3000)
      }
    }
    c.pc = pc
    return pc
  }

  private closeIn(peer: string) {
    const c = this.ins.get(peer)
    if (!c) return
    this.ins.delete(peer)
    clearTimeout(c.failTimer)
    c.stream.getTracks().forEach((t) => t.stop())
    try { c.pc?.close() } catch { /* já fechou */ }
  }

  /* ───────────── sinais ───────────── */
  private async onSignal(from: string, data: any) {
    if (!data || this.done) return
    try {
      if (data.dir === "up") {
        // sobre a MINHA transmissão para `from`
        if (data.kind === "watch") return void (await this.addOut(from))
        if (data.kind === "unwatch") return this.dropOut(from)
        const p = this.outs.get(from)
        if (!p) return
        if (data.kind === "answer") await p.pc.setRemoteDescription({ type: "answer", sdp: String(data.sdp) })
        else if (data.kind === "candidate" && data.candidate) await p.pc.addIceCandidate(data.candidate).catch(() => {})
        else if (data.kind === "restart") await this.restart(from)
        return
      }
      if (data.dir === "down") {
        // sobre a tela de `from` que eu assisto
        const c = this.ins.get(from)
        if (!c) return
        if (data.kind === "stopped") { this.closeIn(from); this.setWatch(from, { phase: "stopped", stream: null, stats: null }); return }
        const pc = this.inPc(from, c)
        if (data.kind === "offer") {
          await pc.setRemoteDescription({ type: "offer", sdp: String(data.sdp) })
          for (const cand of c.pending.splice(0)) await pc.addIceCandidate(cand).catch(() => {})
          const answer = await pc.createAnswer()
          // começa já com uma taxa boa (sem isso a imagem fica borrada nos primeiros segundos)
          answer.sdp = withStartBitrate(answer.sdp ?? "", 2500, 300)
          await pc.setLocalDescription(answer)
          this.send(from, { dir: "up", kind: "answer", sdp: pc.localDescription!.sdp })
        } else if (data.kind === "candidate" && data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
          else c.pending.push(data.candidate)
        }
      }
    } catch (e) { console.warn("Aureon: sinal inválido", e) }
  }

  /* ───────────── estatísticas ───────────── */
  private async tickStats() {
    const grades: ("good" | "fair" | "poor")[] = []
    let first: LinkStats | null = null
    for (const p of this.outs.values()) {
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
    if (this.outs.size) { this.syncViewers(); this.setShare({ stats: first }) }
    for (const [peer, c] of this.ins) {
      if (!c.pc) continue
      const reports: any[] = []
      try { (await c.pc.getStats()).forEach((r) => reports.push(r)) } catch { continue }
      const { stats, mark } = summarize(reports, c.mark, performance.now())
      c.mark = mark
      const inb = reports.find((r) => r.type === "inbound-rtp" && r.kind === "video")
      const pair = reports.find((r) => r.type === "candidate-pair" && r.nominated && r.state === "succeeded")
      if (stats && pair?.currentRoundTripTime != null) stats.rttMs = Math.round(pair.currentRoundTripTime * 1000)
      if (stats && inb?.packetsReceived) stats.lossPct = Math.round(((inb.packetsLost || 0) / (inb.packetsReceived + (inb.packetsLost || 0))) * 1000) / 10
      this.setWatch(peer, { stats, grade: grade(stats) })
      grades.push(grade(stats))
    }
    this.onEvent({ type: "grade", grade: grades.length ? worst(grades) : "good" })
  }

  /* ───────────── dono da sala ───────────── */
  admit(peer: string, ok: boolean) { this.sig?.send({ t: "admit", peer, ok }); this.set({ requests: this.state.requests.filter((x) => x.peer !== peer) }) }
  kick(peer: string) { this.sig?.send({ t: "kick", peer }) }
  rotateCode() { this.sig?.send({ t: "rotate" }) }
  /** só o dono: nova senha para quem ainda vai entrar (quem está dentro continua) */
  async setPassword(password: string) {
    if (!this.sig) return
    await this.sig.request({ t: "set", password }, ["password-set"], 8000)
    this.set({ password })
  }
  setApproval(on: boolean) { this.sig?.send({ t: "set", approval: on }) }
  setLocked(on: boolean) { this.sig?.send({ t: "set", locked: on }) }

  /* ───────────── sair ───────────── */
  private finish(msg: string, reason = "") {
    if (this.done) return
    this.cleanup()
    this.set({ ...idleRoom(), phase: "ended", error: msg })
    this.onEvent({ type: "ended", reason })
  }

  private cleanup() {
    this.done = true
    clearInterval(this.statsTimer)
    for (const peer of [...this.outs.keys()]) this.dropOut(peer)
    for (const peer of [...this.ins.keys()]) this.closeIn(peer)
    this.dropPcm()
    stopStream(this.stream); this.stream = null
    this.sig?.close(); this.sig = null
  }

  /** sai da sala (se era o dono, a sala passa para outra pessoa) */
  leave() {
    if (this.done) return
    this.sig?.send({ t: "leave" })
    this.cleanup()
    this.set(idleRoom())
  }

  /** encerra a sala para todo mundo (só o dono) */
  endForAll() {
    if (this.done) return
    this.sig?.send({ t: "end" })
    this.cleanup()
    this.set(idleRoom())
  }
}
