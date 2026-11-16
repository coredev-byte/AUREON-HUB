// Espectro do som do PC (48 faixas, graves primeiro), calculado no processo principal (portado do Carbono do Widgy).
// Só roda enquanto algum visualizador está na tela e a música está tocando.
import { useEffect } from "react"
import { invoke, on } from "./bridge"

export const spectrum = { bands: new Float32Array(48), level: 0, at: 0 }
let users = 0
let off: (() => void) | null = null

export function useSpectrum(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    if (users++ === 0) {
      off = on("sysaudio:spectrum", (s: { bands: number[]; level: number }) => {
        for (let i = 0; i < 48; i++) {
          const v = s.bands[i] ?? 0, cur = spectrum.bands[i]
          // sobe rápido, desce devagar: acompanha a batida sem tremer
          spectrum.bands[i] = v > cur ? cur + (v - cur) * 0.65 : cur + (v - cur) * 0.2
        }
        spectrum.level = s.level
        spectrum.at = performance.now()
      })
      void invoke("sysaudio:viz", true).catch(() => {})
    }
    return () => {
      if (--users > 0) return
      off?.(); off = null
      void invoke("sysaudio:viz", false).catch(() => {})
      spectrum.bands.fill(0); spectrum.level = 0; spectrum.at = 0
    }
  }, [enabled])
}
/** recebendo o som de verdade agora? (senão os visualizadores usam um ritmo suave de reserva) */
export const liveSpectrum = () => performance.now() - spectrum.at < 600
export const bass = () => (spectrum.bands[1] + spectrum.bands[2] + spectrum.bands[3] + spectrum.bands[4]) / 4

/** laço de animação que para sozinho com a página escondida */
export function rafLoop(step: () => void) {
  let raf = 0, alive = true
  const tick = () => { if (!alive) return; if (!document.hidden) step(); raf = requestAnimationFrame(tick) }
  raf = requestAnimationFrame(tick)
  return () => { alive = false; cancelAnimationFrame(raf) }
}
