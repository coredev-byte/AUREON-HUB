import { Suspense, useEffect, useState, type ReactNode } from "react"
import {
  Clock3, CloudSun, Copy, Cpu, Crosshair, Gamepad2, LayoutGrid, Lock, LockOpen, Music2, PawPrint, Pencil, Plus, Shield, Sparkles,
  StickyNote, Swords, Trash2, Trophy, X,
} from "lucide-react"
import { invoke } from "@/shared/bridge"
import { patch, useSection } from "@/shared/state"
import { PageHead, Segmented, Setting, Slider, Switch, cx, Select, Tabs } from "@/shared/ui"
import type { DisplayInfo, WidgetBg, WidgetInstance, WidgetType } from "@/shared/types"
import { CATALOG } from "@/widgets/catalog"
import { useWallpaper } from "@/shared/wallpaper"
import { addWidget, createProfile, deleteProfile, duplicateWidget, removeWidget, renameProfile, updateWidget } from "@/widgets/profiles"
import { useNav } from "../nav"

export const ICON: Record<WidgetType, typeof Clock3> = {
  clock: Clock3, weather: CloudSun, media: Music2, system: Cpu, games: Gamepad2, pet: PawPrint, note: StickyNote,
  cs2: Crosshair, valorant: Swords, football: Trophy, team: Shield, valagent: Sparkles,
}
const GROUPS: { title: string; types: WidgetType[] }[] = [
  { title: "Essenciais", types: ["clock", "weather", "media", "note"] },
  { title: "Jogos e esportes", types: ["valagent", "team", "football", "cs2", "valorant", "games"] },
  { title: "PC e diversão", types: ["system", "pet"] },
]
const SWATCHES = ["#0B7BFA", "#5AB0FF", "#22C3A6", "#4EC98A", "#E9B44C", "#FF7A45", "#FF4655", "#F1B9C6", "#A78BFA", "#ECEBEE"]
const TEXT_COLORS = ["#ECEBEE", "#FFFFFF", "#C9C8CE", "#0B0B0C", "#FFE6A8", "#BFE3FF"]
type Tab = "content" | "look" | "place"

export default function Widgets() {
  const ws = useSection("widgets"), profiles = useSection("profiles")
  const params = useNav((s) => s.params)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [sel, setSel] = useState<string | null>(typeof params.open === "string" ? params.open : null)
  const [adding, setAdding] = useState(false)
  useEffect(() => { void invoke("app:info").then((i) => setDisplays(i.displays)) }, [])
  useEffect(() => { if (typeof params.open === "string") setSel(params.open) }, [params.open])
  if (!ws || !profiles) return <div />
  const profile = profiles.items.find((p) => p.id === ws.activeProfile) ?? profiles.items[0]
  const selected = profile.widgets.find((w) => w.id === sel) ?? profile.widgets[0] ?? null
  const primary = displays.find((d) => d.primary) ?? displays[0]
  const add = (t: WidgetType) => {
    const d = primary ?? { id: "0", workArea: { width: 1600, height: 900 } }
    const w = addWidget(t, d.id, d.workArea)
    setAdding(false)
    if (w) setSel(w.id)
  }

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHead title="Widgets" desc="Ficam na área de trabalho, na frente do papel de parede e atrás das janelas."
        actions={<div className="row">
          <button type="button" className="btn" onClick={() => void patch("widgets", { editMode: true, enabled: true })}><Pencil size={14} />Mover na área de trabalho</button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} />Adicionar widget</button>
        </div>} />

      <div className="card card-pad row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <span className="label">Perfil</span>
        <Select label="Perfil ativo" value={profile.id} onChange={(v) => { void patch("widgets", { activeProfile: v }); setSel(null) }} options={profiles.items.map((p) => ({ value: p.id, label: `${p.name} (${p.widgets.length})` }))} />
        <input className="field" style={{ width: 170 }} defaultValue={profile.name} key={profile.id} aria-label="Nome do perfil" onBlur={(e) => renameProfile(profile.id, e.target.value)} />
        <button type="button" className="btn" style={{ height: 26, padding: "0 10px", fontSize: 12 }} onClick={() => createProfile("Novo perfil")}><Plus size={12} />Novo</button>
        <button type="button" className="btn btn-sm" onClick={() => createProfile(profile.name + " (cópia)", profile.id)}><Copy size={12} />Duplicar</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={profiles.items.length <= 1} onClick={() => deleteProfile(profile.id)}><Trash2 size={12} />Excluir</button>
        <span className="grow" />
        <span className="row small muted" style={{ gap: 8 }}>Mostrar widgets<Switch label="Mostrar widgets" checked={ws.enabled} onChange={(v) => void patch("widgets", { enabled: v })} /></span>
        <span className="row small muted" style={{ gap: 8 }} title="Jogo, vídeo ou apresentação em tela cheia: os widgets daquele monitor somem e param de atualizar">Esconder em tela cheia<Switch label="Esconder em tela cheia" checked={ws.hideFullscreen} onChange={(v) => void patch("widgets", { hideFullscreen: v })} /></span>
      </div>

      {!profile.widgets.length ? (
        <div className="card card-pad col" style={{ alignItems: "center", textAlign: "center", padding: 40, gap: 8 }}>
          <LayoutGrid size={30} className="dim" />
          <div className="h2">Nenhum widget neste perfil</div>
          <div className="small muted">Comece por relógio, clima ou música. Dá para mudar tudo depois.</div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 6 }} onClick={() => setAdding(true)}><Plus size={14} />Adicionar widget</button>
        </div>
      ) : (
        <div className="split" style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
          <div className="card" style={{ padding: 6, position: "sticky", top: 0 }}>
            {profile.widgets.map((w) => {
              const def = CATALOG[w.type], I = ICON[w.type]
              return (
                <div key={w.id} className={cx("list-row")} onClick={() => setSel(w.id)} style={{ cursor: "pointer", background: selected?.id === w.id ? "var(--s2)" : undefined }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--s2)", color: w.color || "var(--fg)", flex: "none", opacity: w.enabled ? 1 : 0.4 }}><I size={16} /></span>
                  <div className="grow" style={{ minWidth: 0, opacity: w.enabled ? 1 : 0.5 }}>
                    <div className="truncate" style={{ fontWeight: 500 }}>{def.name}</div>
                    <div className="tiny muted truncate">{w.enabled ? `${w.w}×${w.h}` : "escondido"}{w.locked ? " · travado" : ""}</div>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}><Switch label={`Mostrar ${def.name}`} checked={w.enabled} onChange={(v) => updateWidget(w.id, { enabled: v })} /></span>
                </div>
              )
            })}
          </div>
          {selected && <Editor key={selected.id} w={selected} displays={displays} onRemoved={() => setSel(null)} />}
        </div>
      )}

      {adding && <Catalog onPick={add} onClose={() => setAdding(false)} />}
    </div>
  )
}

