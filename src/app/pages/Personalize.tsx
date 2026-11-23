import { RotateCcw } from "lucide-react"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Segmented, Setting, Slider, Switch, Select } from "@/shared/ui"
import { NUM_FONTS, UI_FONTS, fmtClock } from "@/shared/theme"
import { useNow } from "@/shared/hooks"
import type { NumFont, Settings, UiFont } from "@/shared/types"
import "@/notch/notch.css"
import "@/widgets/widgets.css"

const ACCENTS = [
  { c: "#19C3FF", n: "Ciano Aureon" }, { c: "#0B7BFA", n: "Azul Aureon" }, { c: "#5AB0FF", n: "Céu" }, { c: "#22C3A6", n: "Turquesa" }, { c: "#4EC98A", n: "Verde" },
  { c: "#E9B44C", n: "Âmbar" }, { c: "#FF7A45", n: "Laranja" }, { c: "#FF4655", n: "Vermelho Valorant" }, { c: "#F1B9C6", n: "Rosado" },
  { c: "#A78BFA", n: "Lavanda" }, { c: "#ECEBEE", n: "Grafite claro" },
]
const SURFACES = [
  { c: "#0B0C0F", n: "Aureon" }, { c: "#0E0E10", n: "Carbono" }, { c: "#000000", n: "Preto" }, { c: "#121418", n: "Grafite azulado" }, { c: "#141312", n: "Grafite quente" },
  { c: "#0D1117", n: "Noite" }, { c: "#120E18", n: "Ameixa" }, { c: "#0E1410", n: "Musgo" }, { c: "#170D10", n: "Vinho" },
]
/** combinações prontas (mudam só cores e fontes; o resto continua como você deixou) */
const PRESETS: { id: string; name: string; set: Partial<Settings> }[] = [
  { id: "aureon", name: "Aureon", set: { accent: "#19C3FF", surface: "#0B0C0F", font: "inter", numFont: "grotesk" } },
  { id: "carbono", name: "Carbono", set: { accent: "#0B7BFA", surface: "#0E0E10", font: "inter", numFont: "grotesk" } },
  { id: "noite", name: "Meia-noite", set: { accent: "#5AB0FF", surface: "#0D1117", font: "inter", numFont: "outfit" } },
  { id: "tatico", name: "Tático", set: { accent: "#FF4655", surface: "#0E0E10", font: "grotesk", numFont: "orbitron" } },
  { id: "terminal", name: "Terminal", set: { accent: "#4EC98A", surface: "#000000", font: "jetbrains", numFont: "sharetech" } },
  { id: "editorial", name: "Editorial", set: { accent: "#E9B44C", surface: "#141312", font: "playfair", numFont: "inter" } },
  { id: "ameixa", name: "Ameixa", set: { accent: "#A78BFA", surface: "#120E18", font: "outfit", numFont: "outfit" } },
]
const DEFAULTS: Partial<Settings> = {
  accent: "#19C3FF", surface: "#0B0C0F", font: "inter", numFont: "grotesk", radius: 12, reduceMotion: false, animSpeed: 1, textScale: 1, hour12: false,
  widgetBg: 0.88, widgetBlur: 14, widgetBorder: true, widgetShadow: "soft", widgetRadius: 14, notchColor: "black", notchBorder: false,
}

