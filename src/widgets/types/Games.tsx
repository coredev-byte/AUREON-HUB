import { Gamepad2 } from "lucide-react"
import { fmtTime, useGames, useNow } from "@/shared/hooks"
import type { WidgetProps } from "../catalog"

export default function Games({ w, paused }: WidgetProps) {
  const { current, history } = useGames()
  const now = useNow(current && !paused ? 1000 : 60000)
  const recent = history.filter((g) => g.known).slice(0, w.h >= 150 ? 3 : 1)
  return (
    <div className="wg-body" style={{ gap: 10 }}>
      <div className="wg-label">Jogos</div>
      {current ? (
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: (current.color || "#888") + "22", color: current.color || "var(--fg)" }}><Gamepad2 size={18} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 600 }}>{current.known ? current.name : "App em tela cheia"}</div>
            <div className="small muted num">jogando há {fmtTime((now.getTime() - current.since) / 1000)}</div>
          </div>
        </div>
      ) : (
        <div className="small muted">Nenhum jogo aberto. Em tela cheia, os widgets daquele monitor somem para não pesar.</div>
      )}
      {recent.length > 0 && (
        <div className="col" style={{ gap: 4, marginTop: "auto" }}>
          {recent.map((g) => (
            <div key={g.exe + g.since} className="row tiny">
              <span className="dot" style={{ color: g.color || "var(--muted)" }} />
              <span className="grow truncate">{g.name}</span>
              <span className="num dim">{fmtTime(((g.ended ?? g.since) - g.since) / 1000)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
