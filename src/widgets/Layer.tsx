import { Component, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Check, Copy, GripVertical, Lock, LockOpen, Trash2, TriangleAlert } from "lucide-react"
import { invoke, on } from "@/shared/bridge"
import { patch, useSection } from "@/shared/state"
import { useTheme } from "@/shared/theme"
import { placement, useWallpaper, type Wallpaper } from "@/shared/wallpaper"
import type { DisplayInfo, WidgetInstance } from "@/shared/types"
import { CATALOG } from "./catalog"
import { duplicateWidget, moveWidget, removeWidget, updateWidget } from "./profiles"

const params = new URLSearchParams(location.search)
const DISPLAY = params.get("display") ?? "0"
const PRIMARY = params.get("primary") !== "0"

/** um widget com erro não derruba os outros */
class Isolate extends Component<{ children: ReactNode; name: string }, { error: string }> {
  state = { error: "" }
  static getDerivedStateFromError(e: Error) { return { error: e?.message || "erro" } }
  componentDidCatch(e: Error) { console.error("widget falhou:", this.props.name, e) }
  render() {
    if (this.state.error) return <div className="wg-error"><TriangleAlert size={16} /><div>{this.props.name} parou</div><button type="button" className="btn btn-sm" onClick={() => this.setState({ error: "" })}>Tentar de novo</button></div>
    return this.props.children
  }
}

export function Layer() {
  const settings = useSection("settings")
  const ws = useSection("widgets")
  const profiles = useSection("profiles")
  useTheme(settings)
  const [paused, setPaused] = useState(false)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const editing = !!ws?.editMode
  const area = useArea()
  const wallpaper = useWallpaper()

  useEffect(() => on("widgets:paused", (v: boolean) => setPaused(!!v)), [])
  useEffect(() => {
    const load = () => void invoke("app:info").then((i) => setDisplays(i.displays))
    load()
    return on("displays:changed", load)
  }, [])
  useEffect(() => {
    const vis = () => setPaused((p) => (document.hidden ? true : p))
    document.addEventListener("visibilitychange", vis)
    return () => document.removeEventListener("visibilitychange", vis)
  }, [])

  // atravessável fora dos widgets: só "pega" o mouse sobre um widget que precisa de clique
  const inside = useRef(false)
  useEffect(() => {
    if (editing) return
    const move = (e: MouseEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-interactive='true']")
      const v = !!el
      if (v !== inside.current) { inside.current = v; void invoke("widgets:interactive", v) }
    }
    const out = () => { if (inside.current) { inside.current = false; void invoke("widgets:interactive", false) } }
    window.addEventListener("mousemove", move)
    document.addEventListener("mouseleave", out)
    return () => { window.removeEventListener("mousemove", move); document.removeEventListener("mouseleave", out); out() }
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") void patch("widgets", { editMode: false }) }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [editing])

  if (!ws || !profiles || !settings) return null
  const profile = profiles.items.find((p) => p.id === ws.activeProfile) ?? profiles.items[0]
  const known = new Set(displays.map((d) => d.id))
  // widget de um monitor que foi desconectado aparece no principal (não some)
  const mine = (profile?.widgets ?? []).filter((w) => w.enabled && (w.display === DISPLAY || (PRIMARY && displays.length > 0 && !known.has(w.display))))
  const reduce = settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches
  // onde esta janela (área de trabalho, sem a barra de tarefas) fica dentro do monitor inteiro
  const d = displays.find((x) => x.id === DISPLAY)
  const screen: Screen = d
    ? { ox: d.workArea.x - d.bounds.x, oy: d.workArea.y - d.bounds.y, width: d.bounds.width, height: d.bounds.height, scale: d.scale }
    : { ox: 0, oy: 0, width: area.width, height: area.height, scale: devicePixelRatio || 1 }
  const glass = { wp: wallpaper, screen, blur: settings.widgetBlur ?? 14, solid: (settings.widgetBg ?? 0.88) >= 0.99 }

  return (
    <div className={"layer" + (editing ? " layer-editing" : "")}>
      {editing && (
        <div className="edit-bar">
          <GripVertical size={14} />
          <span>Arraste para mover, puxe o canto para redimensionar.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void patch("widgets", { editMode: false })}><Check size={13} />Concluir</button>
        </div>
      )}
      {mine.map((w) => <Frame key={w.id} w={w} editing={editing} paused={paused || reduce} area={area} glass={glass} />)}
    </div>
  )
}

function useArea() {
  const [a, setA] = useState({ width: innerWidth, height: innerHeight })
  useEffect(() => {
    const r = () => setA({ width: innerWidth, height: innerHeight })
    addEventListener("resize", r)
    return () => removeEventListener("resize", r)
  }, [])
  return a
}

interface Screen { ox: number; oy: number; width: number; height: number; scale: number }
interface GlassCtx { wp: Wallpaper | null; screen: Screen; blur: number; solid: boolean }

