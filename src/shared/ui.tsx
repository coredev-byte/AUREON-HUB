// Componentes básicos do Carbono. Pequenos e sem dependências: os estilos estão em carbono.css.
import type { ReactNode } from "react"

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export function Setting({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text"><div className="setting-title">{title}</div>{desc && <div className="setting-desc">{desc}</div>}</div>
      {children}
    </div>
  )
}

export function Slider({ value, min, max, step, onChange, label, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  return (
    <div className="row" style={{ width: 220 }}>
      <input className="range" type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="num small muted" style={{ width: 44, textAlign: "right" }}>{format ? format(value) : value}</span>
    </div>
  )
}

export function PageHead({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <header className="row" style={{ alignItems: "flex-end", marginBottom: 20, gap: 16 }}>
      <div className="grow"><h1 className="h1">{title}</h1>{desc && <p className="muted" style={{ margin: "4px 0 0" }}>{desc}</p>}</div>
      {actions}
    </header>
  )
}

export function Section({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: desc ? 2 : 8 }}><h2 className="h2 grow">{title}</h2>{actions}</div>
      {desc && <p className="small muted" style={{ margin: "0 0 8px" }}>{desc}</p>}
      {children}
    </section>
  )
}

export function Empty({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "36px 16px", gap: 6 }}>
      <div style={{ color: "var(--dim)" }}>{icon}</div>
      <div className="h2" style={{ marginTop: 4 }}>{title}</div>
      {desc && <div className="small muted" style={{ maxWidth: 380 }}>{desc}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}
