import { Cpu, MemoryStick } from "lucide-react"
import { fmtBytes, useSystem } from "@/shared/hooks"
import { cfg, type WidgetProps } from "../catalog"

export default function System({ w }: WidgetProps) {
  const s = useSystem()
  if (!s) return <div className="wg-body muted small" style={{ justifyContent: "center" }}>Lendo o sistema…</div>
  const mem = (s.memUsed / s.memTotal) * 100
  const row = (icon: React.ReactNode, label: string, pct: number, detail: string) => (
    <div className="col" style={{ gap: 5 }}>
      <div className="row small">{icon}<span className="grow">{label}</span><span className="num">{Math.round(pct)}%</span></div>
      <div className="wg-bar"><i style={{ width: Math.min(100, pct) + "%", background: pct > 85 ? "var(--bad)" : "var(--accent)" }} /></div>
      <div className="tiny dim truncate">{detail}</div>
    </div>
  )
  return (
    <div className="wg-body" style={{ gap: 12, justifyContent: "center" }}>
      {row(<Cpu size={13} />, "Processador", s.cpu, `${s.cores} núcleos`)}
      {row(<MemoryStick size={13} />, "Memória", mem, `${fmtBytes(s.memUsed)} de ${fmtBytes(s.memTotal)}`)}
      {cfg(w, "own", false) && <div className="tiny muted">Aureon: {s.app.cpu}% CPU · {fmtBytes(s.app.mem)}</div>}
    </div>
  )
}
