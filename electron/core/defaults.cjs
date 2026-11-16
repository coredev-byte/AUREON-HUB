"use strict"
// Valores padrão e validação do estado salvo. Tudo que vem das janelas passa por aqui antes de ser gravado.

const SECTIONS = ["settings", "notch", "widgets", "profiles", "share"]

const ACCENT = "#0B7BFA" // azul da marca Aureon

const DEFAULTS = {
  settings: {
    accent: ACCENT,
    surface: "#0E0E10",
    font: "inter",
    /** fonte dos números (relógios, placares) */
    numFont: "grotesk",
    radius: 14,
    reduceMotion: false,
    /** velocidade das animações: 0,6 (rápidas) a 1,6 (calmas) */
    animSpeed: 1,
    /** tamanho do texto da janela principal (0,9 a 1,15) */
    textScale: 1,
    hour12: false,
    /** visual padrão dos widgets */
    widgetBg: 0.88,
    widgetBlur: 14,
    widgetBorder: true,
    widgetShadow: "soft",
    widgetRadius: 14,
    /** cor do notch: "black" (some na moldura do monitor), "graphite" ou "surface" (a do tema) */
    notchColor: "black",
    notchBorder: false,
    launchAtLogin: false,
    /** servidor de sinalização da transmissão (wss://...) */
    signalUrl: "",
    city: null,
    units: "c",
    hotkey: "CommandOrControl+Alt+Space",
    hotkeyOn: true,
    onboarded: false,
    /** procura atualização sozinho (ao abrir e a cada 4 h) */
    autoCheck: true,
    /** baixa sozinho quando acha (instalar continua sendo um clique seu) */
    autoUpdate: true,
  },
  notch: {
    enabled: true,
    /** "primary" = só no monitor principal; "all" = em todos */
    displays: "primary",
    idleClock: true,
    hoverExpand: true,
    hoverDelay: 140,
    scale: 1,
    showMedia: true,
    mediaSource: "",
    notifications: true,
    /** mostra uma pílula mínima (sem cliques) sobre aplicativos em tela cheia enquanto transmite */
    fullscreenIndicator: true,
    /** animação de abertura (logo que vira o notch) ao iniciar o app */
    intro: true,
  },
  widgets: {
    enabled: true,
    activeProfile: "padrao",
    hideFullscreen: true,
    editMode: false,
  },
  profiles: {
    items: [{ id: "padrao", name: "Padrão", widgets: [] }],
  },
  share: {
    quality: "auto",
    audio: false,
    approval: true,
    preferHardware: true,
    name: "",
  },
}

const clone = (v) => JSON.parse(JSON.stringify(v))
const fresh = () => clone(DEFAULTS)
const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s)
const clamp = (n, a, b, d) => (Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d)
const str = (s, max, d = "") => (typeof s === "string" ? s.slice(0, max) : d)

const WIDGET_TYPES = ["clock", "weather", "media", "system", "games", "pet", "note", "cs2", "valorant", "football", "team", "valagent"]

function sanitizeWidget(w) {
  if (!w || typeof w !== "object" || !WIDGET_TYPES.includes(w.type)) return null
  const id = str(w.id, 40)
  if (!/^[a-z0-9-]{4,40}$/i.test(id)) return null
  const config = w.config && typeof w.config === "object" ? JSON.parse(JSON.stringify(w.config)) : {}
  if (JSON.stringify(config).length > 20000) return null
  return {
    id,
    type: w.type,
    display: str(String(w.display ?? ""), 32),
    x: Math.round(clamp(w.x, -4000, 16000, 80)),
    y: Math.round(clamp(w.y, -4000, 16000, 80)),
    w: Math.round(clamp(w.w, 80, 2000, 260)),
    h: Math.round(clamp(w.h, 60, 2000, 160)),
    opacity: clamp(w.opacity, 0.2, 1, 1),
    locked: !!w.locked,
    enabled: w.enabled !== false,
    font: ["inter", "grotesk", "mono"].includes(w.font) ? w.font : "inter",
    color: isHex(w.color) ? w.color : "",
    /** fundo do quadro: padrão do tema, vidro, sólido ou sem fundo */
    bg: ["default", "glass", "solid", "none"].includes(w.bg) ? w.bg : "default",
    textColor: isHex(w.textColor) ? w.textColor : "",
    config,
  }
}

