// Clima no estilo Aureon: cartão azul-marinho com cabeçalho, cidade, temperatura grande, condição, máxima e
// mínima, e uma cena ilustrada para cada tempo (sol, parcialmente nublado, nublado, chuva, tempestade,
// neblina, vento, neve e noite). Tudo desenhado aqui (SVG/CSS), com dados reais do Open-Meteo.
// Movimento só com transform/opacity (a placa de vídeo anima sozinha) e parado em tela cheia ou com
// "reduzir animações".
import { useEffect, useMemo, useState } from "react"
import { Cloud, MapPin, MoreHorizontal, X } from "lucide-react"
import { useStore } from "../widgy/compat/store"
import { friendlyError } from "../widgy/compat/bridge"
import { loadWeather, type Wx } from "../widgy/Weather"
import type { WidgetInstance } from "@/shared/types"
import "./weather-aureon.css"

import { sceneOf, type Scene } from "./weatherScene"
export type { Scene }

const c = (n: number) => Math.round(n) + "°C"

export default function WeatherAureon({ w, paused, bg }: { w: WidgetInstance; paused: boolean; bg: "default" | "glass" | "solid" | "none" }) {
  const globalCity = useStore((s) => s.settings.weatherCity)
  const globalCoords = useStore((s) => s.settings.weatherCoords)
  const city = (w.config.city as string) || globalCity
  const coords = !w.config.city && globalCity ? globalCoords : null
  const [wx, setWx] = useState<Wx | null>(null)
  const [err, setErr] = useState("")
  const [retry, setRetry] = useState(0)
  const [details, setDetails] = useState(false)

  useEffect(() => {
    let alive = true
    setErr("")
    const run = () => loadWeather(city, coords).then((d) => { if (alive) { setWx(d); setErr("") } }).catch((e) => { if (alive) setErr(friendlyError(e)) })
    void run()
    const id = setInterval(run, 15 * 60000)
    return () => { alive = false; clearInterval(id) }
  }, [city, coords?.lat, coords?.lon, retry])

  const s = useMemo(() => (wx ? sceneOf(wx.code, wx.isDay, wx.wind) : { scene: "cloudy" as Scene, label: "" }), [wx?.code, wx?.isDay, wx?.wind])
  const forced = w.config.scene as Scene | undefined
  const scene = forced && forced !== ("auto" as Scene) ? forced : s.scene
  const compact = w.h < 190 || w.w < 290
  const showScene = bg !== "none"

  return (
    <div className={"waur au-card" + (bg === "glass" ? " au-glass" : bg === "none" ? " au-clear" : "")} data-scene={scene} data-paused={paused} data-compact={compact}>
      {showScene && <SceneArt scene={scene} />}
      <div className="waur-head">
        <Cloud size={17} strokeWidth={1.8} />
        <span className="grow">Clima</span>
        <button type="button" className="waur-more" aria-label="Previsão completa" title="Próximas horas e dias" onClick={() => setDetails(true)}><MoreHorizontal size={18} /></button>
      </div>
      <hr className="au-sep" />
      <div className="waur-body">
        {err ? (
          <div className="col" style={{ gap: 8, alignItems: "flex-start" }}>
            <span className="small au-muted">{err}</span>
            <button type="button" className="au-btn au-btn-sm" onClick={() => setRetry((n) => n + 1)}>Tentar de novo</button>
          </div>
        ) : !wx ? <span className="small au-muted">Buscando o tempo…</span> : (
          <>
            <div className="waur-city"><MapPin size={14} strokeWidth={2} /><span className="truncate">{wx.city}</span></div>
            <div className="waur-temp au-score">{Math.round(wx.temp)}<span>°C</span></div>
            <div className="waur-label">{forced && forced !== ("auto" as Scene) ? s.label || "" : s.label}</div>
            {!compact && <hr className="au-sep waur-sep" />}
            <div className="waur-minmax">Máx. {c(wx.max)}<i />Mín. {c(wx.min)}</div>
          </>
        )}
      </div>
      <div className="waur-icon" aria-hidden><SceneIcon scene={scene} /></div>
      {details && wx && (
        <div className="waur-details" role="dialog" aria-label="Previsão completa">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="grow" style={{ fontWeight: 600 }}>{wx.city} · próximas horas</span>
            <button type="button" className="waur-more" aria-label="Fechar previsão" onClick={() => setDetails(false)}><X size={16} /></button>
          </div>
          <div className="waur-hours">
            {wx.hours.slice(0, 6).map((h, i) => <div key={i}><span>{h.t}</span><b className="au-score">{Math.round(h.temp)}°</b></div>)}
          </div>
          <hr className="au-sep" style={{ margin: "8px 0" }} />
          {wx.days.slice(0, 5).map((d, i) => (
            <div key={i} className="row small" style={{ padding: "3px 0" }}>
              <span className="grow" style={{ textTransform: "capitalize" }}>{i === 0 ? "Hoje" : d.d}</span>
              <span className="au-muted">{sceneOf(d.code, true).label}</span>
              <span className="au-score" style={{ width: 74, textAlign: "right" }}>{Math.round(d.min)}° / {Math.round(d.max)}°</span>
            </div>
          ))}
          <div className="tiny au-dim" style={{ marginTop: 6 }}>Umidade {wx.hum}% · vento {Math.round(wx.wind)} km/h · dados Open-Meteo</div>
        </div>
      )}
    </div>
  )
}

