// Captura da tela/janela escolhida. No Electron o processo principal só libera a fonte que o usuário clicou
// no seletor do Aureon (consentimento); os testes automatizados injetam uma fonte própria.
import { invoke } from "@/shared/bridge"
import type { Profile } from "./quality"

export interface CaptureOpts { sourceId: string; audio: boolean; profile: Profile; motion: boolean }
type TestHook = (o: CaptureOpts) => Promise<MediaStream>
declare global { interface Window { __aureonTestCapture?: TestHook } }

export async function captureSource(o: CaptureOpts): Promise<MediaStream> {
  let stream: MediaStream
  if (window.__aureonTestCapture) stream = await window.__aureonTestCapture(o)
  else {
    await invoke("share:select", o.sourceId, o.audio)
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: o.profile.fps, max: o.profile.fps }, width: { max: o.profile.width }, height: { max: o.profile.height } },
        audio: o.audio,
      })
    } catch (e: any) {
      if (e?.name === "NotAllowedError") throw new Error("A captura foi negada. Escolha a tela de novo.")
      if (e?.name === "NotReadableError") throw new Error("O Windows não deixou capturar esta fonte (pode ser uma janela protegida).")
      throw new Error("Não foi possível capturar a tela: " + (e?.message || e))
    }
  }
  const v = stream.getVideoTracks()[0]
  if (!v) { stream.getTracks().forEach((t) => t.stop()); throw new Error("A fonte não tem vídeo.") }
  // dica para o codificador: texto nítido (60 fps só faz sentido para movimento)
  v.contentHint = o.motion ? "motion" : "detail"
  try { await v.applyConstraints({ frameRate: { max: o.profile.fps }, width: { max: o.profile.width }, height: { max: o.profile.height } }) } catch { /* nem toda fonte aceita */ }
  return stream
}

export const stopStream = (s: MediaStream | null) => { s?.getTracks().forEach((t) => { try { t.stop() } catch { /* já parou */ } }) }
