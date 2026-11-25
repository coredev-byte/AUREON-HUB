// Tipos do estado salvo (espelham electron/core/defaults.cjs) e dos eventos do processo principal.

export interface City { name: string; lat: number; lon: number }
export type UiFont = "inter" | "grotesk" | "outfit" | "jetbrains" | "orbitron" | "playfair"
export type NumFont = "grotesk" | "inter" | "outfit" | "jetbrains" | "orbitron" | "vt323" | "sharetech" | "majormono"
export interface Settings {
  accent: string; surface: string; font: UiFont; numFont: NumFont; radius: number; reduceMotion: boolean
  animSpeed: number; textScale: number; hour12: boolean
  widgetBg: number; widgetBlur: number; widgetBorder: boolean; widgetShadow: "none" | "soft" | "strong"; widgetRadius: number
  notchColor: "black" | "graphite" | "surface" | "glass"; notchBorder: boolean
  launchAtLogin: boolean; signalUrl: string; city: City | null; units: "c" | "f"
  hotkey: string; hotkeyOn: boolean; onboarded: boolean
  autoCheck: boolean; autoUpdate: boolean
}
export interface NotchSettings {
  enabled: boolean; displays: "primary" | "all"; idleClock: boolean; hoverExpand: boolean; hoverDelay: number
  scale: number; showMedia: boolean; mediaSource: string; notifications: boolean; fullscreenIndicator: boolean; intro: boolean
}
export interface WidgetsSettings { enabled: boolean; activeProfile: string; hideFullscreen: boolean; editMode: boolean }
export type WidgetType = "clock" | "weather" | "media" | "system" | "games" | "pet" | "note" | "cs2" | "valorant" | "football" | "team" | "valagent"
export interface WidgetInstance {
  id: string; type: WidgetType; display: string
  x: number; y: number; w: number; h: number
  opacity: number; locked: boolean; enabled: boolean
  font: "inter" | "grotesk" | "mono"; color: string
  bg?: WidgetBg; textColor?: string
  config: Record<string, unknown>
}
export type WidgetBg = "default" | "glass" | "solid" | "none"
export interface Profile { id: string; name: string; widgets: WidgetInstance[] }
export interface ShareSettings { quality: "auto" | "eco" | "balanced" | "quality"; resolution: "auto" | "720" | "900" | "1080" | "1440" | "2160" | "native"; audioMode: "all" | "no-discord"; audio: boolean; approval: boolean; preferHardware: boolean; name: string }
export interface AppState {
  settings: Settings; notch: NotchSettings; widgets: WidgetsSettings; profiles: { items: Profile[] }; share: ShareSettings
}
export type Section = keyof AppState

export interface MediaSession {
  app: string; title: string; artist: string; album: string; playing: boolean; pos: number; dur: number
  art: string | null; primary: boolean; canNext?: boolean; canPrev?: boolean; canSeek?: boolean; at: number
  /** quando o Windows atualizou a posição (ms desde 1970); 0 se o player não informa */
  upd?: number
  shuffle?: boolean; repeat?: number; canShuffle?: boolean; canRepeat?: boolean
}
export interface MediaState { supported: boolean; error: string; sessions: MediaSession[] }

export interface WeatherDay { date: string; code: number; max: number; min: number; rain: number | null; kind: WeatherKind }
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm"
export interface Weather {
  city: string; temp: number; feels: number; humidity: number; wind: number; code: number; label: string
  kind: WeatherKind; isDay: boolean; days: WeatherDay[]; at: number; stale?: boolean; error?: string
}

export interface SystemState {
  cpu: number; cores: number; cpuName: string; memTotal: number; memUsed: number; uptime: number
  app: { cpu: number; mem: number; processes: { type: string; name: string; cpu: number; mem: number }[] }; at: number
}
export interface FullscreenState { fs: boolean; exe: string; displayId: string | null; quns: number; since: number; helper: string }
export interface Game { exe: string; name: string; color: string; known: boolean; since: number; displayId?: string | null; ended?: number }
export interface GamesState { current: Game | null; history: Game[] }

export interface Notice {
  id: string; at: number; read: boolean; kind: "info" | "media" | "share" | "request" | "alert" | "game"
  title: string; body: string; image: string; actions: { id: string; label: string }[]; target: string; ref: string; sticky: boolean
}

export interface DisplayInfo { id: string; label: string; bounds: Rect; workArea: Rect; scale: number; primary: boolean }
export interface Rect { x: number; y: number; width: number; height: number }
export interface AppInfo { version: string; platform: string; electron: string; chrome: string; displays: DisplayInfo[]; display: string | null }

export interface ShareSource { id: string; name: string; kind: "screen" | "window"; displayId: string; thumb: string; icon: string }

/** estado da transmissão publicado pela janela principal para o notch e a bandeja */
export interface SharePublic {
  active: boolean
  role?: "host" | "viewer"
  phase?: string
  source?: string
  startedAt?: number
  viewers?: number
  requests?: number
  connection?: "good" | "fair" | "poor" | "reconnecting" | "offline"
  code?: string
  quality?: string
  audio?: boolean
  /** nomes de quem estou assistindo */
  hostName?: string
  /** pessoas na sala, quantas transmitem e se sou o dono */
  members?: number
  live?: number
  owner?: boolean
}

/** estado do atualizador (electron/core/updater.cjs) */
export interface UpdateState {
  status: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error"
  current: string; version: string; percent: number; error: string; notes: string
  supported: boolean; reason: string; checkedAt: number
}
