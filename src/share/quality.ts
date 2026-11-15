// Perfis de qualidade e o ajuste automático pela rede. Sem dependências (testado em tests/share-quality.test.mjs).
import type { LinkStats } from "./rtc"

export type QualityId = "auto" | "eco" | "balanced" | "quality"
export interface Profile { id: QualityId; label: string; desc: string; width: number; height: number; fps: number; maxKbps: number; startKbps: number }

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
    if (prm.maxKbps < 1200 && prm.scale < 2) prm.scale = Math.min(2, Math.round(prm.scale * 1.5 * 100) / 100)
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
