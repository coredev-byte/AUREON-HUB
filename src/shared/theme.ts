// Identidade Carbono: preto profundo e grafite, texto neutro, uma cor de destaque usada com parcimônia.
import { useEffect } from "react"
import type { Settings } from "./types"

const hex = (c: string) => (/^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "") : "0e0e10")
export function luminance(c: string) {
  const h = hex(c)
  const ch = [0, 2, 4].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
/** camadas de superfície derivadas da cor de fundo (claras sobre escuro) */
export function surfaceVars(bg: string) {
  const c = "#" + hex(bg)
  const mix = (pct: number) => `color-mix(in srgb, ${c} ${100 - pct}%, #ffffff)`
  return { "--bg": c, "--s1": mix(4), "--s2": mix(7.5), "--s3": mix(12), "--s4": mix(17) }
}
/** texto legível sobre a cor de destaque */
export const onAccent = (accent: string) => (luminance(accent) > 0.45 ? "#0b0b0c" : "#ffffff")

export function applyTheme(s: Pick<Settings, "accent" | "surface" | "font" | "radius" | "reduceMotion">, root = document.documentElement) {
  const vars: Record<string, string> = {
    ...surfaceVars(s.surface),
    "--accent": s.accent,
    "--on-accent": onAccent(s.accent),
    "--accent-soft": `color-mix(in srgb, ${s.accent} 16%, transparent)`,
    "--radius": s.radius + "px",
    "--font-ui": s.font === "grotesk" ? "'Space Grotesk Variable', 'Inter Variable', system-ui, sans-serif" : "'Inter Variable', system-ui, sans-serif",
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.motion = s.reduceMotion ? "reduce" : "full"
}

export function useTheme(s: Settings | null) {
  useEffect(() => { if (s) applyTheme(s) }, [s?.accent, s?.surface, s?.font, s?.radius, s?.reduceMotion])
}
