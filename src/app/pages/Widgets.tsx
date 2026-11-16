import { Suspense, useEffect, useState } from "react"
import { ChevronDown, Copy, LayoutGrid, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react"
import { invoke } from "@/shared/bridge"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Setting, Slider, Switch, Empty, cx } from "@/shared/ui"
import type { DisplayInfo, WidgetInstance, WidgetType } from "@/shared/types"
import { CATALOG, TYPES } from "@/widgets/catalog"
import { addWidget, createProfile, deleteProfile, duplicateWidget, removeWidget, renameProfile, updateWidget } from "@/widgets/profiles"

const COLORS = ["", "#0B7BFA", "#4EC98A", "#E9B44C", "#F2716B", "#A78BFA", "#ECEBEE"]

export default function Widgets() {
  const ws = useSection("widgets"), profiles = useSection("profiles")
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  useEffect(() => { void invoke("app:info").then((i) => setDisplays(i.displays)) }, [])
  if (!ws || !profiles) return <div />
  const profile = profiles.items.find((p) => p.id === ws.activeProfile) ?? profiles.items[0]
  const primary = displays.find((d) => d.primary) ?? displays[0]
  const add = (t: WidgetType) => {
    const d = primary ?? { id: "0", workArea: { width: 1600, height: 900 } }
    const w = addWidget(t, d.id, d.workArea)
    setAdding(false)
    if (w) setOpen(w.id)
  }

  return (
    <div className="page">
      <PageHead title="Widgets" desc="Widgets que ficam na área de trabalho, atrás das janelas. Arraste e redimensione no modo de edição."
        actions={<div className="row"><button type="button" className="btn" onClick={() => void patch("widgets", { editMode: true, enabled: true })}><Pencil size={14} />Editar posições</button><button type="button" className="btn btn-primary" onClick={() => setAdding((v) => !v)}><Plus size={14} />Adicionar</button></div>} />

      {adding && (
        <div className="card card-pad fade-in" style={{ marginBottom: 14 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Escolha um widget</div>
          <div className="grid-3" style={{ gap: 8 }}>
            {TYPES.map((t) => (
              <button key={t} type="button" className="list-row" style={{ border: "1px solid var(--line)", background: "var(--s1)", textAlign: "left" }} onClick={() => add(t)}>
                <LayoutGrid size={16} className="muted" />
                <div className="grow"><div style={{ fontWeight: 500 }}>{CATALOG[t].name}</div><div className="tiny muted">{CATALOG[t].desc}</div></div>
              </button>
            ))}
          </div>
        </div>
      )}

      <Section title="Perfil" desc="Cada perfil guarda um layout inteiro. Troque entre eles quando quiser (ex.: trabalho e jogo).">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="field" value={profile.id} aria-label="Perfil ativo" onChange={(e) => void patch("widgets", { activeProfile: e.target.value })}>
            {profiles.items.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.widgets.length})</option>)}
          </select>
          <input className="field" style={{ width: 180 }} defaultValue={profile.name} key={profile.id} aria-label="Nome do perfil" onBlur={(e) => renameProfile(profile.id, e.target.value)} />
          <button type="button" className="btn" onClick={() => createProfile("Novo perfil")}><Plus size={13} />Novo</button>
          <button type="button" className="btn" onClick={() => createProfile(profile.name + " (cópia)", profile.id)}><Copy size={13} />Duplicar</button>
          <button type="button" className="btn btn-ghost" disabled={profiles.items.length <= 1} onClick={() => deleteProfile(profile.id)}><Trash2 size={13} />Excluir</button>
        </div>
      </Section>

      <Section title={`Widgets do perfil (${profile.widgets.length})`}>
        {!profile.widgets.length ? (
          <Empty icon={<LayoutGrid size={28} />} title="Nenhum widget ainda" desc="Adicione relógio, clima, mídia, sistema, jogos, pet ou notas." action={<button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} />Adicionar widget</button>} />
        ) : (
          <div className="col" style={{ gap: 4 }}>
            {profile.widgets.map((w) => <Row key={w.id} w={w} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} displays={displays} />)}
          </div>
        )}
      </Section>

      <Section title="Comportamento">
        <Setting title="Mostrar widgets" desc="Desligar esconde todos sem apagar nada."><Switch label="Mostrar widgets" checked={ws.enabled} onChange={(v) => void patch("widgets", { enabled: v })} /></Setting>
        <Setting title="Esconder em tela cheia" desc="Jogo, vídeo ou apresentação em tela cheia: os widgets daquele monitor somem e param de atualizar."><Switch label="Esconder em tela cheia" checked={ws.hideFullscreen} onChange={(v) => void patch("widgets", { hideFullscreen: v })} /></Setting>
      </Section>
    </div>
  )
}

