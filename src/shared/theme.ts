// Identidade Carbono: preto profundo e grafite, texto neutro, uma cor de destaque usada com parcimônia.
// Tudo o que é personalizável vira variável CSS aqui (app, notch e widgets leem as mesmas).
import { useEffect } from "react"
import type { NumFont, Settings, UiFont } from "./types"

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

export const UI_FONTS: Record<UiFont, { label: string; family: string }> = {
  inter: { label: "Inter", family: "'Inter Variable', system-ui, sans-serif" },
  grotesk: { label: "Space Grotesk", family: "'Space Grotesk Variable', 'Inter Variable', sans-serif" },
  outfit: { label: "Outfit", family: "'Outfit Variable', 'Inter Variable', sans-serif" },
  jetbrains: { label: "JetBrains Mono", family: "'JetBrains Mono Variable', ui-monospace, monospace" },
  orbitron: { label: "Orbitron", family: "'Orbitron Variable', 'Inter Variable', sans-serif" },
  playfair: { label: "Playfair Display", family: "'Playfair Display Variable', Georgia, serif" },
}
export const NUM_FONTS: Record<NumFont, { label: string; family: string }> = {
  grotesk: { label: "Space Grotesk", family: "'Space Grotesk Variable', 'Inter Variable', sans-serif" },
  inter: { label: "Inter", family: "'Inter Variable', system-ui, sans-serif" },
  outfit: { label: "Outfit", family: "'Outfit Variable', sans-serif" },
  jetbrains: { label: "JetBrains Mono", family: "'JetBrains Mono Variable', ui-monospace, monospace" },
  orbitron: { label: "Orbitron", family: "'Orbitron Variable', sans-serif" },
  vt323: { label: "VT323 (retrô)", family: "'VT323', monospace" },
  sharetech: { label: "Share Tech Mono", family: "'Share Tech Mono', monospace" },
  majormono: { label: "Major Mono", family: "'Major Mono Display', monospace" },
}
const SHADOW = { none: "none", soft: "0 8px 24px rgba(0,0,0,.28)", strong: "0 16px 44px rgba(0,0,0,.5)" }
const NOTCH = { black: "#050506", graphite: "#16161a" }

type ThemeInput = Pick<Settings, "accent" | "surface" | "font" | "radius" | "reduceMotion"> & Partial<Settings>
export function applyTheme(s: ThemeInput, root = document.documentElement) {
  const speed = s.animSpeed ?? 1
  const vars: Record<string, string> = {
    ...surfaceVars(s.surface),
    "--accent": s.accent,
    "--on-accent": onAccent(s.accent),
    "--accent-soft": `color-mix(in srgb, ${s.accent} 16%, transparent)`,
    "--radius": s.radius + "px",
    "--font-ui": (UI_FONTS[s.font as UiFont] ?? UI_FONTS.inter).family,
    "--font-num": (NUM_FONTS[(s.numFont ?? "grotesk") as NumFont] ?? NUM_FONTS.grotesk).family,
    "--t-fast": Math.round(120 * speed) + "ms",
    "--t": Math.round(200 * speed) + "ms",
    "--t-slow": Math.round(320 * speed) + "ms",
    "--wg-alpha": Math.round((s.widgetBg ?? 0.88) * 100) + "%",
    "--wg-blur": (s.widgetBlur ?? 14) + "px",
    "--wg-border": s.widgetBorder === false ? "transparent" : "var(--line)",
    "--wg-shadow": SHADOW[s.widgetShadow ?? "soft"],
    "--wg-radius": (s.widgetRadius ?? 14) + "px",
    "--notch-bg": s.notchColor === "surface" ? "var(--bg)" : NOTCH[s.notchColor === "graphite" ? "graphite" : "black"],
    "--notch-border": s.notchBorder ? "rgba(255,255,255,.09)" : "transparent",
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.motion = s.reduceMotion ? "reduce" : "full"
}

export function useTheme(s: Settings | null) {
  const key = s ? JSON.stringify([s.accent, s.surface, s.font, s.numFont, s.radius, s.reduceMotion, s.animSpeed, s.widgetBg, s.widgetBlur, s.widgetBorder, s.widgetShadow, s.widgetRadius, s.notchColor, s.notchBorder]) : ""
  useEffect(() => { if (s) applyTheme(s) }, [key])
}

/** hora no formato escolhido (24 h ou 12 h) */
export const fmtClock = (d: Date, hour12 = false) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12 })
