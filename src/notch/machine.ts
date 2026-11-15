// Máquina de estados do Notch. Pura (sem DOM nem timers): recebe eventos e devolve o próximo estado,
// incluindo QUAL temporizador deve estar armado. Um único temporizador por vez evita animações brigando,
// piscadas e expansões sem querer.
import type { Notice } from "@/shared/types"

export type Mode = "idle" | "hover" | "expanded" | "notification" | "media" | "sharing" | "alert"
export type Tab = "now" | "media" | "share" | "activity"

export interface Ctx {
  sharing: boolean
  mediaPlaying: boolean
  showMedia: boolean
  hoverExpand: boolean
  hoverDelay: number
  /** monitor com app em tela cheia: o notch vira só um indicador sem interação */
  fullscreen: boolean
  notifications: boolean
}
export interface Timer { event: NotchEvent["type"]; ms: number; seq: number }
export interface NotchState {
  mode: Mode
  tab: Tab
  pointer: boolean
  /** aberto por clique/atalho: fecha mais devagar ao tirar o mouse */
  pinned: boolean
  notice: Notice | null
  queue: Notice[]
  timer: Timer | null
  ctx: Ctx
}

export type NotchEvent =
  | { type: "enter" }
  | { type: "leave" }
  | { type: "click" }
  | { type: "toggle" }
  | { type: "hover-timeout" }
  | { type: "collapse" }
  | { type: "notify"; notice: Notice }
  | { type: "notice-done" }
  | { type: "dismiss" }
  | { type: "tab"; tab: Tab }
  | { type: "ctx"; ctx: Partial<Ctx> }

export const NOTICE_MS = 4500
export const COLLAPSE_MS = 450
export const PINNED_COLLAPSE_MS = 1600

export const initialCtx: Ctx = { sharing: false, mediaPlaying: false, showMedia: true, hoverExpand: true, hoverDelay: 140, fullscreen: false, notifications: true }
export const initial = (ctx: Partial<Ctx> = {}): NotchState => {
  const c = { ...initialCtx, ...ctx }
  return { mode: base(c), tab: "now", pointer: false, pinned: false, notice: null, queue: [], timer: null, ctx: c }
}

/** estado de repouso conforme o contexto: transmissão > mídia tocando > discreto */
export function base(ctx: Ctx): Mode {
  if (ctx.sharing) return "sharing"
  if (ctx.showMedia && ctx.mediaPlaying) return "media"
  return "idle"
}
const isBase = (m: Mode) => m === "idle" || m === "media" || m === "sharing"
let seq = 0
const arm = (event: Timer["event"], ms: number): Timer => ({ event, ms, seq: ++seq })

/** mostra o próximo aviso da fila ou volta ao repouso */
function next(s: NotchState): NotchState {
  const [head, ...rest] = s.queue
  if (head) return show({ ...s, queue: rest }, head)
  // mouse ainda em cima (ex.: acabou de clicar em "Recusar"): fica em "hover", sem abrir sozinho
  return { ...s, mode: s.pointer ? "hover" : base(s.ctx), notice: null, timer: null, pinned: false }
}
function show(s: NotchState, n: Notice): NotchState {
  const mode: Mode = n.kind === "alert" ? "alert" : "notification"
  // pedido de entrada e alertas ficam até alguém responder; o resto some sozinho
  const stays = n.sticky || n.kind === "alert" || n.actions.length > 0
  return { ...s, mode, notice: n, timer: stays || s.pointer ? null : arm("notice-done", NOTICE_MS) }
}

export function reduce(s: NotchState, e: NotchEvent): NotchState {
  // em tela cheia: só o indicador, sem reagir ao mouse
  if (s.ctx.fullscreen && e.type !== "ctx" && e.type !== "notify") return s
  switch (e.type) {
    case "ctx": {
      const ctx = { ...s.ctx, ...e.ctx }
      const n = { ...s, ctx }
      if (ctx.fullscreen) return { ...n, mode: base(ctx), pinned: false, pointer: false, timer: null }
      if (isBase(s.mode)) return { ...n, mode: base(ctx) }
      if (s.mode === "hover") return n
      return n
    }
    case "enter": {
      const n = { ...s, pointer: true }
      if (isBase(s.mode)) return { ...n, mode: "hover", timer: s.ctx.hoverExpand ? arm("hover-timeout", s.ctx.hoverDelay + 260) : null }
      // com o mouse em cima, o aviso não some
      if (s.mode === "notification") return { ...n, timer: null }
      if (s.mode === "expanded") return { ...n, timer: null }
      return n
    }
    case "hover-timeout":
      return s.mode === "hover" && s.pointer ? { ...s, mode: "expanded", pinned: false, timer: null } : s
    case "leave": {
      const n = { ...s, pointer: false }
      if (s.mode === "hover") return { ...n, mode: base(s.ctx), timer: null }
      if (s.mode === "expanded") return { ...n, timer: arm("collapse", s.pinned ? PINNED_COLLAPSE_MS : COLLAPSE_MS) }
      if (s.mode === "notification" && s.notice && !(s.notice.sticky || s.notice.actions.length)) return { ...n, timer: arm("notice-done", 1800) }
      return n
    }
    case "collapse":
      return s.mode === "expanded" && !s.pointer ? next({ ...s, pinned: false }) : s
    case "click":
      if (s.mode === "expanded") return { ...s, mode: base(s.ctx), pinned: false, timer: null }
      if (s.mode === "alert") return s
      return { ...s, mode: "expanded", pinned: true, timer: null, tab: s.mode === "sharing" ? "share" : s.mode === "media" ? "media" : s.mode === "notification" ? "activity" : s.tab, notice: null }
    case "toggle":
      if (s.mode === "expanded") return next({ ...s, pinned: false })
      return { ...s, mode: "expanded", pinned: true, timer: null }
    case "tab":
      return { ...s, tab: e.tab }
    case "notify": {
      if (!s.ctx.notifications && e.notice.kind !== "request" && e.notice.kind !== "alert") return s
      if (s.ctx.fullscreen) return s
      // aberto ou mostrando outro aviso: entra na fila (alertas e pedidos furam a fila)
      if (s.mode === "expanded" || s.mode === "notification" || s.mode === "alert") {
        const urgent = e.notice.kind === "alert" || e.notice.kind === "request"
        return { ...s, queue: urgent ? [e.notice, ...s.queue] : [...s.queue, e.notice].slice(-8) }
      }
      return show({ ...s, pinned: false }, e.notice)
    }
    case "notice-done":
      return s.mode === "notification" && !s.pointer ? next(s) : s
    case "dismiss":
      return s.mode === "notification" || s.mode === "alert" ? next(s) : s
  }
}

/** tamanho do desenho em cada estado (px, antes da escala escolhida pelo usuário) */
export function sizeOf(mode: Mode, opts: { idleClock: boolean; fullscreen: boolean }): { w: number; h: number; r: number } {
  if (opts.fullscreen) return { w: 118, h: 24, r: 12 }
  switch (mode) {
    case "idle": return opts.idleClock ? { w: 168, h: 30, r: 15 } : { w: 132, h: 22, r: 11 }
    case "hover": return { w: 236, h: 38, r: 19 }
    case "media": return { w: 300, h: 36, r: 18 }
    case "sharing": return { w: 296, h: 36, r: 18 }
    case "notification": return { w: 430, h: 74, r: 26 }
    case "alert": return { w: 430, h: 68, r: 24 }
    case "expanded": return { w: 740, h: 316, r: 30 }
  }
}
