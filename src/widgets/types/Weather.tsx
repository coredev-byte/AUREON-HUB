import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, Moon, Snowflake, Sun, Wind } from "lucide-react"
import { invoke } from "@/shared/bridge"
import { useWeather } from "@/shared/hooks"
import type { Weather as W, WeatherKind } from "@/shared/types"
import { cfg, type WidgetProps } from "../catalog"

const ICON: Record<WeatherKind, typeof Sun> = { clear: Sun, cloudy: Cloud, fog: CloudFog, rain: CloudRain, snow: Snowflake, storm: CloudLightning }
const iconOf = (kind: WeatherKind, day: boolean) => (kind === "clear" && !day ? Moon : kind === "cloudy" && day ? CloudSun : ICON[kind])
/** cor discreta por condição (só um tom no fundo; nada de gradiente chamativo) */
const TINT: Record<WeatherKind, string> = { clear: "#e9b44c", cloudy: "#9aa3b2", fog: "#9aa3b2", rain: "#4f8fe0", snow: "#cfe3ff", storm: "#a78bfa" }

export default function Weather({ w }: WidgetProps) {
  const data = useWeather()
  const ok = data && "temp" in data ? (data as W) : null
  if (!ok) {
    const err = (data && "error" in data ? data.error : "") ?? ""
    return (
      <div className="wg-body" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 6, color: "var(--muted)" }} data-interactive="true">
        <Cloud size={22} />
        <div className="small">{err || "Carregando clima…"}</div>
        {err.includes("cidade") && <button type="button" className="btn btn-sm" onClick={() => void invoke("app:open", "settings")}>Escolher cidade</button>}
      </div>
    )
  }
  const I = iconOf(ok.kind, ok.isDay)
  const showDays = cfg(w, "forecast", true) && w.h >= 150 && w.w >= 230
  const big = Math.min(w.h * (showDays ? 0.26 : 0.4), w.w * 0.22)
  return (
    <div className="wg-body" style={{ gap: 10 }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 100% 0%, ${TINT[ok.kind]}1f, transparent 60%)` }} />
      <div className="row" style={{ position: "relative", alignItems: "flex-start" }}>
        <div className="grow">
          <div className="wg-label truncate">{ok.city}{ok.stale ? " · desatualizado" : ""}</div>
          <div className="wg-big" style={{ fontSize: big, marginTop: 4 }}>{Math.round(ok.temp)}°</div>
          <div className="small" style={{ marginTop: 4 }}>{ok.label}</div>
        </div>
        <I size={Math.max(22, big * 0.7)} color={TINT[ok.kind]} />
      </div>
      {showDays ? (
        <div className="row" style={{ position: "relative", marginTop: "auto", gap: 4, justifyContent: "space-between" }}>
          {ok.days.slice(1, 5).map((d) => {
            const DI = iconOf(d.kind, true)
            return (
              <div key={d.date} className="col" style={{ alignItems: "center", gap: 3, fontSize: 11 }}>
                <span className="muted">{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                <DI size={15} color="var(--muted)" />
                <span className="num">{Math.round(d.max)}° <span className="dim">{Math.round(d.min)}°</span></span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="row tiny muted" style={{ position: "relative", marginTop: "auto", gap: 12 }}>
          <span className="row" style={{ gap: 4 }}><Droplets size={12} />{ok.humidity}%</span>
          <span className="row" style={{ gap: 4 }}><Wind size={12} />{Math.round(ok.wind)} km/h</span>
        </div>
      )}
    </div>
  )
}
