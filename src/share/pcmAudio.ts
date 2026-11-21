// Som do PC SEM o Discord para a transmissão. O Windows separa o som por programa (captura "por processo",
// Windows 10 2004+ ou 11): o processo principal exclui a árvore de processos do Discord e manda o PCM para cá,
// onde ele vira uma trilha de áudio comum (AudioWorklet -> MediaStream). Ver electron/integrations/widgy/sysaudio.cjs.
import { invoke, on } from "@/shared/bridge"

export interface PcmAudio {
  track: MediaStreamTrack
  /** "discord" = o Discord foi encontrado e está fora; "agenda" = Discord fechado (só o próprio Aureon fica fora) */
  excluded: "discord" | "agenda"
  stop(): void
}
type TestHook = (push: (chunk: ArrayBuffer) => void) => { excluded: "discord" | "agenda"; stop: () => void }
declare global { interface Window { __aureonTestSysAudio?: TestHook } }

export async function startPcmAudio(onEnd: (error: string) => void): Promise<PcmAudio> {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" })
  await ctx.audioWorklet.addModule("./pcm-worklet.js")
  const node = new AudioWorkletNode(ctx, "aureon-pcm", { numberOfInputs: 0, outputChannelCount: [2] })
  const dest = ctx.createMediaStreamDestination()
  node.connect(dest)
  // os pedaços chegam com tamanho qualquer: guarda o resto para não partir uma amostra no meio
  let rest = new Uint8Array(0)
  const push = (buf: ArrayBuffer | Uint8Array) => {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    const all = new Uint8Array(rest.length + b.length)
    all.set(rest); all.set(b, rest.length)
    const usable = all.length - (all.length % 4)
    rest = all.slice(usable)
    if (usable) { const out = all.slice(0, usable).buffer; node.port.postMessage(out, [out]) }
  }
  let excluded: "discord" | "agenda" = "agenda"
  let stopSource = () => {}
  let ended = false
  const end = (msg: string) => { if (!ended) { ended = true; onEnd(msg) } }
  if (window.__aureonTestSysAudio) {
    const t = window.__aureonTestSysAudio((c) => push(c))
    excluded = t.excluded; stopSource = t.stop
  } else {
    const offData = on("sysaudio:data", (c: Uint8Array) => push(c))
    const offEnd = on("sysaudio:end", (e: string) => end(e || "a captura do som parou"))
    const r = await invoke<{ ok: boolean; excluded?: "discord" | "agenda" }>("sysaudio:start", "discord").catch(() => null)
    if (!r?.ok) { offData(); offEnd(); void ctx.close(); throw new Error("Separar o som do Discord só funciona no app do Windows.") }
    excluded = r.excluded === "discord" ? "discord" : "agenda"
    stopSource = () => { offData(); offEnd(); void invoke("sysaudio:stop").catch(() => {}) }
  }
  const track = dest.stream.getAudioTracks()[0]
  return {
    track, excluded,
    stop() { ended = true; stopSource(); try { track.stop() } catch { /* já parou */ } void ctx.close().catch(() => {}) },
  }
}

/** texto do erro do Windows para a pessoa (o helper devolve "ativar 8007..." quando o Windows não suporta) */
export function audioError(raw: string) {
  if (/ativar|80070057|80004002|80040154/i.test(raw)) return "Este Windows não separa o som por programa (precisa do Windows 10 versão 2004 ou mais novo, ou Windows 11). A transmissão continua sem som."
  return "O som do PC parou (" + raw.slice(0, 80) + "). A transmissão continua sem som."
}
