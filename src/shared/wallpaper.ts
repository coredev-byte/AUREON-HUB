// Papel de parede para o "vidro" dos widgets (ver electron/integrations/wallpaper.cjs).
// O widget desenha uma miniatura do papel de parede, desfocada e alinhada com a tela, por trás de si.
import { useEffect, useState } from "react"
import { invoke, on } from "./bridge"

import type { WallpaperStyle } from "./wallpaperPlacement.ts"
export type { WallpaperStyle }
export type Wallpaper =
  | { kind: "image"; url: string; style: WallpaperStyle; width: number; height: number; color: string | null; source?: "windows" | "wallpaper-engine" }
  | { kind: "color"; color: string }
  | { kind: "none"; reason: string }

let current: Wallpaper | null = null
const subs = new Set<(w: Wallpaper) => void>()
let started = false
let seq = 0

/**
 * Prévia em GIF (Wallpaper Engine): vira uma imagem parada e leve antes de ir para o vidro.
 * Um GIF animado desfocado seria redesenhado a cada quadro e pesaria no PC à toa.
 */
async function still(w: Wallpaper): Promise<Wallpaper> {
  if (w.kind !== "image" || !w.url.startsWith("data:image/gif")) return w
  try {
    const img = new Image()
    img.src = w.url
    await img.decode()
    const k = Math.min(1, 960 / (img.naturalWidth || 1))
    const c = document.createElement("canvas")
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height)
    return { ...w, url: c.toDataURL("image/jpeg", 0.82), width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return { kind: "none", reason: "Não deu para abrir a prévia do papel de parede" }
  }
}
function set(w: Wallpaper) {
  const n = ++seq
  void still(w).then((s) => { if (n !== seq) return; current = s; subs.forEach((f) => f(s)) })
}
function start() {
  if (started) return
  started = true
  on("wallpaper:changed", (w: Wallpaper) => set(w))
  void invoke("wallpaper:get").then((w: Wallpaper) => { if (w) set(w) }).catch(() => {})
}

export function useWallpaper(enabled = true) {
  const [w, setW] = useState<Wallpaper | null>(current)
  useEffect(() => {
    if (!enabled) return
    start()
    subs.add(setW)
    if (current) setW(current)
    return () => { subs.delete(setW) }
  }, [enabled])
  return enabled ? w : null
}

export { placement } from "./wallpaperPlacement.ts"
