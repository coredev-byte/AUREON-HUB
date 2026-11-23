// Catálogo de widgets: metadados, tamanhos e opções. Cada widget só é carregado quando aparece na tela.
import { lazy, type ComponentType, type LazyExoticComponent } from "react"
import type { WidgetInstance, WidgetType } from "@/shared/types"

export interface WidgetProps {
  w: WidgetInstance
  /** tela cheia neste monitor, janela escondida ou movimento reduzido: nada de animação nem atualização frequente */
  paused: boolean
  editing: boolean
  update: (config: Record<string, unknown>) => void
}
/** `when`: só aparece quando outra opção tem um valor (ex.: "Cena" só no estilo Aureon) */
type When = { when?: { key: string; value: string } }
export type Field = When & (
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; kind: "toggle"; default: boolean }
  | { key: string; label: string; kind: "text"; default: string; placeholder?: string })

export interface WidgetDef {
  type: WidgetType
  name: string
  desc: string
  size: { w: number; h: number }
  min: { w: number; h: number }
  /** recebe cliques (botões, texto) mesmo fora do modo de edição */
  interactive: boolean
  /** painel de opções próprio (widgets portados do Widgy) */
  Settings?: LazyExoticComponent<ComponentType<{ w: WidgetInstance; set: (p: Record<string, unknown>) => void }>>
  /** sem fundo/borda do Aureon: o widget desenha o próprio fundo */
  bare?: boolean
  /** desenha o próprio fundo, mas aceita o vidro real (papel de parede desfocado) por trás */
  glassable?: boolean
  /** desenha o próprio fundo só em alguns estilos (ex.: estilo Aureon dos esportes) */
  bareWhen?: (w: WidgetInstance) => boolean
  fields: Field[]
  component: LazyExoticComponent<ComponentType<WidgetProps>>
}

