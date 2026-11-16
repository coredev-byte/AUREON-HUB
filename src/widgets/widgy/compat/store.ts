// Estado de compatibilidade para os widgets do Widgy (Valorant, esportes, clima).
// Lê do estado do Aureon e guarda o que é só desses widgets (modelos do Valorant, imagens próprias) no
// armazenamento local da origem do app, que é o mesmo para todas as janelas (e avisa as outras janelas).
import { create } from "zustand"
import { on, invoke } from "@/shared/bridge"
import { useAppStore } from "@/shared/state"
import type { MediaItem } from "./types"
import type { ValAgentNow } from "./bridge"

export interface ValTemplateLike { id: string; name: string; agent?: string; look: Record<string, unknown> }
interface S {
  settings: { animations: boolean; weatherCity: string; weatherCoords: { lat: number; lon: number } | null; favBySport: Record<string, string[]> }
  valAgentNow: ValAgentNow | null
  valTemplates: ValTemplateLike[]
  gamesRunning: { id: string; start: number }[]
  media: MediaItem[]
  addMedia: (items: MediaItem[]) => MediaItem[]
}
const K_TPL = "aureon-val-templates", K_MEDIA = "aureon-media"
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { console.warn("sem espaço para salvar", k, e) } }

export const useStore = create<S>((set, get) => ({
  settings: { animations: true, weatherCity: "", weatherCoords: null, favBySport: {} },
  valAgentNow: null,
  valTemplates: read<ValTemplateLike[]>(K_TPL, []),
  gamesRunning: [],
  media: read<MediaItem[]>(K_MEDIA, []),
  addMedia: (items) => { const media = [...items, ...get().media].slice(0, 40); set({ media }); return items },
}))

// salva modelos e imagens quando mudam; outras janelas recebem pelo evento "storage"
useStore.subscribe((s, p) => {
  if (s.valTemplates !== p.valTemplates) write(K_TPL, s.valTemplates)
  if (s.media !== p.media) write(K_MEDIA, s.media)
})
addEventListener("storage", (e) => {
  if (e.key === K_TPL) useStore.setState({ valTemplates: read(K_TPL, []) })
  if (e.key === K_MEDIA) useStore.setState({ media: read(K_MEDIA, []) })
})
// configurações do Aureon que esses widgets usam
const sync = () => {
  const st = useAppStore.getState().state
  if (!st) return
  useStore.setState((s) => ({ settings: { ...s.settings, animations: !st.settings.reduceMotion, weatherCity: st.settings.city?.name?.split(",")[0] ?? "", weatherCoords: st.settings.city ? { lat: st.settings.city.lat, lon: st.settings.city.lon } : null } }))
}
useAppStore.subscribe(sync); sync()
// agente do Valorant e jogo aberto
void invoke("valorant:agent").then((a) => useStore.setState({ valAgentNow: a ?? null })).catch(() => {})
on("valorant:agent", (a: ValAgentNow | null) => useStore.setState({ valAgentNow: a ?? null }))
const games = (g: { current: { exe: string } | null }) => useStore.setState({ gamesRunning: g?.current && /valorant/i.test(g.current.exe) ? [{ id: "valorant", start: (g.current as any).since ?? Date.now() }] : [] })
void invoke("games:get").then(games).catch(() => {})
on("games:state", games)
