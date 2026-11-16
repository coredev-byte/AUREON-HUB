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
export type Field =
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; kind: "toggle"; default: boolean }
  | { key: string; label: string; kind: "text"; default: string; placeholder?: string }

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
    type: "weather", name: "Clima", desc: "Tempo agora, próximas horas e dias (Open-Meteo), com o visual do Widgy.", size: { w: 320, h: 220 }, min: { w: 180, h: 120 }, interactive: true, bare: true,
    fields: [{ key: "city", label: "Cidade", kind: "text", default: "", placeholder: "Vazio = a de Configurações (ou São Paulo)" }],
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Weather }))),
  },
  media: {
    type: "media", name: "Mídia", desc: "Spotify, YouTube Music e outros players do Windows.", size: { w: 340, h: 140 }, min: { w: 220, h: 96 }, interactive: true,
    fields: [{
      key: "source", label: "Player", kind: "select", default: "",
      options: [{ value: "", label: "Qualquer um" }, { value: "spotify", label: "Spotify" }, { value: "youtube", label: "YouTube Music" }, { value: "deezer", label: "Deezer" }, { value: "chrome", label: "Chrome" }, { value: "msedge", label: "Edge" }, { value: "firefox", label: "Firefox" }],
    }],
    component: lazy(() => import("./types/Media")),
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
    type: "cs2", name: "CS2", desc: "Partidas ao vivo e próximas (Liquipedia), com seus times.", size: { w: 340, h: 300 }, min: { w: 220, h: 160 }, interactive: true,
    fields: [], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Sports }))),
  },
  valorant: {
    type: "valorant", name: "Valorant (partidas)", desc: "Partidas do cenário competitivo (VLR.gg).", size: { w: 340, h: 300 }, min: { w: 220, h: 160 }, interactive: true,
    fields: [], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
    component: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.Sports }))),
  },
  football: {
    type: "football", name: "Futebol", desc: "Jogos ao vivo e próximos (ESPN), por campeonato e time.", size: { w: 340, h: 300 }, min: { w: 220, h: 160 }, interactive: true,
    fields: [], Settings: lazy(() => import("./widgy/adapters").then((m) => ({ default: m.SportsOptions }))),
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
