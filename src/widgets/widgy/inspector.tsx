import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react"
import { motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { cn } from "./compat/utils"

/**
 * Inspetor de widget: o painel de personalizar. Fica ao lado do widget, sem escurecer a tela, para a mudança
 * aparecer no próprio widget enquanto se mexe. As peças daqui (grupo, linha, interruptor, deslizante, amostras
 * de cor, opções com prévia) são usadas por todos os widgets, para o painel ter um jeito só.
 */

export const INSPECTOR_W = 372

/* ------------------------------------------------------------------ peças ------------------------------------------------------------------ */

/** Bloco com título pequeno e as linhas dentro de uma caixa só, separadas por um fio. */
export function Group({ title, action, note, children, flush }: { title?: string; action?: ReactNode; note?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="wi-group">
      {(title || action) && (
        <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2 px-1">
          {title && <h4 className="text-[11px] font-semibold tracking-[.07em] text-fg-muted uppercase">{title}</h4>}
          {action}
        </div>
      )}
      <div className={cn("wi-box overflow-hidden rounded-[12px] border border-line", !flush && "divide-y divide-[var(--line)]")} style={{ background: "color-mix(in srgb, var(--fg) 3.5%, transparent)" }}>
        {children}
      </div>
      {note && <p className="mt-1.5 px-1 text-[11.5px] leading-snug text-fg-muted">{note}</p>}
    </section>
  )
}

/** Linha: nome à esquerda, controle à direita. Com `stack` o controle vai para baixo e ocupa a largura toda. */
export function Row({ label, hint, children, stack, trailing }: { label?: ReactNode; hint?: ReactNode; children?: ReactNode; stack?: boolean; trailing?: ReactNode }) {
  if (stack) {
    return (
      <div className="px-3 py-2.5">
        {(label || trailing) && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px]">{label}</span>
            {trailing}
          </div>
        )}
        {children}
        {hint && <div className="mt-1.5 text-[11.5px] leading-snug text-fg-muted">{hint}</div>}
      </div>
    )
  }
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 px-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px] leading-tight">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Interruptor numa linha. */
export function Toggle({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-[42px] cursor-pointer items-center justify-between gap-3 px-3 py-1.5", disabled && "pointer-events-none opacity-45")}>
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-muted">{hint}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150", checked ? "bg-brand" : "bg-[color-mix(in_srgb,var(--fg)_20%,transparent)]")}
      >
        <span className="absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/.35)] transition-transform duration-150" style={{ transform: checked ? "translateX(16px)" : "none" }} />
      </button>
    </label>
  )
}

/** Deslizante numa linha: nome, valor e (quando mudou) um botão para voltar ao padrão. */
export function Range({ label, value, min, max, step = 1, onChange, format, def, onReset }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string
  /** valor padrão: se o atual for diferente, aparece o botão de voltar */
  def?: number; onReset?: () => void
}) {
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0
  const changed = def !== undefined && Math.abs(value - def) > 1e-6
  return (
    <div className="px-3 pt-2.5 pb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px]">{label}</span>
        <span className="flex items-center gap-1.5">
          {changed && (
            <button type="button" className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg" title="Voltar ao padrão" aria-label="Voltar ao padrão" onClick={() => (onReset ? onReset() : onChange(def!))}>
              <RotateCcw size={12} />
            </button>
          )}
          <span className="font-num text-[12px] text-fg-muted tabular-nums">{format ? format(value) : value}</span>
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={typeof label === "string" ? label : undefined} aria-valuetext={format ? format(value) : undefined}
        onChange={(e) => onChange(Number(e.target.value))} className="agenda-range block w-full" style={{ ["--pct" as string]: pct + "%" } as CSSProperties}
      />
    </div>
  )
}

/** Escolha entre poucas opções, ocupando a largura toda. */
export function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  const id = useId()
  return (
    <div role="group" aria-label={label} className="flex w-full gap-0.5 rounded-[9px] p-[3px]" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} title={o.title} onClick={() => onChange(o.value)}
            className={cn("relative min-w-0 flex-1 rounded-[7px] px-1.5 py-[5px] text-[12px] leading-tight transition-colors", on ? "font-medium text-fg" : "text-fg-muted hover:text-fg")}>
            {on && <motion.span layoutId={id} className="absolute inset-0 rounded-[7px] shadow-[0_1px_2px_rgb(0_0_0/.25)]" style={{ background: "color-mix(in srgb, var(--fg) 16%, transparent)" }} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
            <span className="relative block truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Opções com uma prévia desenhada em cima do nome. */
export function Tiles<T extends string>({ value, options, onChange, cols = 4, label }: {
  value: T; options: { value: T; label: string; preview: ReactNode }[]; onChange: (v: T) => void; cols?: number; label?: string
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={cn("group/t flex min-w-0 flex-col items-stretch gap-1 rounded-[10px] border p-1 text-center transition-colors", on ? "border-brand bg-brand/12" : "border-transparent hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
            <span className="flex h-10 items-center justify-center overflow-hidden rounded-[7px]" style={{ background: "color-mix(in srgb, var(--fg) 7%, transparent)" }}>{o.preview}</span>
            <span className={cn("truncate px-0.5 pb-0.5 text-[11px] leading-tight", on ? "text-fg" : "text-fg-muted group-hover/t:text-fg")}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Amostras de cor. Com `auto`, a primeira bolinha significa "seguir o tema" (valor vazio); a última abre o seletor livre.
 */
export function Swatches({ value, onChange, colors, auto, label }: { value?: string; onChange: (v: string | undefined) => void; colors: string[]; auto?: string; label?: string }) {
  const v = (value ?? "").toLowerCase()
  const custom = !!v && !colors.some((c) => c.toLowerCase() === v)
  const dot = "relative size-[22px] shrink-0 rounded-full transition-transform hover:scale-110"
  const ring = "ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-transparent"
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-[7px]">
      {auto && (
        <button type="button" aria-pressed={!v} title={auto} aria-label={auto} onClick={() => onChange(undefined)}
          className={cn(dot, "flex items-center justify-center border border-line text-fg-muted", !v && ring)} style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
          <span className="block h-px w-3 rotate-[-45deg] bg-current" />
        </button>
      )}
      {colors.map((c) => (
        <button key={c} type="button" aria-pressed={v === c.toLowerCase()} aria-label={"Cor " + c} title={c} onClick={() => onChange(c)}
          className={cn(dot, "border border-[rgb(255_255_255/.18)]", v === c.toLowerCase() && ring)} style={{ background: c }} />
      ))}
      <label title="Outra cor" className={cn(dot, "cursor-pointer overflow-hidden border border-[rgb(255_255_255/.18)]", custom && ring)}
        style={{ background: custom ? value : "conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)" }}>
        <input type="color" aria-label={(label ? label + ": " : "") + "outra cor"} className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

/** Campo de texto que grava ao sair (ou no Enter), para não refazer o widget a cada tecla. */
export function TextField({ value, onCommit, placeholder, label }: { value: string; onCommit: (v: string) => void; placeholder?: string; label?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input className="wi-input" aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
  )
}

/** Lista de opções (select) no visual do painel. */
export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string }) {
  return (
    <select className="wi-input max-w-[190px] cursor-pointer" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Botão pequeno do painel. */
export function MiniButton({ children, onClick, disabled, title, danger }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-[5px] text-[12px] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] disabled:pointer-events-none disabled:opacity-40", danger && "hover:!text-red-400")}>
      {children}
    </button>
  )
}