function Editor({ w, displays, onRemoved }: { w: WidgetInstance; displays: DisplayInfo[]; onRemoved: () => void }) {
  const def = CATALOG[w.type], I = ICON[w.type]
  const [tab, setTab] = useState<Tab>("content")
  const hasContent = def.fields.length > 0 || !!def.Settings
  const t = hasContent ? tab : tab === "content" ? "look" : tab
  return (
    <div className="card">
      <div className="row" style={{ padding: "14px 16px 0", gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)" }}><I size={18} /></span>
        <div className="grow"><div className="h2">{def.name}</div><div className="small muted">{def.desc}</div></div>
        <button type="button" className="icon-btn" title={w.locked ? "Destravar posição" : "Travar posição"} aria-label={w.locked ? "Destravar posição" : "Travar posição"} onClick={() => updateWidget(w.id, { locked: !w.locked })}>{w.locked ? <Lock size={15} /> : <LockOpen size={15} />}</button>
        <button type="button" className="icon-btn" title="Duplicar" aria-label="Duplicar" onClick={() => duplicateWidget(w.id)}><Copy size={15} /></button>
        <button type="button" className="icon-btn" title="Remover" aria-label="Remover" onClick={() => { removeWidget(w.id); onRemoved() }}><Trash2 size={15} /></button>
      </div>
      <Tabs label="Opções do widget" className="tabs-editor" value={t} onChange={setTab}
        tabs={[...(hasContent ? [{ id: "content" as Tab, label: "Conteúdo" }] : []), { id: "look" as Tab, label: "Aparência" }, { id: "place" as Tab, label: "Tamanho e posição" }]} />
      <div key={t} className="fade-in" style={{ padding: "6px 16px 16px" }}>
        {t === "content" && <Content w={w} />}
        {t === "look" && <Look w={w} />}
        {t === "place" && <Place w={w} displays={displays} />}
      </div>
    </div>
  )
}

function Content({ w }: { w: WidgetInstance }) {
  const def = CATALOG[w.type]
  return (
    <>
      {def.fields.filter((f) => !f.when || ((w.config[f.when.key] as string) ?? def.fields.find((x) => x.key === f.when!.key)?.default) === f.when.value).map((f) => (
        <Setting key={f.key} title={f.label}>
          {f.kind === "toggle"
            ? <Switch label={f.label} checked={(w.config[f.key] as boolean) ?? f.default} onChange={(v) => updateWidget(w.id, { config: { [f.key]: v } })} />
            : f.kind === "text"
              ? <input className="field" style={{ width: 260 }} aria-label={f.label} placeholder={f.placeholder} defaultValue={(w.config[f.key] as string) ?? f.default} onBlur={(e) => updateWidget(w.id, { config: { [f.key]: e.target.value.trim().slice(0, 80) } })} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              : <Select label={f.label} value={(w.config[f.key] as string) ?? f.default} onChange={(v) => updateWidget(w.id, { config: { [f.key]: v } })} options={f.options} />}
        </Setting>
      ))}
      {def.Settings && (
        <div className="widgy-settings" style={{ marginTop: 10 }}>
          <Suspense fallback={<div className="small muted">Carregando opções…</div>}>
            <def.Settings w={w} set={(p) => updateWidget(w.id, { config: p })} />
          </Suspense>
        </div>
      )}
    </>
  )
}

const BG_HELP: Record<WidgetBg, string> = {
  default: "Usa o visual padrão de Personalização › Widgets.",
  glass: "Vidro fosco: o papel de parede aparece desfocado por trás. Com papel de parede animado, fica translúcido.",
  solid: "Fundo opaco na cor do tema: mais legível sobre papéis de parede movimentados.",
  none: "Sem caixa nenhuma: só o conteúdo, com uma sombra leve no texto para continuar legível.",
}

/** o que o vidro está usando de verdade agora (e por que não desfoca, quando não dá) */
function GlassStatus() {
  const wp = useWallpaper()
  const [busy, setBusy] = useState(false)
  const text = !wp ? "Lendo o papel de parede…"
    : wp.kind === "image" ? "Usando seu papel de parede, desfocado por trás do widget."
    : wp.kind === "color" ? "Seu fundo é uma cor sólida: o vidro usa essa cor."
    : "Sem desfoque agora (" + wp.reason.replace(/\.$/, "") + "). O widget fica translúcido, mostrando a área de trabalho por trás."
  return (
    <div className="mt-2 flex items-center gap-3 text-[12px]" style={{ color: wp && wp.kind === "none" ? "var(--warn)" : "var(--muted)" }} role="status">
      <span className="min-w-0 flex-1">{text}</span>
      {wp?.kind !== "image" && (
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setBusy(true); void invoke("wallpaper:refresh").catch(() => {}).finally(() => setBusy(false)) }}>
          {busy ? "Lendo…" : "Ler de novo"}
        </button>
      )}
    </div>
  )
}

