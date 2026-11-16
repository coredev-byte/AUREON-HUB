// Liga os widgets portados do Widgy ao motor de widgets do Aureon (mesmo formato de widget: id, tipo, tamanho, config).
import { SportsWidget, SportsSettings } from "./Sports"
import { TeamWidget, TeamSettings } from "./TeamWidget"
import { ValAgentWidget, ValAgentSettings, ValBackgroundSettings } from "./ValAgentWidget"
import { WeatherWidget } from "./Weather"
import { invoke } from "@/shared/bridge"
import type { WidgetProps } from "../catalog"
import type { Widget } from "./compat/types"
import "./compat/perf"

const asW = (w: WidgetProps["w"]) => w as unknown as Widget
export interface SettingsProps { w: WidgetProps["w"]; set: (p: Record<string, unknown>) => void }

export function Sports({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden"><SportsWidget w={asW(w)} /></div> }
export function Team({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden"><TeamWidget w={asW(w)} onConfigure={() => void invoke("app:open", "widgets", { open: w.id })} /></div> }
export function ValAgent({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden"><ValAgentWidget w={asW(w)} /></div> }
export function Weather({ w }: WidgetProps) { return <div className="widgy absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}><WeatherWidget w={asW(w)} /></div> }

export function SportsOptions({ w, set }: SettingsProps) { return <SportsSettings w={asW(w)} set={set} /> }
export function TeamOptions({ w, set }: SettingsProps) { return <TeamSettings w={asW(w)} set={set} /> }
export function ValAgentOptions({ w, set }: SettingsProps) { return <><ValAgentSettings w={asW(w)} set={set} /><ValBackgroundSettings w={asW(w)} set={set} /></> }