export const CATALOG: Record<WidgetType, WidgetDef> = {
  clock: {
    type: "clock", name: "Relógio", desc: "Hora e data, digital ou analógico.", size: { w: 280, h: 140 }, min: { w: 140, h: 80 }, interactive: false,
    fields: [
      { key: "style", label: "Estilo", kind: "select", default: "digital", options: [{ value: "digital", label: "Digital" }, { value: "analog", label: "Analógico" }, { value: "stacked", label: "Empilhado" }] },
      { key: "seconds", label: "Mostrar segundos", kind: "toggle", default: false },
      { key: "date", label: "Mostrar data", kind: "toggle", default: true },
    ],
    component: lazy(() => import("./types/Clock")),
  },
  weather: {
    type: "weather", name: "Clima", desc: "Tempo agora com cena animada (estilo Aureon) ou o cartão clássico do Widgy. Dados do Open-Meteo.", size: { w: 360, h: 240 }, min: { w: 200, h: 130 }, interactive: true, bare: true, glassable: true,
    fields: [
      { key: "look", label: "Estilo", kind: "select", default: "aureon", options: [{ value: "aureon", label: "Aureon (cena animada)" }, { value: "widgy", label: "Clássico (Widgy)" }] },
      { key: "scene", label: "Cena", kind: "select", default: "auto", when: { key: "look", value: "aureon" }, options: [
        { value: "auto", label: "Automática (pelo tempo de agora)" }, { value: "sun", label: "Ensolarado" }, { value: "partly", label: "Parcialmente nublado" },
        { value: "cloudy", label: "Nublado" }, { value: "rain", label: "Chuva" }, { value: "storm", label: "Tempestade" }, { value: "fog", label: "Neblina" },
        { value: "wind", label: "Vento" }, { value: "snow", label: "Neve" }, { value: "night", label: "Noite" },
      ] },
      { key: "city", label: "Cidade", kind: "text", default: "", placeholder: "Vazio = a de Configurações (ou São Paulo)" },
    ],
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Weather }))),
  },
  media: {
    type: "media", name: "Música", desc: "Spotify, YouTube Music e outros players do Windows: capa que pulsa com o som, letra sincronizada e controles.", size: { w: 760, h: 270 }, min: { w: 260, h: 110 }, interactive: true, bare: true, glassable: true,
    fields: [
      { key: "look", label: "Estilo", kind: "select", default: "aureon", options: [{ value: "aureon", label: "Aureon (igual à aba Mídia do notch)" }, { value: "widgy", label: "Clássico (Widgy)" }] },
      { key: "lyrics", label: "Mostrar a letra (widget largo)", kind: "toggle", default: true, when: { key: "look", value: "aureon" } },
      { key: "tint", label: "Cor da capa no painel", kind: "toggle", default: true, when: { key: "look", value: "aureon" } },
      { key: "app", label: "Player", kind: "select", default: "", when: { key: "look", value: "aureon" }, options: [
        { value: "", label: "Automático" }, { value: "spotify", label: "Spotify" }, { value: "youtube", label: "YouTube Music" }, { value: "deezer", label: "Deezer" },
        { value: "applemusic", label: "Apple Music" }, { value: "amazon", label: "Amazon Music" }, { value: "tidal", label: "TIDAL" }, { value: "chrome", label: "Chrome" }, { value: "msedge", label: "Edge" },
      ] },
    ], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.MusicOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Music }))),
  },
  system: {
    type: "system", name: "Sistema", desc: "Processador e memória do PC.", size: { w: 260, h: 130 }, min: { w: 180, h: 96 }, interactive: false,
    fields: [{ key: "own", label: "Mostrar consumo do Aureon", kind: "toggle", default: false }],
    component: lazy(() => import("./types/System")),
  },
  games: {
    type: "games", name: "Jogos", desc: "Jogo aberto agora e sessões recentes.", size: { w: 300, h: 150 }, min: { w: 200, h: 96 }, interactive: false,
    fields: [],
    component: lazy(() => import("./types/Games")),
  },
  pet: {
    type: "pet", name: "Pet", desc: "Um bichinho em pixel art que vive no widget.", size: { w: 220, h: 120 }, min: { w: 120, h: 80 }, interactive: true,
    fields: [
      { key: "species", label: "Bicho", kind: "select", default: "cat", options: [{ value: "cat", label: "Gatinho" }, { value: "dog", label: "Cachorrinho" }, { value: "goat", label: "Cabrinha" }, { value: "frog", label: "Sapinho" }, { value: "dragon", label: "Dragãozinho" }] },
      { key: "name", label: "Mostrar nome", kind: "toggle", default: false },
    ],
    component: lazy(() => import("./types/Pet")),
  },
  valagent: {
    type: "valagent", name: "Agente do Valorant", desc: "Arte oficial animada do agente, mapa de fundo e troca sozinha durante a partida.", size: { w: 300, h: 380 }, min: { w: 160, h: 180 }, interactive: true, bare: true,
    fields: [], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.ValAgentOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.ValAgent }))),
  },
  cs2: {
    type: "cs2", name: "CS2", desc: "Partidas ao vivo e próximas (Liquipedia), com seus times.", size: { w: 420, h: 240 }, min: { w: 240, h: 140 }, interactive: true, bareWhen: (w) => (w.config.look ?? "aureon") === "aureon", glassable: true,
    fields: [
      { key: "look", label: "Estilo", kind: "select", default: "aureon", options: [{ value: "aureon", label: "Aureon" }, { value: "widgy", label: "Clássico (Widgy)" }] },
      { key: "layout", label: "Mostrar", kind: "select", default: "auto", when: { key: "look", value: "aureon" }, options: [{ value: "auto", label: "Automático (pelo tamanho)" }, { value: "live", label: "Placar em destaque" }, { value: "list", label: "Próximos jogos" }, { value: "mini", label: "Pequeno" }] },
    ], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Sports }))),
  },
  valorant: {
    type: "valorant", name: "Valorant (partidas)", desc: "Placar com o mapa atual, escudos e arte de agente. Dados do vlr.gg.", size: { w: 420, h: 240 }, min: { w: 240, h: 140 }, interactive: true, bareWhen: (w) => (w.config.look ?? "aureon") === "aureon", glassable: true,
    fields: [
      { key: "look", label: "Estilo", kind: "select", default: "aureon", options: [{ value: "aureon", label: "Aureon" }, { value: "widgy", label: "Clássico (Widgy)" }] },
      { key: "layout", label: "Mostrar", kind: "select", default: "auto", when: { key: "look", value: "aureon" }, options: [{ value: "auto", label: "Automático (pelo tamanho)" }, { value: "live", label: "Placar em destaque" }, { value: "list", label: "Próximos jogos" }, { value: "mini", label: "Pequeno" }] },
      { key: "agentArt", label: "Arte de agente", kind: "select", default: "Jett", when: { key: "look", value: "aureon" }, options: [{ value: "none", label: "Nenhuma" }, { value: "Jett", label: "Jett" }, { value: "Reyna", label: "Reyna" }, { value: "Raze", label: "Raze" }, { value: "Phoenix", label: "Phoenix" }, { value: "Sage", label: "Sage" }, { value: "Omen", label: "Omen" }, { value: "Viper", label: "Viper" }, { value: "Killjoy", label: "Killjoy" }, { value: "Sova", label: "Sova" }, { value: "Neon", label: "Neon" }, { value: "Clove", label: "Clove" }, { value: "Iso", label: "Iso" }, { value: "Gekko", label: "Gekko" }, { value: "Fade", label: "Fade" }, { value: "Chamber", label: "Chamber" }, { value: "Yoru", label: "Yoru" }] },
    ], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Sports }))),
  },
  football: {
    type: "football", name: "Futebol", desc: "Placar ao vivo com tempo de jogo, próximos jogos (com basquete e F1) e classificação. Dados da ESPN.", size: { w: 420, h: 240 }, min: { w: 240, h: 140 }, interactive: true, bareWhen: (w) => (w.config.look ?? "aureon") === "aureon", glassable: true,
    fields: [
      { key: "look", label: "Estilo", kind: "select", default: "aureon", options: [{ value: "aureon", label: "Aureon" }, { value: "widgy", label: "Clássico (Widgy)" }] },
      { key: "layout", label: "Mostrar", kind: "select", default: "auto", when: { key: "look", value: "aureon" }, options: [{ value: "auto", label: "Automático (pelo tamanho)" }, { value: "live", label: "Placar em destaque" }, { value: "list", label: "Próximos jogos" }, { value: "mini", label: "Pequeno" }, { value: "table", label: "Classificação do campeonato" }] },
      { key: "tableLeague", label: "Campeonato da tabela", kind: "select", default: "bra.1", when: { key: "layout", value: "table" }, options: [{ value: "bra.1", label: "Brasileirão" }, { value: "bra.2", label: "Série B" }, { value: "eng.1", label: "Premier League" }, { value: "esp.1", label: "La Liga" }, { value: "ita.1", label: "Série A (ITA)" }, { value: "ger.1", label: "Bundesliga" }, { value: "fra.1", label: "Ligue 1" }, { value: "por.1", label: "Liga Portugal" }, { value: "arg.1", label: "Argentino" }, { value: "usa.1", label: "MLS" }] },
    ], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Sports }))),
  },
  team: {
    type: "team", name: "Time favorito", desc: "Placar ao vivo, último e próximo jogo do seu time (futebol, CS2, Valorant).", size: { w: 340, h: 210 }, min: { w: 220, h: 130 }, interactive: true, bare: true,
    fields: [], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.TeamOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Team }))),
  },
  note: {
    type: "note", name: "Nota", desc: "Um bloco de texto rápido.", size: { w: 260, h: 180 }, min: { w: 160, h: 100 }, interactive: true,
    fields: [],
    component: lazy(() => import("./types/Note")),
  },
}
export const TYPES = Object.keys(CATALOG) as WidgetType[]