function Look({ w }: { w: WidgetInstance }) {
  const def = CATALOG[w.type]
  const bg = (w.bg ?? "default") as WidgetBg
  return (
    <>
      <Setting title="Fundo" desc={<>{BG_HELP[bg] + (def.bare && bg !== "none" && bg !== "default" ? " Este widget desenha o próprio fundo; o ajuste fino fica em Conteúdo." : "")}{bg === "glass" && <GlassStatus />}</>}>
        <Segmented label="Fundo" value={bg} onChange={(v) => updateWidget(w.id, { bg: v })} options={[{ value: "default", label: "Padrão" }, { value: "glass", label: "Vidro" }, { value: "solid", label: "Sólido" }, { value: "none", label: "Sem fundo" }]} />
      </Setting>
      <Setting title="Transparência" desc="O widget inteiro (conteúdo e fundo)."><Slider label="Opacidade" min={0.2} max={1} step={0.05} value={w.opacity} onChange={(v) => updateWidget(w.id, { opacity: v })} format={(v) => Math.round(v * 100) + "%"} /></Setting>
      <Setting title="Cor de destaque" desc="Barras, ponteiros e detalhes. “Do app” segue Personalização.">
        <ColorRow value={w.color} colors={SWATCHES} onChange={(c) => updateWidget(w.id, { color: c })} emptyLabel="Do app" />
      </Setting>
      {!def.bare && (
        <Setting title="Cor do texto" desc="Útil com papel de parede claro ou com “Sem fundo”.">
          <ColorRow value={w.textColor ?? ""} colors={TEXT_COLORS} onChange={(c) => updateWidget(w.id, { textColor: c })} emptyLabel="Do app" />
        </Setting>
      )}
      {!def.bare && (
        <Setting title="Fonte">
          <Segmented label="Fonte" value={w.font} onChange={(v) => updateWidget(w.id, { font: v })} options={[{ value: "inter", label: "Inter" }, { value: "grotesk", label: "Grotesk" }, { value: "mono", label: "Mono" }]} />
        </Setting>
      )}
    </>
  )
}

