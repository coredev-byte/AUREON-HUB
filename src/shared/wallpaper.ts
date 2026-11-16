// Papel de parede para o "vidro" dos widgets (ver electron/integrations/wallpaper.cjs).
// O widget desenha uma miniatura do papel de parede, desfocada e alinhada com a tela, por trás de si.
import { useEffect, useState } from "react"
import { invoke, on } from "./bridge"

import type { WallpaperStyle } from "./wallpaperPlacement.ts"
export type { WallpaperStyle }
export type Wallpaper =
  | { kind: "image"; url: string; style: WallpaperStyle; width: number; height: number; color: string | null }
  | { kind: "color"; color: string }
  | { kind: "none"; reason: string }

let current: Wallpaper | null = null
const subs = new Set<(w: Wallpaper) => void>()
let started = false
function start() {
  if (started) return
  started = true
  on("wallpaper:changed", (w: Wallpaper) => { current = w; subs.forEach((f) => f(w)) })
  void invoke("wallpaper:get").then((w: Wallpaper) => { if (w) { current = w; subs.forEach((f) => f(w)) } }).catch(() => {})
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
