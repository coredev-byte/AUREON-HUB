// Cor predominante da capa (para tingir o painel "transparente" como no vídeo de referência).
// Lê uma miniatura 24×24 num canvas; capas de outros sites só funcionam se o site permitir (CORS) —
// senão fica a cor de destaque do tema. Resultado em cache por endereço.
import { useEffect, useState } from "react"

const cache = new Map<string, string | null>()

/** média ponderada pela saturação (cores vivas pesam mais que cinzas/pretos), clareada para servir de destaque */
export function dominant(data: Uint8ClampedArray): string | null {
  let r = 0, g = 0, b = 0, wsum = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const R = data[i], G = data[i + 1], B = data[i + 2]
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    const sat = max ? (max - min) / max : 0
    const light = max / 255
    const w = 0.08 + sat * sat * 2 * (light > 0.12 ? 1 : 0.2)
    r += R * w; g += G * w; b += B * w; wsum += w
  }
  if (!wsum) return null
  r /= wsum; g /= wsum; b /= wsum
  // garante brilho suficiente para texto/acentos sobre fundo escuro
  const max = Math.max(r, g, b, 1), k = max < 170 ? 170 / max : 1
  const c = (v: number) => Math.round(Math.min(255, v * k))
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`
}

export function useCoverTint(src: string | null | undefined): string | null {
  const [tint, setTint] = useState<string | null>(src ? cache.get(src) ?? null : null)
  useEffect(() => {
    if (!src) { setTint(null); return }
    if (cache.has(src)) { setTint(cache.get(src)!); return }
    let alive = true
    const img = new Image()
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous"
    img.onload = () => {
      let t: string | null = null
      try {
        const c = document.createElement("canvas"); c.width = 24; c.height = 24
        const g = c.getContext("2d", { willReadFrequently: true })!
        g.drawImage(img, 0, 0, 24, 24)
        t = dominant(g.getImageData(0, 0, 24, 24).data)
      } catch { t = null }
      cache.set(src, t)
      if (alive) setTint(t)
    }
    img.onerror = () => { cache.set(src, null); if (alive) setTint(null) }
    img.src = src
    return () => { alive = false }
  }, [src])
  return tint
}