/* ───────────── cenas (lado direito do cartão) ───────────── */
function Clouds({ tone, n = 3 }: { tone: string; n?: number }) {
  const puffs = [
    "M60 150c-22 0-38-13-38-30s16-30 36-29c6-19 25-31 46-29 18 1 33 12 39 27 21-3 41 11 41 30s-17 31-40 31Z",
    "M250 190c-18 0-31-11-31-25s13-25 30-24c5-16 21-26 38-24 15 1 27 10 32 23 18-3 34 9 34 25s-14 26-33 26Z",
    "M150 80c-14 0-24-8-24-19s10-19 23-18c4-12 16-20 29-19 12 1 21 8 25 17 14-2 26 7 26 19s-11 20-25 20Z",
  ]
  return (
    <g className="waur-drift" filter="url(#waurBlur)" fill={tone}>
      {puffs.slice(0, n).map((d, i) => <path key={i} d={d} opacity={0.6 + i * 0.1} />)}
      {puffs.slice(0, n).map((d, i) => <path key={"h" + i} d={d} fill="#fff" opacity={0.12} transform="translate(0 -6) scale(.98)" />)}
    </g>
  )
}

function SceneArt({ scene }: { scene: Scene }) {
  return (
    <div className="waur-scene" aria-hidden>
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMaxYMid slice">
        <defs>
          <filter id="waurBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="waurSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
          <radialGradient id="waurSun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffd56a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd56a" stopOpacity="0" /></radialGradient>
          <radialGradient id="waurMoon" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#4d8dff" stopOpacity=".35" /><stop offset="1" stopColor="#4d8dff" stopOpacity="0" /></radialGradient>
          <linearGradient id="waurMount" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b6b86" /><stop offset="1" stopColor="#1a2233" /></linearGradient>
        </defs>
        {scene === "sun" && <><circle cx="300" cy="95" r="120" fill="url(#waurSun)" /><g transform="translate(150 140)"><Clouds tone="#f3c98a" /></g></>}
        {scene === "partly" && <><circle cx="250" cy="70" r="90" fill="url(#waurSun)" opacity=".5" /><g transform="translate(120 120)"><Clouds tone="#c9d6ea" /></g></>}
        {scene === "cloudy" && <><g transform="translate(70 40)"><Clouds tone="#7d8aa3" /></g><g transform="translate(160 140)"><Clouds tone="#5f6c84" /></g></>}
        {(scene === "rain" || scene === "storm") && <><g transform="translate(80 10)"><Clouds tone={scene === "storm" ? "#4a5874" : "#5d6d8a"} /></g><g transform="translate(170 160)"><Clouds tone="#6b7a97" n={2} /></g></>}
        {scene === "storm" && <path className="waur-flash" d="M282 34 L252 96 L270 96 L246 150" stroke="#9cc4ff" strokeWidth="2.2" fill="none" filter="url(#waurSoft)" />}
        {scene === "fog" && (
          <>
            <g fill="#2a3446" opacity=".95">
              <path d="M150 260V200h14v-26h18v26h10v-40h22v40h8v-18h16v18h12v60Z" />
              <path d="M90 260c10-30 25-45 40-40 10-25 30-30 45-12 20-18 50-10 60 15 25-5 45 10 60 37Z" fill="#1e2635" />
            </g>
            <g className="waur-fog" filter="url(#waurBlur)" fill="#9aa8bf"><rect x="40" y="150" width="380" height="30" rx="15" opacity=".35" /><rect x="0" y="200" width="420" height="40" rx="20" opacity=".4" /></g>
          </>
        )}
        {scene === "wind" && <g transform="translate(120 130)"><Clouds tone="#55647f" n={2} /></g>}
        {scene === "snow" && (
          <>
            <path d="M120 260 L210 170 L240 195 L290 140 L400 240 L400 260Z" fill="url(#waurMount)" opacity=".9" />
            <path d="M290 140 L272 157 L283 160 L294 150 L304 156Z" fill="#cfd8e8" opacity=".8" />
            <g transform="translate(150 180)"><Clouds tone="#8fa0bb" n={2} /></g>
          </>
        )}
        {(scene === "night" || scene === "night-cloudy") && (
          <>
            <circle cx="300" cy="90" r="110" fill="url(#waurMoon)" />
            <g fill="#dfe8ff">{[[120, 40], [180, 90], [230, 30], [360, 40], [380, 150], [140, 150], [260, 200], [330, 230]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 1 : 1.6} className={i % 2 ? "waur-twinkle" : undefined} style={{ animationDelay: i * 0.7 + "s" }} />)}</g>
            <g transform="translate(160 170)"><Clouds tone={scene === "night" ? "#33415e" : "#46557a"} n={scene === "night" ? 2 : 3} /></g>
          </>
        )}
      </svg>
      {(scene === "rain" || scene === "storm") && <div className="waur-rain" />}
      {scene === "snow" && <div className="waur-snow" />}
      {scene === "wind" && <div className="waur-gust"><i /><i /><i /></div>}
    </div>
  )
}

