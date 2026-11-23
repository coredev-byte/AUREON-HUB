import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  Copy as Restore, Gauge, Home, LayoutGrid, Minus, MonitorUp, Palette, PanelLeftClose, PanelLeftOpen, Settings, Square, Stethoscope, X,
} from "lucide-react"
import { invoke, isElectron, on } from "@/shared/bridge"
import { useSharePublic } from "@/shared/hooks"
import { useSection } from "@/shared/state"
import { useTheme } from "@/shared/theme"
import { Skeleton, cx, useIndicator } from "@/shared/ui"
import { useNav, type Page } from "./nav"
import "@/share/engine"

const LOADERS: Record<Page, () => Promise<{ default: () => React.JSX.Element }>> = {
  dashboard: () => import("./pages/Dashboard"),
  widgets: () => import("./pages/Widgets"),
  notch: () => import("./pages/NotchPage"),
  share: () => import("./pages/Share"),
  personalize: () => import("./pages/Personalize"),
  settings: () => import("./pages/Settings"),
  diagnostics: () => import("./pages/Diagnostics"),
}
const PAGES = Object.fromEntries(Object.entries(LOADERS).map(([k, f]) => [k, lazy(f)])) as Record<Page, React.LazyExoticComponent<() => React.JSX.Element>>

interface NavItem { id: Page; label: string; icon: typeof Home }
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Geral", items: [
    { id: "dashboard", label: "Início", icon: Home },
    { id: "widgets", label: "Widgets", icon: LayoutGrid },
    { id: "notch", label: "Notch", icon: Gauge },
    { id: "share", label: "Transmissão", icon: MonitorUp },
  ] },
  { title: "Sistema", items: [
    { id: "personalize", label: "Personalização", icon: Palette },
    { id: "settings", label: "Configurações", icon: Settings },
    { id: "diagnostics", label: "Diagnósticos", icon: Stethoscope },
  ] },
]
const ALL = GROUPS.flatMap((g) => g.items)
/** nomes curtos para a barra inferior (telas estreitas) */
const SHORT: Partial<Record<Page, string>> = { share: "Transmitir", personalize: "Visual", settings: "Ajustes", diagnostics: "Diagnóst." }
const NAME = Object.fromEntries(ALL.map((n) => [n.id, n.label])) as Record<Page, string>

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }

export function App() {
  const settings = useSection("settings")
  useTheme(settings)
  const { page, go } = useNav()
  const share = useSharePublic()
  const [max, setMax] = useState(false)
  const [compact, setCompact] = useState(read("aureon-sidebar") === "compact")
  const [version, setVersion] = useState("")
  const navRef = useRef<HTMLElement>(null)
  const ind = useIndicator(navRef, ".nav-item[aria-current='page']", [page, compact], "y")
  useEffect(() => on("win:maximized", (v: boolean) => setMax(!!v)), [])
  useEffect(() => { document.body.style.zoom = String(settings?.textScale ?? 1) }, [settings?.textScale])
  useEffect(() => { void invoke("app:info").then((i: { version: string }) => setVersion(i?.version ?? "")).catch(() => {}) }, [])
  // páginas carregam sob demanda; depois que o app abre, o resto é baixado em segundo plano (troca de página sem espera)
  useEffect(() => {
    const idle = (cb: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 1200))
    idle(() => { for (const f of Object.values(LOADERS)) void f().catch(() => {}) })
  }, [])
  useEffect(() => { document.title = `${NAME[page]} · Aureon Hub` }, [page])
  if (!settings) return null
  const Page = PAGES[page]
  const toggle = () => { const v = !compact; setCompact(v); write("aureon-sidebar", v ? "compact" : "full") }
  const live = share.active && share.role === "host"
  const badge = (id: Page) => id === "share" && share.active
    ? <span className={cx("nav-badge", live && "nav-badge-live")} title={live ? "Ao vivo" : "Na sala"}>{live ? "AO VIVO" : "sala"}</span>
    : null
  return (
    <div className={cx("app", compact && "app-compact")}>
      <div className="titlebar">
        <button type="button" className="win-btn side-toggle" aria-label={compact ? "Expandir menu" : "Recolher menu"} title={compact ? "Expandir menu" : "Recolher menu"} onClick={toggle}>
          {compact ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div className="brand"><img src="./mark.png" alt="" />AUREON <b>HUB</b></div>
        <span className="crumb" aria-hidden>{NAME[page]}</span>
        <span className="grow" />
        {isElectron && (
          <div className="win-ctl">
            <button type="button" className="win-btn" aria-label="Minimizar" onClick={() => void invoke("win:cmd", "minimize")}><Minus size={15} /></button>
            <button type="button" className="win-btn" aria-label={max ? "Restaurar" : "Maximizar"} onClick={() => void invoke("win:cmd", "maximize")}>{max ? <Restore size={13} /> : <Square size={12} />}</button>
            <button type="button" className="win-btn close" aria-label="Fechar (continua na bandeja)" title="Fechar (o Aureon continua na bandeja)" onClick={() => void invoke("win:cmd", "close")}><X size={15} /></button>
          </div>
        )}
      </div>
      <nav className="sidebar" aria-label="Seções" ref={navRef}>
        <span className={cx("nav-ind", ind.animate && "nav-ind-anim")} style={ind.style} aria-hidden />
        {GROUPS.map((g) => (
          <div key={g.title} className="nav-group" role="group" aria-label={g.title}>
            <div className="nav-title">{g.title}</div>
            {g.items.map((n) => (
              <button key={n.id} type="button" className="nav-item" data-tip={n.label} aria-label={n.label} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
                <n.icon size={17} strokeWidth={1.8} className="nav-icon" />
                <span className="nav-label">{n.label}</span>
                {badge(n.id)}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="foot-status" title="Fechar a janela não encerra transmissão, notch nem widgets: o Aureon continua na bandeja.">
            <span className={cx("dot", live ? "dot-live" : "")} style={{ color: live ? undefined : "var(--ok)" }} />
            <span className="nav-label truncate">{live ? "Transmitindo" : share.active ? "Numa sala" : "Rodando na bandeja"}</span>
          </div>
          {version && <div className="foot-ver nav-label">versão {version}</div>}
        </div>
      </nav>
      <main className="content">
        <Suspense fallback={<div className="page"><Skeleton height={28} /><div style={{ height: 18 }} /><Skeleton lines={4} /></div>}>
          <div key={page} className="page-in"><Page /></div>
        </Suspense>
      </main>
      {/* telas estreitas: barra de navegação embaixo */}
      <nav className="bottom-nav" aria-label="Seções">
        {ALL.map((n) => (
          <button key={n.id} type="button" aria-label={n.label} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>
            <n.icon size={18} strokeWidth={1.8} /><span>{SHORT[n.id] ?? n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
