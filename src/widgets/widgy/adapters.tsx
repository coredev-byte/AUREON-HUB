// Liga os widgets portados do Widgy ao motor de widgets do Aureon (mesmo formato de widget: id, tipo, tamanho, config).
import { SportsWidget, SportsSettings } from "./Sports"
import { TeamWidget, TeamSettings } from "./TeamWidget"
import { ValAgentWidget, ValAgentSettings, ValBackgroundSettings } from "./ValAgentWidget"
import { WeatherWidget } from "./Weather"
import { PcMusicWidget, PcMusicSettings } from "./PcMusicWidget"
import { invoke } from "@/shared/bridge"
import type { WidgetProps } from "../catalog"
import type { Widget } from "./compat/types"
import "./compat/perf"
import { lazy, Suspense } from "react"
const WeatherAureon = lazy(() => import("../types/WeatherAureon"))
const SportsAureon = lazy(() => import("../types/SportsAureon"))
const MusicAureon = lazy(() => import("../types/MusicAureon"))

const asW = (w: WidgetProps["w"]) => w as unknown as Widget
/** aplica a opção geral "Fundo" (do Aureon) no ajuste equivalente do widget portado */
const withBg = (w: WidgetProps["w"]): Widget => {
  const bg = w.bg ?? "default"
  if (bg === "default") return asW(w)
  const c = { ...w.config }
  if (w.type === "weather") c.sky = bg !== "none"
  if (w.type === "team") c.transparent = bg === "none"
  if (w.type === "media") c.pcBg = bg === "none" ? "none" : bg === "solid" ? "solid" : bg === "glass" ? "glass" : c.pcBg
  if (w.type === "valagent") c.look = { ...(c.look as object), ...(bg === "none" ? { bg: "none" } : {}) }
  return { ...asW(w), config: c }
}
export interface SettingsProps { w: WidgetProps["w"]; set: (p: Record<string, unknown>) => void }

export function Sports({ w, paused }: WidgetProps) {
  if ((w.config.look ?? "aureon") === "aureon") return <Suspense fallback={null}><SportsAureon w={w} paused={paused} sport={w.type as "football" | "cs2" | "valorant"} bg={w.bg ?? "default"} /></Suspense>
  return <div className="widgy absolute inset-0 overflow-hidden"><SportsWidget w={asW(w)} /></div>
}
export function Team({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden"><TeamWidget w={withBg(w)} onConfigure={() => void invoke("app:open", "widgets", { open: w.id })} /></div> }
export function ValAgent({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden"><ValAgentWidget w={withBg(w)} /></div> }
export function Weather({ w, paused }: WidgetProps) {
  if ((w.config.look ?? "aureon") === "aureon") return <Suspense fallback={null}><WeatherAureon w={w} paused={paused} bg={w.bg ?? "default"} /></Suspense>
  return <div className="widgy absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}><WeatherWidget w={withBg(w)} /></div>
}

export function SportsOptions({ w, set }: SettingsProps) { return <SportsSettings w={asW(w)} set={set} /> }
export function TeamOptions({ w, set }: SettingsProps) { return <TeamSettings w={asW(w)} set={set} /> }
export function ValAgentOptions({ w, set }: SettingsProps) { return <><ValAgentSettings w={asW(w)} set={set} /><ValBackgroundSettings w={asW(w)} set={set} /></> }

export function Music({ w, update, paused }: WidgetProps) {
  if ((w.config.look ?? "aureon") === "aureon") return <Suspense fallback={null}><MusicAureon w={w} paused={paused} bg={w.bg ?? "default"} update={update} /></Suspense>
  return <div className="widgy absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}><PcMusicWidget w={withBg(w)} update={update} /></div> }
export function MusicOptions({ w, set }: SettingsProps) { return (w.config.look ?? "aureon") === "aureon" ? null : <PcMusicSettings w={asW(w)} set={set} /> }