function Preview({ s }: { s: Settings }) {
  const now = useNow(60000)
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  return (
    <div style={{ position: "relative", height: 190, borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg, #2b3a4d, #6b7f95)" }} aria-label="Prévia">
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)" }}>
        <div className="notch" data-mode="idle" style={{ ["--w" as string]: "150px", ["--h" as string]: "28px", ["--r" as string]: "14px", ["--ear" as string]: "9px" }}>
          <div className="notch-clip"><div className="notch-content n-compact"><span className="n-clock">{fmtClock(now, s.hour12)}</span></div></div>
        </div>
      </div>
      <div className="wg" style={{ left: 22, top: 56, width: 230, height: 110, position: "absolute" }}>
        <div className="wg-body" style={{ justifyContent: "center" }}>
          <div className="wg-big" style={{ fontSize: 42 }}>{fmtClock(now, s.hour12)}</div>
          <div className="small muted" style={{ marginTop: 6 }}>{date.charAt(0).toUpperCase() + date.slice(1)}</div>
        </div>
      </div>
      <div className="card preview-card" style={{ position: "absolute", right: 22, top: 56, width: 230, padding: 14 }}>
        <div className="h3">Janela do app</div>
        <div className="small muted" style={{ margin: "4px 0 10px" }}>Texto, botões e destaque.</div>
        <div className="row"><button type="button" className="btn btn-primary btn-sm">Principal</button><button type="button" className="btn btn-sm">Secundário</button></div>
      </div>
    </div>
  )
}

export default function Personalize() {
  const s = useSection("settings")
  if (!s) return <div />
  const set = (v: Partial<Settings>) => void patch("settings", v)
  const swatch = (list: { c: string; n: string }[], cur: string, key: "accent" | "surface") => (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 360 }}>
      {list.map((a) => <button key={a.c} type="button" className="swatch" title={a.n} aria-label={a.n} aria-pressed={cur.toLowerCase() === a.c.toLowerCase()} style={{ background: a.c, boxShadow: key === "surface" ? "inset 0 0 0 1px rgba(255,255,255,.14)" : undefined }} onClick={() => set({ [key]: a.c })} />)}
      <input type="color" aria-label={key === "accent" ? "Outra cor de destaque" : "Outra cor de fundo"} value={cur} onChange={(e) => set({ [key]: e.target.value })} title="Outra cor" />
    </div>
  )
  return (
    <div className="page">
      <PageHead title="Personalização" desc="Vale para o app, o notch e os widgets. As mudanças aparecem na hora."
        actions={<button type="button" className="btn btn-ghost" onClick={() => set(DEFAULTS)}><RotateCcw size={13} />Voltar ao padrão</button>} />
      <div style={{ position: "sticky", top: -28, zIndex: 2, background: "var(--bg)", paddingBottom: 14, marginTop: -6 }}><Preview s={s} /></div>

      <Section title="Temas prontos" desc="Trocam cores e fontes de uma vez.">
        <div className="grid-3" style={{ gap: 8 }}>
          {PRESETS.map((p) => {
            const on = p.set.accent === s.accent && p.set.surface === s.surface && p.set.font === s.font && p.set.numFont === s.numFont
            return (
              <button key={p.id} type="button" className="list-row" aria-pressed={on} onClick={() => set(p.set)}
                style={{ border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, background: p.set.surface, textAlign: "left" }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: p.set.accent, flex: "none" }} />
                <span className="grow" style={{ fontFamily: UI_FONTS[p.set.font as UiFont].family, color: "#ecebee" }}>{p.name}</span>
                <span className="num" style={{ fontFamily: NUM_FONTS[p.set.numFont as NumFont].family, color: "#9a99a0" }}>12:45</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Cores">
        <Setting title="Destaque" desc="Seleção, progresso e indicadores.">{swatch(ACCENTS, s.accent, "accent")}</Setting>
        <Setting title="Fundo" desc="Janela, painéis e widgets.">{swatch(SURFACES, s.surface, "surface")}</Setting>
      </Section>

      <Section title="Texto">
        <Setting title="Fonte da interface">
          <Select label="Fonte da interface" value={s.font} onChange={(v) => set({ font: v })} options={(Object.keys(UI_FONTS) as UiFont[]).map((k) => ({ value: k, label: UI_FONTS[k].label }))} />
        </Setting>
        <Setting title="Fonte dos números" desc="Relógios, notch, placares e estatísticas.">
          <Select label="Fonte dos números" value={s.numFont} onChange={(v) => set({ numFont: v })} options={(Object.keys(NUM_FONTS) as NumFont[]).map((k) => ({ value: k, label: NUM_FONTS[k].label }))} />
        </Setting>
        <Setting title="Tamanho do texto" desc="Só a janela do app."><Slider label="Tamanho do texto" min={0.9} max={1.15} step={0.05} value={s.textScale} onChange={(v) => set({ textScale: v })} format={(v) => Math.round(v * 100) + "%"} /></Setting>
        <Setting title="Relógio"><Segmented label="Formato do relógio" value={s.hour12 ? "12" : "24"} onChange={(v) => set({ hour12: v === "12" })} options={[{ value: "24", label: "24 horas" }, { value: "12", label: "12 horas" }]} /></Setting>
      </Section>

      <Section title="Forma">
        <Setting title="Arredondamento do app"><Slider label="Arredondamento do app" min={6} max={22} step={1} value={s.radius} onChange={(v) => set({ radius: v })} format={(v) => v + " px"} /></Setting>
      </Section>

      <Section title="Widgets" desc="Visual padrão de todos os widgets (cada um ainda pode ter opacidade, fonte e cor próprias em Widgets).">
        <Setting title="Fundo" desc="Quanto do papel de parede aparece por trás."><Slider label="Opacidade do fundo dos widgets" min={0.2} max={1} step={0.02} value={s.widgetBg} onChange={(v) => set({ widgetBg: v })} format={(v) => Math.round(v * 100) + "%"} /></Setting>
        <Setting title="Desfoque" desc="O papel de parede aparece desfocado por trás dos widgets. 0 = desligado. Com papel de parede animado (Wallpaper Engine, Lively), os widgets ficam só translúcidos."><Slider label="Desfoque dos widgets" min={0} max={30} step={1} value={s.widgetBlur} onChange={(v) => set({ widgetBlur: v })} format={(v) => v + " px"} /></Setting>
        <Setting title="Arredondamento"><Slider label="Arredondamento dos widgets" min={4} max={28} step={1} value={s.widgetRadius} onChange={(v) => set({ widgetRadius: v })} format={(v) => v + " px"} /></Setting>
        <Setting title="Sombra"><Segmented label="Sombra dos widgets" value={s.widgetShadow} onChange={(v) => set({ widgetShadow: v })} options={[{ value: "none", label: "Nenhuma" }, { value: "soft", label: "Suave" }, { value: "strong", label: "Forte" }]} /></Setting>
        <Setting title="Contorno"><Switch label="Contorno dos widgets" checked={s.widgetBorder} onChange={(v) => set({ widgetBorder: v })} /></Setting>
      </Section>

      <Section title="Notch" desc="Tamanho, conteúdo e comportamento ficam na página Notch.">
        <Setting title="Cor" desc="Preto se confunde com a borda do monitor."><Segmented label="Cor do notch" value={s.notchColor} onChange={(v) => set({ notchColor: v })} options={[{ value: "black", label: "Preto" }, { value: "graphite", label: "Grafite" }, { value: "surface", label: "Do fundo" }]} /></Setting>
        <Setting title="Contorno sutil" desc="Uma linha fina embaixo, para destacar do papel de parede escuro."><Switch label="Contorno do notch" checked={s.notchBorder} onChange={(v) => set({ notchBorder: v })} /></Setting>
      </Section>

      <Section title="Movimento">
        <Setting title="Velocidade das animações"><Segmented label="Velocidade das animações" value={String(s.animSpeed)} onChange={(v) => set({ animSpeed: Number(v) })} options={[{ value: "0.6", label: "Rápida" }, { value: "1", label: "Normal" }, { value: "1.4", label: "Calma" }]} /></Setting>
        <Setting title="Reduzir animações" desc="Transições instantâneas, sem animação de música, pet ou agente. O Windows com “efeitos de animação” desligados também ativa isto."><Switch label="Reduzir animações" checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></Setting>
      </Section>
    </div>
  )
}
