import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { appLabel, fmtTime, mediaCommand, useMedia, useMediaPosition } from "@/shared/hooks"
import { cfg, type WidgetProps } from "../catalog"

export default function Media({ w, paused }: WidgetProps) {
  const filter = cfg(w, "source", "")
  const { session: m, state } = useMedia(filter)
  const pos = useMediaPosition(paused ? null : m)
  if (!m) {
    return (
      <div className="wg-body" style={{ justifyContent: "center", alignItems: "center", gap: 6, color: "var(--muted)", textAlign: "center" }}>
        <Music2 size={22} />
        <div className="small">{!state.supported ? "Leitura de mídia só no Windows." : state.error || (filter ? `Nada tocando no ${appLabel(filter)}.` : "Nada tocando agora.")}</div>
      </div>
    )
  }
  const art = Math.min(w.h - 28, w.w * 0.36)
  const pct = m.dur ? Math.min(100, ((paused ? m.pos : pos) / m.dur) * 100) : 0
  return (
    <div className="wg-body" style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
      {m.art ? <img src={m.art} alt="" style={{ width: art, height: art, borderRadius: 10, objectFit: "cover", flex: "none" }} /> : <div style={{ width: art, height: art, borderRadius: 10, background: "var(--s2)", display: "grid", placeItems: "center", flex: "none" }}><Music2 size={20} /></div>}
      <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
        <div>
          <div className="wg-label">{appLabel(m.app)}</div>
          <div className="truncate" style={{ fontWeight: 600 }}>{m.title}</div>
          <div className="truncate small muted">{m.artist}</div>
        </div>
        {w.h >= 120 && m.dur > 0 && (
          <div className="col" style={{ gap: 3 }}>
            <div className="wg-bar"><i style={{ width: pct + "%", background: "var(--fg)" }} /></div>
            <div className="row num tiny dim"><span>{fmtTime(paused ? m.pos : pos)}</span><span className="grow" /><span>{fmtTime(m.dur)}</span></div>
          </div>
        )}
        <div className="row" style={{ gap: 2 }}>
          <button type="button" className="wg-ctrl" aria-label="Anterior" disabled={m.canPrev === false} onClick={() => void mediaCommand("prev", m.app)}><SkipBack size={15} /></button>
          <button type="button" className="wg-ctrl play" aria-label={m.playing ? "Pausar" : "Tocar"} onClick={() => void mediaCommand("toggle", m.app)}>{m.playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <button type="button" className="wg-ctrl" aria-label="Próxima" disabled={m.canNext === false} onClick={() => void mediaCommand("next", m.app)}><SkipForward size={15} /></button>
        </div>
      </div>
    </div>
  )
}
