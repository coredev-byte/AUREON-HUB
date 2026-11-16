import { lazy, Suspense, useEffect, useState } from "react"
import { Gauge, LayoutGrid, Minus, MonitorUp, Palette, Settings, Square, Stethoscope, X, Copy as Restore, Home } from "lucide-react"
import { invoke, isElectron, on } from "@/shared/bridge"
import { useSharePublic } from "@/shared/hooks"
import { useSection } from "@/shared/state"
import { useTheme } from "@/shared/theme"
import { useNav, type Page } from "./nav"
import "@/share/engine"

const PAGES: Record<Page, React.LazyExoticComponent<() => React.JSX.Element>> = {
  dashboard: lazy(() => import("./pages/Dashboard")),
  widgets: lazy(() => import("./pages/Widgets")),
  notch: lazy(() => import("./pages/NotchPage")),
  share: lazy(() => import("./pages/Share")),
  personalize: lazy(() => import("./pages/Personalize")),
  settings: lazy(() => import("./pages/Settings")),
  diagnostics: lazy(() => import("./pages/Diagnostics")),
}
const NAV: { id: Page; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Início", icon: Home },
  { id: "widgets", label: "Widgets", icon: LayoutGrid },
  { id: "notch", label: "Notch", icon: Gauge },
  { id: "share", label: "Transmissão", icon: MonitorUp },
]
const NAV2: { id: Page; label: string; icon: typeof Home }[] = [
  { id: "personalize", label: "Personalização", icon: Palette },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "diagnostics", label: "Diagnósticos", icon: Stethoscope },
]

export function App() {
  const settings = useSection("settings")
  useTheme(settings)
  const { page, go } = useNav()
  const share = useSharePublic()
  const [max, setMax] = useState(false)
  useEffect(() => on("win:maximized", (v: boolean) => setMax(!!v)), [])
  useEffect(() => { document.body.style.zoom = String(settings?.textScale ?? 1) }, [settings?.textScale])
  if (!settings) return null
  const Page = PAGES[page]
  const item = (n: { id: Page; label: string; icon: typeof Home }) => (
    <button key={n.id} type="button" className="nav-item" title={n.label} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
      <n.icon size={16} />{n.label}
      {n.id === "share" && share.active && share.role === "host" && <span className="nav-extra badge badge-live" style={{ height: 18, fontSize: 10 }}>AO VIVO</span>}
      {n.id === "share" && share.active && share.role === "viewer" && <span className="nav-extra badge" style={{ height: 18, fontSize: 10 }}>assistindo</span>}
    </button>
  )
  return (
    <div className="app">
      <div className="titlebar">
        <div className="brand"><img src="./mark.png" alt="" />AUREON <b>HUB</b></div>
        <span className="grow" />
        {isElectron && (
          <>
            <button type="button" className="win-btn" aria-label="Minimizar" onClick={() => void invoke("win:cmd", "minimize")}><Minus size={15} /></button>
            <button type="button" className="win-btn" aria-label={max ? "Restaurar" : "Maximizar"} onClick={() => void invoke("win:cmd", "maximize")}>{max ? <Restore size={13} /> : <Square size={12} />}</button>
            <button type="button" className="win-btn close" aria-label="Fechar (continua na bandeja)" title="Fechar (o Aureon continua na bandeja)" onClick={() => void invoke("win:cmd", "close")}><X size={15} /></button>
          </>
        )}
      </div>
      <nav className="sidebar" aria-label="Seções">
        {NAV.map(item)}
        <div className="nav-sep" />
        {NAV2.map(item)}
        <div className="sidebar-foot tiny dim">Fechar a janela não encerra transmissão, notch nem widgets.</div>
      </nav>
      <main className="content">
        <Suspense fallback={null}><div key={page} className="fade-in"><Page /></div></Suspense>
      </main>
    </div>
  )
}
