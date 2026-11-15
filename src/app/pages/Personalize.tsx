import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Segmented, Setting, Slider, Switch } from "@/shared/ui"

const ACCENTS = [
  { c: "#0B7BFA", n: "Azul Aureon" }, { c: "#5AB0FF", n: "Céu" }, { c: "#4EC98A", n: "Verde" }, { c: "#E9B44C", n: "Âmbar" },
  { c: "#F1B9C6", n: "Rosado" }, { c: "#A78BFA", n: "Lavanda" }, { c: "#ECEBEE", n: "Grafite claro" },
]
const SURFACES = [{ c: "#0E0E10", n: "Carbono" }, { c: "#000000", n: "Preto" }, { c: "#121418", n: "Grafite azulado" }, { c: "#141312", n: "Grafite quente" }, { c: "#0D1117", n: "Noite" }]

export default function Personalize() {
  const s = useSection("settings")
  if (!s) return <div />
  const set = (v: Partial<typeof s>) => void patch("settings", v)
  return (
    <div className="page">
      <PageHead title="Personalização" desc="O visual Carbono vale para o app, o notch e os widgets." />
      <Section title="Cores">
        <Setting title="Destaque" desc="Usado com parcimônia: seleção, progresso e indicadores.">
          <div className="row" style={{ gap: 6 }}>
            {ACCENTS.map((a) => <button key={a.c} type="button" className="swatch" title={a.n} aria-label={a.n} aria-pressed={s.accent.toLowerCase() === a.c.toLowerCase()} style={{ background: a.c }} onClick={() => set({ accent: a.c })} />)}
            <input type="color" aria-label="Outra cor" value={s.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 30, height: 28, border: 0, background: "transparent", padding: 0 }} />
          </div>
        </Setting>
        <Setting title="Fundo">
          <div className="row" style={{ gap: 6 }}>
            {SURFACES.map((a) => <button key={a.c} type="button" className="swatch" title={a.n} aria-label={a.n} aria-pressed={s.surface.toLowerCase() === a.c.toLowerCase()} style={{ background: a.c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }} onClick={() => set({ surface: a.c })} />)}
          </div>
        </Setting>
      </Section>
      <Section title="Forma e texto">
        <Setting title="Fonte"><Segmented label="Fonte" value={s.font} onChange={(v) => set({ font: v })} options={[{ value: "inter", label: "Inter" }, { value: "grotesk", label: "Space Grotesk" }]} /></Setting>
        <Setting title="Arredondamento"><Slider label="Arredondamento" min={6} max={22} step={1} value={s.radius} onChange={(v) => set({ radius: v })} format={(v) => v + " px"} /></Setting>
      </Section>
      <Section title="Movimento">
        <Setting title="Reduzir animações" desc="Transições instantâneas, sem animação de música nem pet andando. O Windows com “efeitos de animação” desligados também ativa isto."><Switch label="Reduzir animações" checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></Setting>
      </Section>
    </div>
  )
}
