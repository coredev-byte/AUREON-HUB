// Widget Música no estilo Aureon: o mesmo painel da aba Mídia do notch (capa que pulsa e é cercada por traços
// que seguem as ondas do som, progresso em onda, controles, letra e escolha do player).
// Fundo "Vidro"/"Transparente": translúcido, com o papel de parede desfocado atrás e tingido pela cor da capa.
import { mediaCommand, useMedia, useMediaPosition } from "@/shared/hooks"
import { useCoverArt } from "@/shared/coverArt"
import { useCoverTint } from "@/shared/tint"
import type { WidgetInstance } from "@/shared/types"
import { MediaPanel } from "@/notch/CarbonoMedia"
import "./music-aureon.css"

type Bg = "default" | "glass" | "solid" | "none"

export default function MusicAureon({ w, paused, bg, update }: { w: WidgetInstance; paused: boolean; bg: Bg; update: (c: Record<string, unknown>) => void }) {
  const app = typeof w.config.app === "string" ? w.config.app : ""
  const { session } = useMedia(app)
  const art = useCoverArt(session)
  const pos = useMediaPosition(session, paused ? 1000 : 250)
  const m = session ? { ...session, art } : null
  const tintOn = w.config.tint !== false
  const tint = useCoverTint(tintOn ? art : null)
  const cmd = (c: Parameters<typeof mediaCommand>[0], a?: number | boolean) => { if (session) void mediaCommand(c, session.app, a) }

  // tamanho: capa, colunas e letra acompanham o widget
  const small = w.h < 170 || w.w < 420
  const lyrics = w.config.lyrics !== false && w.w >= 640 && w.h >= 200
  const cover = Math.round(Math.max(64, Math.min(w.h - (small ? 24 : 36), (w.w - (lyrics ? 260 : 0)) * 0.34, 214)))
  const lyricsW = lyrics ? Math.round(Math.min(280, Math.max(200, w.w * 0.3))) : 0
  const style = { ["--mau-tint" as string]: tint ?? "var(--accent)" }
  return (
    <div className={"mau" + (bg === "glass" ? " mau-glass" : bg === "none" ? " mau-clear" : bg === "solid" ? " mau-solid" : "")} style={style} data-tinted={!!tint} data-tiny={w.h < 140}>
      <MediaPanel m={m} pos={pos} cmd={cmd} cover={cover} lyricsW={lyricsW} small={small} paused={paused}
        player={app} onPlayer={(id) => update({ app: id })} />
    </div>
  )
}
