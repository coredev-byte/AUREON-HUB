import { Component, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Check, Copy, GripVertical, Lock, LockOpen, Trash2, TriangleAlert } from "lucide-react"
import { invoke, on } from "@/shared/bridge"
import { patch, useSection } from "@/shared/state"
import { useTheme } from "@/shared/theme"
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

  return (
    <div className={"layer" + (editing ? " layer-editing" : "")}>
      {editing && (
        <div className="edit-bar">
          <GripVertical size={14} />
          <span>Arraste para mover, puxe o canto para redimensionar.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void patch("widgets", { editMode: false })}><Check size={13} />Concluir</button>
        </div>
      )}
      {mine.map((w) => <Frame key={w.id} w={w} editing={editing} paused={paused || reduce} area={area} />)}
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

function Frame({ w, editing, paused, area }: { w: WidgetInstance; editing: boolean; paused: boolean; area: { width: number; height: number } }) {
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
  } as CSSProperties
  const C = def.component
  return (
    <div className={"wg font-" + w.font + (def.bare ? " wg-bare" : "") + (editing ? " wg-edit" : "") + (w.locked ? " wg-locked" : "")} style={style}
      data-interactive={editing || def.interactive ? "true" : "false"} onPointerDown={drag("move")} aria-label={def.name}>
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
