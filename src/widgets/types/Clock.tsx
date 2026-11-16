import { useNow } from "@/shared/hooks"
import { cfg, type WidgetProps } from "../catalog"
import { useSection } from "@/shared/state"
import { fmtClock } from "@/shared/theme"

export default function Clock({ w, paused }: WidgetProps) {
  const style = cfg<string>(w, "style", "digital"), seconds = cfg(w, "seconds", false), showDate = cfg(w, "date", true)
  // segundos só quando pedidos e quando nada está pausando; senão um re-render por minuto
  const now = useNow(seconds && !paused ? 1000 : 60000)
  const hour12 = !!useSection("settings")?.hour12
  const hm = fmtClock(now, hour12)
  const d = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
  const date = d.charAt(0).toUpperCase() + d.slice(1)
  const fit = Math.min(w.w / (seconds ? 5.2 : 3.6), w.h * 0.52)
  if (style === "analog") return <Analog now={now} seconds={seconds && !paused} size={Math.min(w.w, w.h) - 24} date={showDate ? date : ""} />
  if (style === "stacked") {
    return (
      <div className="wg-body" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="wg-big" style={{ fontSize: Math.min(w.h * 0.36, w.w * 0.3) }}>{String(now.getHours()).padStart(2, "0")}</div>
        <div style={{ height: 3, width: 26, borderRadius: 2, background: "var(--accent)", margin: "6px 0" }} />
        <div className="wg-big" style={{ fontSize: Math.min(w.h * 0.36, w.w * 0.3) }}>{String(now.getMinutes()).padStart(2, "0")}</div>
      </div>
    )
  }
  return (
    <div className="wg-body" style={{ justifyContent: "center" }}>
      <div className="wg-big" style={{ fontSize: fit }}>
        {hm}{seconds && <span style={{ fontSize: fit * 0.42, color: "var(--muted)", marginLeft: 6 }}>{String(now.getSeconds()).padStart(2, "0")}</span>}
      </div>
      {showDate && <div style={{ marginTop: 8, color: "var(--muted)", fontSize: Math.max(11, Math.min(14, w.w / 22)) }} className="truncate">{date}</div>}
    </div>
  )
}

function Analog({ now, seconds, size, date }: { now: Date; seconds: boolean; size: number; date: string }) {
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds()
  const hand = (deg: number, len: number, wd: number, color: string) => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={color} strokeWidth={wd} strokeLinecap="round" />
  )
  return (
    <div className="wg-body" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <svg viewBox="0 0 100 100" width={Math.max(60, size)} height={Math.max(60, size)} aria-label={now.toLocaleTimeString("pt-BR")}>
        <circle cx="50" cy="50" r="47" fill="var(--s1)" stroke="var(--line-2)" />
        {Array.from({ length: 12 }, (_, i) => <line key={i} x1="50" y1="7" x2="50" y2={i % 3 ? 11 : 14} stroke="var(--muted)" strokeWidth={i % 3 ? 1.2 : 2} transform={`rotate(${i * 30} 50 50)`} />)}
        {hand(h * 30 + m / 2, 24, 4, "var(--fg)")}
        {hand(m * 6, 34, 2.6, "var(--fg)")}
        {seconds && hand(s * 6, 38, 1.2, "var(--accent)")}
        <circle cx="50" cy="50" r="2.6" fill="var(--accent)" />
      </svg>
      {date && <div style={{ color: "var(--muted)", fontSize: 12 }}>{date}</div>}
    </div>
  )
}