/**
 * "Vidro" de verdade: a janela transparente não enxerga o papel de parede, então o widget desenha uma cópia
 * dele, desfocada e alinhada com a tela, por trás do conteúdo. A camada é estática (o navegador desfoca uma
 * vez e reaproveita), então não pesa enquanto o widget está parado.
 */
function Glass({ ctx, r, blur }: { ctx: GlassCtx; r: { x: number; y: number }; blur: number }) {
  const wp = ctx.wp
  if (!wp || wp.kind === "none") return null
  if (wp.kind === "color") return <div className="wg-glass" aria-hidden><i style={{ inset: 0, background: wp.color }} /></div>
  const s = ctx.screen
  const p = placement(wp.style, wp, s, s.scale)
  const bleed = Math.ceil(blur * 2) + 4
  const left = r.x + s.ox - bleed, top = r.y + s.oy - bleed
  return (
    <div className="wg-glass" aria-hidden>
      <i style={{
        inset: -bleed, backgroundColor: wp.color ?? "#000", backgroundImage: `url("${wp.url}")`,
        backgroundSize: `${p.w}px ${p.h}px`, backgroundPosition: `${p.x - left}px ${p.y - top}px`, backgroundRepeat: p.repeat ? "repeat" : "no-repeat",
        filter: blur > 0 ? `blur(${blur}px) saturate(1.25)` : undefined,
      }} />
    </div>
  )
}

function Frame({ w, editing, paused, area, glass }: { w: WidgetInstance; editing: boolean; paused: boolean; area: { width: number; height: number }; glass: GlassCtx }) {
  const def = CATALOG[w.type]
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const r = live ?? { x: w.x, y: w.y, w: w.w, h: w.h }
  const drag = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (!editing || w.locked || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const start = { px: e.clientX, py: e.clientY, ...r }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let cur = { x: start.x, y: start.y, w: start.w, h: start.h }
    const snap = (v: number) => Math.round(v / 8) * 8
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py
      cur = mode === "move"
        ? { ...cur, x: snap(start.x + dx), y: snap(start.y + dy) }
        : { ...cur, w: Math.max(def.min.w, snap(start.w + dx)), h: Math.max(def.min.h, snap(start.h + dy)) }
      setLive(cur)
    }
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up)
      moveWidget(w.id, cur, area)
      setTimeout(() => setLive(null), 60)
    }
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up)
  }
  const style = {
    left: r.x, top: r.y, width: r.w, height: r.h, opacity: w.opacity,
    ...(w.color ? { "--accent": w.color } : {}),
    ...(w.textColor ? { "--fg": w.textColor, "--muted": `color-mix(in srgb, ${w.textColor} 68%, transparent)`, "--dim": `color-mix(in srgb, ${w.textColor} 45%, transparent)`, color: w.textColor } : {}),
  } as CSSProperties
  const C = def.component
  const bg = w.bg ?? "default"
  // vidro: sempre; padrão: quando há desfoque e o fundo não é totalmente opaco
  const bare = !!def.bare || !!def.bareWhen?.(w)
  const glassBlur = bare && !(def.glassable && bg === "glass") ? -1 : bg === "glass" ? Math.max(12, glass.blur) : bg === "default" && glass.blur > 0 && !glass.solid ? glass.blur : -1
  const hasGlass = glassBlur >= 0 && !!glass.wp && glass.wp.kind !== "none"
  return (
    <div className={"wg font-" + w.font + (bare ? " wg-bare" : " wg-bg-" + bg) + (hasGlass ? " wg-has-glass" : "") + (editing ? " wg-edit" : "") + (w.locked ? " wg-locked" : "")} style={style}
      data-interactive={editing || def.interactive ? "true" : "false"} onPointerDown={drag("move")} aria-label={def.name}>
      {hasGlass && <Glass ctx={glass} r={r} blur={glassBlur} />}
      <Isolate name={def.name}>
        <Suspense fallback={null}>
          <C w={w} paused={paused} editing={editing} update={(config) => updateWidget(w.id, { config })} />
        </Suspense>
      </Isolate>
      {editing && (
        <>
          <div className="wg-tools" onPointerDown={(e) => e.stopPropagation()}>
            <span className="wg-name">{def.name}</span>
            <button type="button" className="icon-btn" aria-label={w.locked ? "Destravar" : "Travar posição"} title={w.locked ? "Destravar" : "Travar posição"} onClick={() => updateWidget(w.id, { locked: !w.locked })}>{w.locked ? <Lock size={13} /> : <LockOpen size={13} />}</button>
            <button type="button" className="icon-btn" aria-label="Duplicar" title="Duplicar" onClick={() => duplicateWidget(w.id)}><Copy size={13} /></button>
            <button type="button" className="icon-btn" aria-label="Remover" title="Remover" onClick={() => removeWidget(w.id)}><Trash2 size={13} /></button>
          </div>
          {!w.locked && <div className="wg-resize" onPointerDown={drag("resize")} aria-hidden />}
        </>
      )}
    </div>
  )
}