function sanitize(section, v) {
  const d = DEFAULTS[section]
  if (section === "profiles") {
    const items = Array.isArray(v?.items) ? v.items : []
    const out = []
    for (const p of items.slice(0, 20)) {
      const id = str(p?.id, 40)
      if (!/^[a-z0-9-]{2,40}$/i.test(id) || out.some((x) => x.id === id)) continue
      const widgets = (Array.isArray(p.widgets) ? p.widgets : []).slice(0, 60).map(sanitizeWidget).filter(Boolean)
      out.push({ id, name: str(p.name, 40, "Perfil") || "Perfil", widgets })
    }
    return { items: out.length ? out : clone(d.items) }
  }
  const out = {}
  for (const k of Object.keys(d)) {
    const def = d[k], val = v?.[k]
    if (val === undefined) { out[k] = clone(def); continue }
    if (typeof def === "boolean") out[k] = !!val
    else if (typeof def === "number") out[k] = Number.isFinite(val) ? val : def
    else if (typeof def === "string") out[k] = typeof val === "string" ? val.slice(0, 300) : def
    else out[k] = val
  }
  if (section === "settings") {
    if (!isHex(out.accent)) out.accent = d.accent
    if (!isHex(out.surface)) out.surface = d.surface
    const FONTS = ["inter", "grotesk", "outfit", "jetbrains", "orbitron", "playfair"]
    const NUMS = ["grotesk", "inter", "outfit", "jetbrains", "orbitron", "vt323", "sharetech", "majormono"]
    if (!FONTS.includes(out.font)) out.font = d.font
    if (!NUMS.includes(out.numFont)) out.numFont = d.numFont
    out.animSpeed = clamp(out.animSpeed, 0.6, 1.6, 1)
    out.textScale = clamp(out.textScale, 0.9, 1.15, 1)
    out.widgetBg = clamp(out.widgetBg, 0.2, 1, 0.88)
    out.widgetBlur = clamp(out.widgetBlur, 0, 30, 14)
    out.widgetRadius = clamp(out.widgetRadius, 4, 28, 14)
    if (!["none", "soft", "strong"].includes(out.widgetShadow)) out.widgetShadow = "soft"
    if (!["black", "graphite", "surface"].includes(out.notchColor)) out.notchColor = "black"
    out.radius = clamp(out.radius, 6, 22, d.radius)
    out.units = out.units === "f" ? "f" : "c"
    if (out.signalUrl && !/^wss?:\/\/[^\s]+$/i.test(out.signalUrl)) out.signalUrl = ""
    const c = out.city
    out.city = c && typeof c === "object" && Number.isFinite(c.lat) && Number.isFinite(c.lon)
      ? { name: str(c.name, 80), lat: clamp(c.lat, -90, 90, 0), lon: clamp(c.lon, -180, 180, 0) } : null
  }
  if (section === "notch") {
    out.displays = out.displays === "all" ? "all" : "primary"
    out.scale = clamp(out.scale, 0.85, 1.25, 1)
    out.hoverDelay = clamp(out.hoverDelay, 0, 800, 140)
  }
  if (section === "share") {
    if (!["auto", "eco", "balanced", "quality"].includes(out.quality)) out.quality = "auto"
    out.name = str(out.name, 40)
  }
  return out
}

function migrate(raw) {
  const base = fresh()
  if (!raw || typeof raw !== "object") return base
  for (const s of SECTIONS) if (raw[s]) base[s] = sanitize(s, raw[s])
  return base
}

module.exports = { SECTIONS, DEFAULTS, WIDGET_TYPES, fresh, sanitize, sanitizeWidget, migrate }