/* ───────────── ícones (traço branco com brilho e detalhe em azul) ───────────── */
const CLOUD = "M22 50h30a13 13 0 0 0 1-26 18 18 0 0 0-34 4 11 11 0 0 0 3 22Z"
function SceneIcon({ scene }: { scene: Scene }) {
  const white = { stroke: "#fff", strokeWidth: 2.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const blue = { ...white, stroke: "var(--au-glow)" }
  return (
    <svg viewBox="0 0 72 72" width="100%" height="100%">
      {scene === "sun" && (
        <g stroke="#ffc94d" strokeWidth="3" fill="none" strokeLinecap="round" className="waur-sun">
          <circle cx="36" cy="36" r="13" stroke="#fff" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="36" y1="10" x2="36" y2="17" transform={`rotate(${a} 36 36)`} />)}
        </g>
      )}
      {scene === "partly" && (
        <>
          <g {...blue} className="waur-sun"><path d="M44 22a10 10 0 0 1 12 12" /><line x1="50" y1="9" x2="50" y2="14" /><line x1="62" y1="16" x2="59" y2="19" /><line x1="66" y1="28" x2="61" y2="28" /><line x1="62" y1="40" x2="59" y2="37" /></g>
          <path d={CLOUD} {...white} transform="translate(-2 8)" />
        </>
      )}
      {scene === "cloudy" && <><path d={CLOUD} {...white} transform="translate(10 -2) scale(.8)" opacity=".7" /><path d={CLOUD} {...white} transform="translate(-4 8)" /><path d="M18 58h34" {...blue} transform="translate(-4 0)" /></>}
      {scene === "rain" && <><path d={CLOUD} {...white} /><g {...blue}><line x1="24" y1="56" x2="21" y2="64" /><line x1="34" y1="56" x2="31" y2="64" /><line x1="44" y1="56" x2="41" y2="64" /></g></>}
      {scene === "storm" && <><path d={CLOUD} {...white} /><path d="M37 46l-6 10h7l-4 9 11-13h-7l4-6Z" fill="var(--au-glow)" stroke="none" /><g {...blue} strokeWidth="2"><line x1="22" y1="56" x2="20" y2="62" /><line x1="50" y1="56" x2="48" y2="62" /></g></>}
      {scene === "fog" && <><path d={CLOUD} {...white} /><g {...blue} stroke="#a9c6ff"><line x1="16" y1="58" x2="56" y2="58" /><line x1="20" y1="64" x2="52" y2="64" /></g></>}
      {scene === "wind" && <><path d={CLOUD} {...white} opacity=".85" /><g {...blue}><path d="M14 44h36a6 6 0 1 0-6-6" /><path d="M20 52h30a6 6 0 1 1-6 6" /></g></>}
      {scene === "snow" && <><path d={CLOUD} {...white} /><g {...white} strokeWidth="2">{[22, 36, 50].map((x, i) => <g key={x} transform={`translate(${x} ${60 + (i === 1 ? 2 : 0)})`}><line x1="-4" y1="0" x2="4" y2="0" /><line x1="-2" y1="-3.5" x2="2" y2="3.5" /><line x1="2" y1="-3.5" x2="-2" y2="3.5" /></g>)}</g></>}
      {(scene === "night" || scene === "night-cloudy") && (
        <>
          <path d="M44 14a20 20 0 1 0 14 30A16 16 0 0 1 44 14Z" {...white} stroke="#dbe6ff" style={{ filter: "drop-shadow(0 0 5px var(--au-glow))" }} />
          <g fill="#fff"><path d="M56 12l1.4 4 4 1.4-4 1.4L56 23l-1.4-4-4-1.4 4-1.4Z" /><circle cx="62" cy="28" r="1.3" /></g>
          {scene === "night-cloudy" && <path d={CLOUD} {...white} transform="translate(8 14) scale(.75)" />}
        </>
      )}
    </svg>
  )
}
