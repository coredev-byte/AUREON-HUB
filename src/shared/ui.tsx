// Componentes básicos do Aureon. Pequenos e sem dependências extras: os estilos estão em carbono.css.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown } from "lucide-react"

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
}

/**
 * Indicador que desliza até o item ativo (abas, segmentos, menu lateral). Só transform/width numa peça
 * absoluta: nada do resto da página é recalculado durante a animação.
 */
export function useIndicator(box: RefObject<HTMLElement | null>, selector: string, deps: unknown[], axis: "x" | "y" = "x") {
  const [st, setSt] = useState<{ x: number; y: number; w: number; h: number; ready: boolean }>({ x: 0, y: 0, w: 0, h: 0, ready: false })
  const measure = useCallback(() => {
    const el = box.current?.querySelector<HTMLElement>(selector)
    if (!el || !box.current) { setSt((s) => (s.w ? { ...s, w: 0 } : s)); return }
    setSt((s) => {
      const n = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
      // na primeira medida não anima (o indicador já nasce no lugar certo)
      return n.x === s.x && n.y === s.y && n.w === s.w && n.h === s.h ? s : { ...n, ready: s.w > 0 }
    })
  }, [box, selector])
  useLayoutEffect(measure, deps)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])
  const style = axis === "x"
    ? { transform: `translateX(${st.x}px)`, width: st.w, opacity: st.w ? 1 : 0 }
    : { transform: `translateY(${st.y}px)`, height: st.h, opacity: st.w ? 1 : 0 }
  return { style, animate: st.ready }
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const ind = useIndicator(box, "button[aria-pressed='true']", [value, options.length])
  return (
    <div className="seg" role="group" aria-label={label} ref={box}>
      <span className={cx("seg-thumb", ind.animate && "seg-anim")} style={ind.style} aria-hidden />
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

/** abas com sublinhado que desliza */
export function Tabs<T extends string>({ value, tabs, onChange, label, className }: { value: T; tabs: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const ind = useIndicator(box, "[aria-selected='true']", [value, tabs.length])
  const key = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -2
    if (n === -2) return
    e.preventDefault()
    const t = tabs[(n + tabs.length) % tabs.length]
    onChange(t.id)
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("[aria-selected='true']")?.focus())
  }
  return (
    <div className={cx("tabs-line", className)} role="tablist" aria-label={label} ref={box} onKeyDown={key}>
      {tabs.map((t) => <button key={t.id} role="tab" type="button" tabIndex={t.id === value ? 0 : -1} aria-selected={t.id === value} onClick={() => onChange(t.id)}>{t.label}</button>)}
      <span className={cx("tabs-ink", ind.animate && "tabs-ink-anim")} style={ind.style} aria-hidden />
    </div>
  )
}

/**
 * Lista suspensa própria (no lugar do menu nativo do Windows): abre com animação, navega por teclado
 * (setas, Home/End, Enter, Esc e digitação), fecha ao clicar fora. Renderizada no <body> para não ser cortada.
 */
export function Select<T extends string>({ value, options, onChange, label, disabled, width, className }: {
  value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean; width?: number | string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: "", at: 0 })
  const cur = options.find((o) => o.value === value)
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const h = Math.min(320, options.length * 34 + 10)
    const up = r.bottom + h + 8 > innerHeight && r.top > h + 8
    setPos({ left: r.left, top: up ? r.top - h - 6 : r.bottom + 6, width: Math.max(r.width, 180), up })
  }, [options.length])
  const show = () => { if (disabled) return; place(); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true) }
  const pick = (i: number) => { const o = options[i]; if (o) onChange(o.value); setOpen(false); btn.current?.focus() }
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const away = () => setOpen(false)
    addEventListener("pointerdown", out, true)
    addEventListener("resize", away)
    addEventListener("blur", away)
    document.addEventListener("scroll", place, true)
    return () => { removeEventListener("pointerdown", out, true); removeEventListener("resize", away); removeEventListener("blur", away); document.removeEventListener("scroll", place, true) }
  }, [open, place])
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }) }, [open, active])
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show() } return }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false) }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === "Home") { e.preventDefault(); setActive(0) }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active) }
    else if (e.key === "Tab") setOpen(false)
    else if (e.key.length === 1) {
      const now = performance.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now }
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (i >= 0) setActive(i)
    }
  }
  return (
    <>
      <button ref={btn} type="button" className={cx("select", className)} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        disabled={disabled} style={{ width }} onClick={() => (open ? setOpen(false) : show())} onKeyDown={key}>
        <span className="truncate grow">{cur?.label ?? "—"}</span>
        <ChevronDown size={14} className="select-chev" aria-hidden />
      </button>
      {open && pos && createPortal(
        <div ref={list} role="listbox" aria-label={label} className={cx("menu", pos.up && "menu-up")} style={{ left: pos.left, top: pos.top, minWidth: pos.width }} onKeyDown={key}>
          {options.map((o, i) => (
            <div key={o.value} data-i={i} role="option" aria-selected={o.value === value} className={cx("menu-item", i === active && "menu-active")}
              onPointerEnter={() => setActive(i)} onClick={() => pick(i)}>
              <span className="grow truncate">{o.label}{o.hint && <span className="menu-hint">{o.hint}</span>}</span>
              {o.value === value && <Check size={13} className="menu-check" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

export function Setting({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text"><div className="setting-title">{title}</div>{desc && <div className="setting-desc">{desc}</div>}</div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  )
}

export function Slider({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min || 1)) * 100
  return (
    <div className="row slider" style={{ width: 230 }}>
      <input className="range" type="range" aria-label={label} min={min} max={max} step={step} value={value} style={{ ["--p" as string]: pct + "%" }} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="num small muted" style={{ width: 44, textAlign: "right" }}>{format ? format(value) : value}</span>
    </div>
  )
}

export function PageHead({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow" style={{ minWidth: 0 }}><h1 className="h1">{title}</h1>{desc && <p className="page-desc">{desc}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Section({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card card-pad section">
      <div className="section-head"><div className="grow" style={{ minWidth: 0 }}><h2 className="h2">{title}</h2>{desc && <p className="section-desc">{desc}</p>}</div>{actions}</div>
      {children}
    </section>
  )
}

export function Empty({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="h2">{title}</div>
      {desc && <div className="small muted" style={{ maxWidth: 380 }}>{desc}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

/** esqueleto de carregamento (sem girar nada: só um brilho leve que passa) */
export function Skeleton({ lines = 3, height }: { lines?: number; height?: number }) {
  return (
    <div className="skel-wrap" aria-busy="true" aria-label="Carregando">
      {height ? <div className="skel" style={{ height }} /> : Array.from({ length: lines }, (_, i) => <div key={i} className="skel" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  )
}
