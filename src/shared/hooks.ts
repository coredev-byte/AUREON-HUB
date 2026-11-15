// Assinaturas compartilhadas: cada fonte de dados é assinada uma vez por página (contagem de uso),
// e para quando ninguém mais está olhando. Nada fica rodando à toa.
import { useEffect, useState, useSyncExternalStore } from "react"
import { invoke, on } from "./bridge"
import type { FullscreenState, GamesState, MediaSession, MediaState, Notice, SharePublic, SystemState, Weather } from "./types"

/** fonte de dados com assinatura sob demanda */
function source<T>(sub: string | null, unsub: string | null, event: string, initial: T, get?: string) {
  let value = initial, refs = 0, off: (() => void) | null = null
  const subs = new Set<() => void>()
  const set = (v: T) => { value = v; for (const s of subs) s() }
  return {
    subscribe(cb: () => void) {
      subs.add(cb)
      if (refs++ === 0) {
        off = on(event, (v: T) => set(v))
        const first = sub ?? get
        if (first) void invoke<T>(first).then((v) => { if (v != null) set(v) }).catch(() => {})
      }
      return () => {
        subs.delete(cb)
        if (--refs === 0) { off?.(); off = null; if (unsub) void invoke(unsub).catch(() => {}) }
      }
    },
    get: () => value,
    set,
  }
}

const mediaSrc = source<MediaState>("media:sub", "media:unsub", "media:state", { supported: false, error: "", sessions: [] })
const weatherSrc = source<Weather | { error: string } | null>("weather:sub", "weather:unsub", "weather:state", null)
const systemSrc = source<SystemState | null>("system:sub", "system:unsub", "system:state", null)
const gamesSrc = source<GamesState>(null, null, "games:state", { current: null, history: [] }, "games:get")
const fsSrc = source<FullscreenState | null>(null, null, "fs:state", null, "fs:get")
const noticeSrc = source<Notice[]>(null, null, "notify:list", [], "notify:list")
const shareSrc = source<SharePublic>(null, null, "share:state", { active: false }, "share:get")

const use = <T,>(s: { subscribe: (cb: () => void) => () => void; get: () => T }) => useSyncExternalStore(s.subscribe, s.get)
export const useMediaState = () => use(mediaSrc)
export const useWeather = () => use(weatherSrc)
export const useSystem = () => use(systemSrc)
export const useGames = () => use(gamesSrc)
export const useFullscreen = () => use(fsSrc)
export const useNotices = () => use(noticeSrc)
export const useSharePublic = () => use(shareSrc)
/** para a janela principal atualizar o estado local antes do eco do processo principal */
export const setSharePublicLocal = (s: SharePublic) => shareSrc.set(s)

const IGNORED = /(aureon|widgy|agenda)(\.exe|!|$)/i
/** escolhe a sessão de mídia: a que está tocando, depois a principal (igual ao processo principal) */
export function pickSession(sessions: MediaSession[], filter = ""): MediaSession | null {
  const f = filter.toLowerCase().trim()
  const list = sessions.filter((s) => s.title && s.app && !IGNORED.test(s.app) && (!f || s.app.toLowerCase().includes(f)))
  return list.find((s) => s.playing) ?? list.find((s) => s.primary) ?? list[0] ?? null
}
export function useMedia(filter = "") {
  const st = useMediaState()
  return { session: pickSession(st.sessions, filter), state: st }
}
/** posição atual da música, andando sozinha entre as leituras do Windows */
export function useMediaPosition(s: MediaSession | null) {
  const now = useNow(s?.playing ? 500 : 0)
  if (!s) return 0
  const extra = s.playing ? (now.getTime() - s.at) / 1000 : 0
  return Math.min(s.dur || Infinity, s.pos + Math.max(0, extra))
}
export const mediaCommand = (cmd: "toggle" | "next" | "prev" | "seek", app: string, arg?: number) => invoke("media:cmd", cmd, app, arg)

/**
 * Relógio alinhado ao passo (um re-render por segundo/minuto, não 60 por segundo). step 0 = parado.
 * Pausa sozinho com a página escondida.
 */
export function useNow(stepMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!stepMs) return
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      t = setTimeout(tick, stepMs - (Date.now() % stepMs) + 5)
    }
    const vis = () => { clearTimeout(t); if (!document.hidden) tick() }
    vis()
    document.addEventListener("visibilitychange", vis)
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", vis) }
  }, [stepMs])
  return now
}

export const fmtTime = (s: number) => { const v = Math.max(0, Math.floor(s)); const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), x = v % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0") }
export const fmtBytes = (b: number) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + " GB" : Math.round(b / 1024 ** 2) + " MB")
export const appLabel = (id = "") => {
  const s = id.toLowerCase()
  if (s.includes("spotify")) return "Spotify"
  if (s.includes("youtube") || s.includes("ytmusic")) return "YouTube Music"
  if (s.includes("deezer")) return "Deezer"
  if (s.includes("chrome")) return "Chrome"
  if (s.includes("msedge") || s.includes("edge")) return "Edge"
  if (s.includes("firefox")) return "Firefox"
  if (s.includes("opera")) return "Opera"
  if (s.includes("zunemusic") || s.includes("media player")) return "Media Player"
  return id.split(/[!\\.]/)[0] || "Mídia"
}
