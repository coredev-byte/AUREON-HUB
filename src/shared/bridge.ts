// Acesso ao processo principal. No Electron usa window.aureon (preload); num navegador comum
// (desenvolvimento e testes automatizados) usa uma imitação local, sem fingir dados do Windows.
import type { AppState } from "./types"

type Unsub = () => void
interface Native {
  invoke(channel: string, ...args: unknown[]): Promise<any>
  on(channel: string, fn: (payload: any) => void): Unsub
  platform: string
}

declare global {
  interface Window { aureon?: Native }
}

export const isElectron = typeof window !== "undefined" && !!window.aureon

/* ---------- imitação para o navegador ---------- */
const DEFAULT_STATE: AppState = {
  settings: { accent: "#0B7BFA", surface: "#0E0E10", font: "inter", numFont: "grotesk", radius: 14, reduceMotion: false, animSpeed: 1, textScale: 1, hour12: false, widgetBg: 0.88, widgetBlur: 14, widgetBorder: true, widgetShadow: "soft", widgetRadius: 14, notchColor: "black", notchBorder: false, launchAtLogin: false, signalUrl: "", city: null, units: "c", hotkey: "CommandOrControl+Alt+Space", hotkeyOn: true, onboarded: false, autoCheck: true, autoUpdate: true },
  notch: { enabled: true, displays: "primary", idleClock: true, hoverExpand: true, hoverDelay: 140, scale: 1, showMedia: true, mediaSource: "", notifications: true, fullscreenIndicator: true },
  widgets: { enabled: true, activeProfile: "padrao", hideFullscreen: true, editMode: false },
  profiles: { items: [{ id: "padrao", name: "Padrão", widgets: [] }] },
  share: { quality: "auto", audio: false, approval: true, preferHardware: true, name: "" },
}

function browserBridge(): Native {
  const KEY = "aureon-browser-state"
  const chan = typeof BroadcastChannel === "function" ? new BroadcastChannel("aureon") : null
  const listeners = new Map<string, Set<(p: any) => void>>()
  const emit = (ch: string, p: unknown, remote = false) => {
    for (const fn of listeners.get(ch) ?? []) fn(p)
    if (!remote) chan?.postMessage({ ch, p })
  }
  chan?.addEventListener("message", (e) => emit(e.data.ch, e.data.p, true))
  const load = (): AppState => {
    try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) return { ...DEFAULT_STATE, ...s } } catch { /* sem armazenamento */ }
    return structuredClone(DEFAULT_STATE)
  }
  let state = load()
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignora */ } }
  let notices: any[] = []
  let share: any = { active: false }
  const handlers: Record<string, (...a: any[]) => any> = {
    "store:get": () => state,
    "store:patch": (section: keyof AppState, value: object) => {
      state = { ...state, [section]: { ...(state[section] as object), ...value } } as AppState; save()
      emit("store:changed", { section, value: state[section] }); return state[section]
    },
    "store:replace": (section: keyof AppState, value: object) => {
      state = { ...state, [section]: value } as AppState; save()
      emit("store:changed", { section, value }); return value
    },
    "media:sub": () => ({ supported: false, error: "", sessions: [] }), "media:unsub": () => {}, "media:cmd": () => false,
    "system:sub": () => null, "system:unsub": () => {},
    "weather:sub": async () => ({ error: "O clima é buscado pelo app desktop." }), "weather:unsub": () => {}, "weather:refresh": async () => null,
    "weather:search": async () => [],
    "games:get": () => ({ current: null, history: [] }),
    "net:text": async (url: string) => (await fetch(url)).text(),
    "sports:get": async () => [], "sports:teams": async () => [], "team:search": async () => [], "team:card": async () => null,
    "valorant:agent": () => null,
    "fs:get": () => ({ fs: false, exe: "", displayId: null, quns: 0, since: Date.now(), helper: "navegador" }),
    "share:sources": () => [{ id: "screen:0:0", name: "Tela inteira", kind: "screen", displayId: "0", thumb: "", icon: "" }],
    "share:select": () => ({ ok: true, audioSupported: false }),
    "share:publish": (s: any) => { share = s; emit("share:state", s); return true },
    "share:get": () => share,
    "share:command": (cmd: string, ...args: unknown[]) => { emit("share:command", { cmd, args }); return true },
    "share:probe": async (url: string) => {
      const t0 = performance.now()
      try {
        const u = new URL(url); u.protocol = u.protocol === "wss:" ? "https:" : "http:"; u.pathname = "/health"
        const j = await (await fetch(u)).json()
        return j.service === "aureon-signal" ? { ok: true, ms: Math.round(performance.now() - t0), version: j.version, turn: j.turn } : { ok: false, kind: "wrong", error: "Não é um servidor Aureon", ms: 0 }
      } catch (e) { return { ok: false, kind: "other", error: String(e), ms: Math.round(performance.now() - t0) } }
    },
    "notify:push": (n: any) => { const x = { id: "n" + Date.now() + Math.random(), at: Date.now(), read: false, kind: "info", body: "", image: "", actions: [], target: "", ref: "", sticky: false, ...n }; notices = [x, ...notices].slice(0, 60); emit("notify:new", x); emit("notify:list", notices); return x },
    "notify:list": () => notices,
    "notify:dismiss": (id: string) => { notices = notices.filter((n) => n.id !== id); emit("notify:list", notices) },
    "notify:read": () => { notices = notices.map((n) => ({ ...n, read: true })); emit("notify:list", notices) },
    "notify:clear": () => { notices = []; emit("notify:list", notices) },
    "notify:action": (id: string, action: string) => {
      const n = notices.find((x) => x.id === id); if (!n) return false
      notices = notices.filter((x) => x.id !== id); emit("notify:list", notices)
      if (n.target === "main") emit("share:command", { cmd: action === "accept" ? "admit" : "deny", args: [n.ref] })
      return true
    },
    "notch:interactive": () => {}, "notch:menu": () => {}, "widgets:interactive": () => {},
    "app:open": (page: string, params: unknown) => { emit("nav", { page, params: params ?? {} }); return true },
    "app:info": () => ({ version: "dev", platform: "browser", electron: "", chrome: "", displays: [{ id: "0", label: "Navegador", bounds: { x: 0, y: 0, width: innerWidth, height: innerHeight }, workArea: { x: 0, y: 0, width: innerWidth, height: innerHeight }, scale: devicePixelRatio, primary: true }], display: "0" }),
    "app:metrics": () => ({ processes: [], windows: { notch: 0, widgets: 0 }, fullscreen: null, media: null, share }),
    "app:external": (url: string) => { window.open(url, "_blank") },
    "app:quit": () => {}, "win:cmd": () => {},
    "update:get": () => ({ status: "idle", current: "dev", version: "", percent: 0, error: "", notes: "", supported: false, reason: "Atualização só no app instalado.", checkedAt: 0 }),
    "update:check": () => null, "update:download": () => null, "update:install": () => false,
  }
  return {
    platform: "browser",
    async invoke(channel, ...args) {
      const h = handlers[channel]
      if (!h) throw new Error("Canal não permitido: " + channel)
      return h(...args)
    },
    on(channel, fn) {
      const set = listeners.get(channel) ?? new Set()
      set.add(fn); listeners.set(channel, set)
      return () => set.delete(fn)
    },
  }
}

export const native: Native = (typeof window !== "undefined" && window.aureon) || browserBridge()
export const invoke = <T = any>(channel: string, ...args: unknown[]): Promise<T> => native.invoke(channel, ...args)
export const on = (channel: string, fn: (payload: any) => void): Unsub => native.on(channel, fn)