function ColorRow({ value, colors, onChange, emptyLabel }: { value: string; colors: string[]; onChange: (c: string) => void; emptyLabel: string }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 380 }}>
      <button type="button" className={cx("btn btn-sm", !value && "btn-primary")} onClick={() => onChange("")}>{emptyLabel}</button>
      {colors.map((c) => <button key={c} type="button" className="swatch" aria-label={c} title={c} aria-pressed={value.toLowerCase() === c.toLowerCase()} style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.15)" }} onClick={() => onChange(c)} />)}
      <label className="swatch" title="Outra cor" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", position: "relative", overflow: "hidden" }}>
        <input type="color" aria-label="Outra cor" value={value || "#ffffff"} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
      </label>
    </div>
  )
}

function Place({ w, displays }: { w: WidgetInstance; displays: DisplayInfo[] }) {
  const def = CATALOG[w.type]
  return (
    <>
      <Setting title="Tamanho" desc="Ou arraste o canto em “Mover na área de trabalho”.">
        <div className="row">
          <input className="field num" style={{ width: 80 }} type="number" aria-label="Largura" min={def.min.w} value={w.w} onChange={(e) => updateWidget(w.id, { w: Math.max(def.min.w, Number(e.target.value) || def.min.w) })} />
          <span className="muted">×</span>
          <input className="field num" style={{ width: 80 }} type="number" aria-label="Altura" min={def.min.h} value={w.h} onChange={(e) => updateWidget(w.id, { h: Math.max(def.min.h, Number(e.target.value) || def.min.h) })} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => updateWidget(w.id, { w: def.size.w, h: def.size.h })}>Tamanho padrão</button>
        </div>
      </Setting>
      <Setting title="Posição" desc={`x ${w.x}, y ${w.y} na área útil do monitor.`}>
        <button type="button" className="btn btn-sm" onClick={() => void patch("widgets", { editMode: true, enabled: true })}><Pencil size={12} />Mover na área de trabalho</button>
      </Setting>
      <Setting title="Travar" desc="Impede mover ou redimensionar sem querer."><Switch label="Travar posição" checked={w.locked} onChange={(v) => updateWidget(w.id, { locked: v })} /></Setting>
      {displays.length > 1 && (
        <Setting title="Monitor">
          <Select label="Monitor" value={w.display} onChange={(v) => updateWidget(w.id, { display: v, x: 48, y: 48 })} options={displays.map((d, i) => ({ value: d.id, label: `${d.primary ? "Principal" : `Monitor ${i + 1}`} · ${d.bounds.width}×${d.bounds.height}` }))} />
        </Setting>
      )}
    </>
  )
}

function Catalog({ onPick, onClose }: { onPick: (t: WidgetType) => void; onClose: () => void }) {
  // fecha com animação de saída (160 ms) antes de sair da tela
  const [closing, setClosing] = useState(false)
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [closing])
  return (
    <div role="dialog" aria-modal="true" aria-label="Adicionar widget" onClick={close} className={"modal-back" + (closing ? " modal-closing" : "")}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 6 }}><h2 className="h2 grow">Adicionar widget</h2><button type="button" className="icon-btn" aria-label="Fechar" onClick={close}><X size={16} /></button></div>
        <p className="small muted" style={{ margin: "0 0 14px" }}>Ele aparece num espaço livre da área de trabalho. Depois é só ajustar aqui ou arrastar.</p>
        {GROUPS.map((g) => (
          <Group key={g.title} title={g.title}>
            {g.types.map((t) => {
              const def = CATALOG[t], I = ICON[t]
              return (
                <button key={t} type="button" onClick={() => onPick(t)} className="list-row" style={{ border: "1px solid var(--line)", background: "var(--s1)", textAlign: "left", alignItems: "flex-start" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", flex: "none" }}><I size={18} /></span>
                  <div className="grow"><div style={{ fontWeight: 600 }}>{def.name}</div><div className="tiny muted" style={{ marginTop: 2 }}>{def.desc}</div></div>
                </button>
              )
            })}
          </Group>
        ))}
      </div>
    </div>
  )
}
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="cap" style={{ marginBottom: 8 }}>{title}</div>
    <div className="grid-2" style={{ gap: 8 }}>{children}</div>
  </div>
)
