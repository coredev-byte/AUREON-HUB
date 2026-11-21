// Perfis de qualidade e o ajuste automático pela rede. Sem dependências (testado em tests/share-quality.test.mjs).
import type { LinkStats } from "./rtc"

export type QualityId = "auto" | "eco" | "balanced" | "quality"
export interface Profile {
  id: QualityId; label: string; desc: string; width: number; height: number; fps: number; maxKbps: number; startKbps: number
  /** resolução escolhida pela pessoa: a rede reduz taxa e quadros, nunca a resolução */
  fixedRes?: boolean
}

/** resolução de envio (a altura; a largura acompanha o formato da tela, inclusive ultrawide) */
export type ResolutionId = "auto" | "720" | "900" | "1080" | "1440" | "2160" | "native"
export const RESOLUTIONS: { id: ResolutionId; label: string; height: number }[] = [
  { id: "auto", label: "Automática", height: 0 },
  { id: "720", label: "720p", height: 720 },
  { id: "900", label: "900p", height: 900 },
  { id: "1080", label: "1080p (Full HD)", height: 1080 },
  { id: "1440", label: "1440p (2K)", height: 1440 },
  { id: "2160", label: "2160p (4K)", height: 2160 },
  { id: "native", label: "Original da tela", height: 4320 },
]
const FULL_HD = 1920 * 1080

/**
 * Perfil de qualidade com a resolução escolhida. A taxa acompanha a quantidade de pixels
 * (mais pixels pedem mais Mbit/s para não ficar borrado), com teto de 30 Mbit/s.
 */
export function withResolution(p: Profile, res: ResolutionId = "auto"): Profile {
  const r = RESOLUTIONS.find((x) => x.id === res)
  if (!r || !r.height) return p
  const height = r.height
  // caixa larga o bastante para 21:9; telas 16:9 ficam limitadas pela altura
  const width = Math.round((height * 64) / 27)
  const px = res === "native" ? 2560 * 1440 : Math.round((height * 16) / 9) * height
  const k = Math.pow(px / FULL_HD, 0.75)
  return {
    ...p, width, height, fixedRes: true, desc: `${r.label} · ${p.fps} fps`,
    maxKbps: Math.min(30000, Math.max(1500, Math.round(p.maxKbps * k))),
    startKbps: Math.min(12000, Math.max(1000, Math.round(p.startKbps * k))),
  }
}

export const PROFILES: Record<QualityId, Profile> = {
  eco: { id: "eco", label: "Econômico", desc: "720p · 30 fps", width: 1280, height: 720, fps: 30, maxKbps: 2500, startKbps: 1500 },
  balanced: { id: "balanced", label: "Equilibrado", desc: "1080p · 30 fps", width: 1920, height: 1080, fps: 30, maxKbps: 5000, startKbps: 2500 },
  quality: { id: "quality", label: "Qualidade", desc: "1080p · 60 fps", width: 1920, height: 1080, fps: 60, maxKbps: 9000, startKbps: 4000 },
  // automático: captura até 1080p60 e deixa a rede/CPU decidir taxa, resolução e quadros
  auto: { id: "auto", label: "Automático", desc: "Adaptativo", width: 1920, height: 1080, fps: 60, maxKbps: 8000, startKbps: 2500 },
}

/** parâmetros de envio aplicados em RTCRtpSender.setParameters */
export interface SendParams { maxKbps: number; scale: number; fps: number }
export interface AdaptState { params: SendParams; good: number }

export const initialSend = (p: Profile): AdaptState => ({ params: { maxKbps: p.startKbps, scale: 1, fps: p.fps }, good: 0 })

/**
 * Um passo do controle (a cada ~2 s, por espectador).
 * - rede congestionada (o WebRTC diz "bandwidth", perda alta ou ida e volta alta): reduz a taxa 25%;
 *   abaixo de ~1,2 Mbit/s reduz também a resolução, para a imagem não virar borrão.
 * - processador no limite ("cpu"): reduz quadros por segundo (60 -> 30 -> 24).
 * - três leituras boas seguidas: sobe 15% (até o teto do perfil) e volta resolução/quadros.
 */
export function adapt(st: AdaptState, s: LinkStats | null, p: Profile): AdaptState {
  if (!s) return st
  const prm = { ...st.params }
  const congested = s.limit === "bandwidth" || (s.lossPct ?? 0) > 5 || (s.rttMs ?? 0) > 350
  const cpu = s.limit === "cpu"
  if (congested) {
    prm.maxKbps = Math.max(400, Math.round(prm.maxKbps * 0.75))
    // resolução fixa: em vez de diminuir a imagem, diminui os quadros por segundo
    if (prm.maxKbps < 1200 && p.fixedRes) prm.fps = Math.max(15, prm.fps > 30 ? 30 : prm.fps - 5)
    else if (prm.maxKbps < 1200 && prm.scale < 2) prm.scale = Math.min(2, Math.round(prm.scale * 1.5 * 100) / 100)
    return { params: prm, good: 0 }
  }
  if (cpu) {
    prm.fps = prm.fps > 30 ? 30 : Math.max(15, prm.fps - 6)
    return { params: prm, good: 0 }
  }
  const good = st.good + 1
  if (good < 3) return { params: prm, good }
  prm.maxKbps = Math.min(p.maxKbps, Math.round(prm.maxKbps * 1.15))
  if (prm.scale > 1 && prm.maxKbps >= 1800) prm.scale = Math.max(1, Math.round((prm.scale / 1.5) * 100) / 100)
  if (prm.fps < p.fps) prm.fps = Math.min(p.fps, prm.fps + 6)
  return { params: prm, good: 0 }
}

/** qualidade da conexão para mostrar no notch e no painel */
export function grade(s: LinkStats | null): "good" | "fair" | "poor" {
  if (!s) return "fair"
  const loss = s.lossPct ?? 0, rtt = s.rttMs ?? 0
  if (loss > 8 || rtt > 400 || s.limit === "bandwidth") return "poor"
  if (loss > 2 || rtt > 180 || s.limit === "cpu") return "fair"
  return "good"
}
export const worst = (list: ("good" | "fair" | "poor")[]) => (list.includes("poor") ? "poor" : list.includes("fair") ? "fair" : "good")