export const newId = () => "w-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("")

/** valores padrão das opções de um tipo */
export function defaultConfig(type: WidgetType): Record<string, unknown> {
  return Object.fromEntries(CATALOG[type].fields.map((f) => [f.key, f.default]))
}
export const cfg = <T,>(w: WidgetInstance, key: string, fallback: T): T => (w.config?.[key] as T) ?? (CATALOG[w.type].fields.find((f) => f.key === key)?.default as T) ?? fallback

/** primeira posição livre (varre em linhas, de cima para baixo, com margem de 16 px entre widgets) */
export function placeNew(existing: { x: number; y: number; w: number; h: number }[], size: { w: number; h: number }, area: { width: number; height: number }) {
  const gap = 16, step = 24, margin = 32
  const hits = (x: number, y: number) => existing.some((e) => x < e.x + e.w + gap && x + size.w + gap > e.x && y < e.y + e.h + gap && y + size.h + gap > e.y)
  for (let y = margin; y + size.h <= area.height - margin; y += step)
    for (let x = margin; x + size.w <= area.width - margin; x += step)
      if (!hits(x, y)) return { x, y }
  // sem espaço: cascata no canto (o usuário arruma no modo de edição)
  return { x: margin + (existing.length % 8) * 24, y: margin + (existing.length % 8) * 24 }
}

/** mantém um retângulo dentro da área (pelo menos 40 px visíveis) */
export function clampRect(r: { x: number; y: number; w: number; h: number }, area: { width: number; height: number }, min: { w: number; h: number }) {
  const w = Math.max(min.w, Math.min(r.w, area.width)), h = Math.max(min.h, Math.min(r.h, area.height))
  return { w, h, x: Math.round(Math.max(-w + 40, Math.min(r.x, area.width - 40))), y: Math.round(Math.max(0, Math.min(r.y, area.height - 40))) }
}
