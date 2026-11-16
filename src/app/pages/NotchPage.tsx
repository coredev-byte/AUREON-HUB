import { Bell, Music2 } from "lucide-react"
import { invoke } from "@/shared/bridge"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Segmented, Setting, Slider, Switch } from "@/shared/ui"
import { sizeOf, type Mode } from "@/notch/machine"
import "@/notch/notch.css"

const PREVIEW: { mode: Mode; label: string }[] = [
  { mode: "idle", label: "Repouso" }, { mode: "hover", label: "Mouse em cima" }, { mode: "media", label: "Música" },
  { mode: "sharing", label: "Transmitindo" }, { mode: "notification", label: "Aviso" },
]

export default function NotchPage() {
  const ns = useSection("notch"), s = useSection("settings")
  if (!ns || !s) return <div />
  const set = (v: Partial<typeof ns>) => void patch("notch", v)
  return (
    <div className="page">
      <PageHead title="Notch" desc="A peça no topo da tela: mostra hora, música, transmissão e avisos, e abre um painel ao passar o mouse." />
      <Section title="Estados" desc="Como o notch fica em cada situação (tamanho real, sem o conteúdo animado).">
        <div className="row" style={{ gap: 18, flexWrap: "wrap", alignItems: "flex-start", padding: "6px 0 4px" }}>
          {PREVIEW.map((p) => {
            const z = sizeOf(p.mode, { idleClock: ns.idleClock, fullscreen: false })
            return (
              <div key={p.mode} className="col" style={{ alignItems: "center", gap: 8 }}>
                <div style={{ background: "var(--bg)", borderRadius: 10, padding: "0 16px 12px", border: "1px solid var(--line)" }}>
                  <div className="notch" data-mode={p.mode} style={{ ["--w" as string]: z.w * 0.62 + "px", ["--h" as string]: z.h * 0.62 + "px", ["--r" as string]: z.r * 0.62 + "px", ["--ear" as string]: "7px" }} />
                </div>
                <span className="tiny muted">{p.label}</span>
              </div>
            )
          })}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => void invoke("notify:push", { kind: "info", title: "Aviso de teste", body: "É assim que os avisos aparecem no notch." })}><Bell size={13} />Mostrar um aviso de teste</button>
          <button type="button" className="btn btn-sm" onClick={() => void invoke("notify:push", { kind: "media", title: "Mídia", body: "Avisos de mídia aparecem do mesmo jeito." })}><Music2 size={13} />Aviso de mídia</button>
        </div>
      </Section>
      <Section title="Comportamento">
        <Setting title="Mostrar o notch"><Switch label="Mostrar o notch" checked={ns.enabled} onChange={(v) => set({ enabled: v })} /></Setting>
        <Setting title="Monitores"><Segmented label="Monitores" value={ns.displays} onChange={(v) => set({ displays: v })} options={[{ value: "primary", label: "Só o principal" }, { value: "all", label: "Todos" }]} /></Setting>
        <Setting title="Animação de abertura" desc="Ao iniciar o Aureon, a logo aparece e se transforma no notch."><Switch label="Animação de abertura" checked={ns.intro !== false} onChange={(v) => set({ intro: v })} /></Setting>
        <Setting title="Abrir ao passar o mouse" desc="Desligado: abre só com clique ou com o atalho."><Switch label="Abrir ao passar o mouse" checked={ns.hoverExpand} onChange={(v) => set({ hoverExpand: v })} /></Setting>
        <Setting title="Tempo até abrir" desc="Evita abrir sem querer quando o mouse só passa pelo topo."><Slider label="Tempo até abrir" min={0} max={800} step={20} value={ns.hoverDelay} onChange={(v) => set({ hoverDelay: v })} format={(v) => v + " ms"} /></Setting>
        <Setting title="Atalho" desc={<>Abre e fecha o notch: <span className="kbd">Ctrl</span> <span className="kbd">Alt</span> <span className="kbd">Espaço</span>. Não usa nem altera atalhos do Windows.</>}><Switch label="Atalho" checked={s.hotkeyOn} onChange={(v) => void patch("settings", { hotkeyOn: v })} /></Setting>
      </Section>
      <Section title="Conteúdo">
        <Setting title="Hora em repouso"><Switch label="Hora em repouso" checked={ns.idleClock} onChange={(v) => set({ idleClock: v })} /></Setting>
        <Setting title="Música tocando" desc="Mostra capa e título quando algum player está tocando."><Switch label="Música tocando" checked={ns.showMedia} onChange={(v) => set({ showMedia: v })} /></Setting>
        <Setting title="Player preferido">
          <select className="field" aria-label="Player preferido" value={ns.mediaSource} onChange={(e) => set({ mediaSource: e.target.value })}>
            <option value="">Qualquer um</option><option value="spotify">Spotify</option><option value="youtube">YouTube Music</option><option value="deezer">Deezer</option><option value="chrome">Chrome</option><option value="msedge">Edge</option>
          </select>
        </Setting>
        <Setting title="Avisos" desc="Transmissão, pedidos para assistir e avisos do app. Pedidos e alertas aparecem mesmo silenciado."><Switch label="Avisos" checked={ns.notifications} onChange={(v) => set({ notifications: v })} /></Setting>
        <Setting title="Indicador sobre tela cheia" desc="Enquanto você transmite, uma pílula mínima (sem cliques) fica visível sobre jogos e vídeos em tela cheia."><Switch label="Indicador sobre tela cheia" checked={ns.fullscreenIndicator} onChange={(v) => set({ fullscreenIndicator: v })} /></Setting>
      </Section>
      <Section title="Aparência">
        <Setting title="Tamanho"><Slider label="Tamanho" min={0.85} max={1.25} step={0.05} value={ns.scale} onChange={(v) => set({ scale: v })} format={(v) => Math.round(v * 100) + "%"} /></Setting>
      </Section>
    </div>
  )
}