function Row({ w, open, onToggle, displays }: { w: WidgetInstance; open: boolean; onToggle: () => void; displays: DisplayInfo[] }) {
  const def = CATALOG[w.type]
  return (
    <div className={cx("inset")} style={{ background: open ? "var(--s2)" : "transparent" }}>
      <div className="list-row" style={{ cursor: "pointer" }} onClick={onToggle}>
        <Switch label={`Mostrar ${def.name}`} checked={w.enabled} onChange={(v) => updateWidget(w.id, { enabled: v })} />
        <div className="grow" onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
          <div style={{ fontWeight: 500 }}>{def.name}</div>
          <div className="tiny muted">{w.w}×{w.h} · {displays.find((d) => d.id === w.display)?.primary ? "monitor principal" : displays.length > 1 ? "outro monitor" : "monitor"}{w.locked ? " · travado" : ""}</div>
        </div>
        <button type="button" className="icon-btn" title={w.locked ? "Destravar" : "Travar posição"} aria-label={w.locked ? "Destravar" : "Travar posição"} onClick={(e) => { e.stopPropagation(); updateWidget(w.id, { locked: !w.locked }) }}>{w.locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
        <button type="button" className="icon-btn" title="Duplicar" aria-label="Duplicar" onClick={(e) => { e.stopPropagation(); duplicateWidget(w.id) }}><Copy size={14} /></button>
        <button type="button" className="icon-btn" title="Remover" aria-label="Remover" onClick={(e) => { e.stopPropagation(); removeWidget(w.id) }}><Trash2 size={14} /></button>
        <ChevronDown size={15} className="muted" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform var(--t)" }} />
      </div>
      {open && (
        <div className="fade-in" style={{ padding: "0 14px 8px 58px" }}>
          {def.fields.map((f) => (
            <Setting key={f.key} title={f.label}>
              {f.kind === "toggle"
                ? <Switch label={f.label} checked={(w.config[f.key] as boolean) ?? f.default} onChange={(v) => updateWidget(w.id, { config: { [f.key]: v } })} />
                : f.kind === "text"
                  ? <input className="field" style={{ width: 260 }} aria-label={f.label} placeholder={f.placeholder} defaultValue={(w.config[f.key] as string) ?? f.default} onBlur={(e) => updateWidget(w.id, { config: { [f.key]: e.target.value.trim().slice(0, 80) } })} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
                  : <select className="field" aria-label={f.label} value={(w.config[f.key] as string) ?? f.default} onChange={(e) => updateWidget(w.id, { config: { [f.key]: e.target.value } })}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
            </Setting>
          ))}
          {def.Settings && (
            <div className="widgy-settings" style={{ margin: "8px 0 12px" }}>
              <Suspense fallback={<div className="small muted">Carregando opções…</div>}>
                <def.Settings w={w} set={(p) => updateWidget(w.id, { config: p })} />
              </Suspense>
            </div>
          )}
          {displays.length > 1 && (
            <Setting title="Monitor">
              <select className="field" aria-label="Monitor" value={w.display} onChange={(e) => updateWidget(w.id, { display: e.target.value, x: 48, y: 48 })}>
                {displays.map((d, i) => <option key={d.id} value={d.id}>{d.primary ? "Principal" : `Monitor ${i + 1}`} · {d.bounds.width}×{d.bounds.height}</option>)}
              </select>
            </Setting>
          )}
          <Setting title="Opacidade"><Slider label="Opacidade" min={0.2} max={1} step={0.05} value={w.opacity} onChange={(v) => updateWidget(w.id, { opacity: v })} format={(v) => Math.round(v * 100) + "%"} /></Setting>
          <Setting title="Fonte">
            <select className="field" aria-label="Fonte" value={w.font} onChange={(e) => updateWidget(w.id, { font: e.target.value as WidgetInstance["font"] })}>
              <option value="inter">Inter</option><option value="grotesk">Space Grotesk</option><option value="mono">Monoespaçada</option>
            </select>
          </Setting>
          <Setting title="Cor de destaque" desc="Vazio usa a cor do app.">
            <div className="row" style={{ gap: 6 }}>
              {COLORS.map((c) => <button key={c || "app"} type="button" className="swatch" aria-pressed={w.color === c} aria-label={c || "Cor do app"} title={c || "Cor do app"} style={{ background: c || "linear-gradient(135deg, var(--accent) 50%, var(--s3) 50%)" }} onClick={() => updateWidget(w.id, { color: c })} />)}
            </div>
          </Setting>
          <Setting title="Tamanho" desc="Ou arraste o canto no modo de edição.">
            <div className="row">
              <input className="field num" style={{ width: 76 }} type="number" aria-label="Largura" min={def.min.w} value={w.w} onChange={(e) => updateWidget(w.id, { w: Math.max(def.min.w, Number(e.target.value) || def.min.w) })} />
              <span className="muted">×</span>
              <input className="field num" style={{ width: 76 }} type="number" aria-label="Altura" min={def.min.h} value={w.h} onChange={(e) => updateWidget(w.id, { h: Math.max(def.min.h, Number(e.target.value) || def.min.h) })} />
            </div>
          </Setting>
        </div>
      )}
    </div>
  )
}
