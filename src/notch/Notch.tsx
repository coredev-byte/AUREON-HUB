import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react"
import {
  Activity, AppWindow, Bell, BellOff, Check, ChevronRight, Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Eye, LayoutGrid,
  MonitorUp, Moon, Music2, Pause, Pencil, Play, Radio, Repeat, Snowflake, SkipBack, SkipForward, Sun, Trash2, TriangleAlert, Users, X,
} from "lucide-react"
import { invoke, on } from "@/shared/bridge"
import { appLabel, fmtTime, mediaCommand, useMedia, useMediaPosition, useNotices, useNow, useSharePublic, useWeather } from "@/shared/hooks"
import { patch, useSection } from "@/shared/state"
import { useTheme } from "@/shared/theme"
import type { MediaSession, Notice, SharePublic, Weather, WeatherKind } from "@/shared/types"
import { initial, reduce, sizeOf, type Mode, type NotchState, type Tab } from "./machine"

const params = new URLSearchParams(location.search)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const IS_PRIMARY = params.get("primary") !== "0"

export function NotchApp() {
  const settings = useSection("settings")
  const ns = useSection("notch")
  const widgets = useSection("widgets")
  useTheme(settings)
  const share = useSharePublic()
  const { session } = useMedia(ns?.mediaSource ?? "")
  const [fsHere, setFsHere] = useState(false)
  const [s, dispatch] = useReducer(reduce, undefined, () => initial())

  // contexto vindo de fora (transmissão, mídia, configurações, tela cheia)
  const hosting = !!share.active && share.role === "host"
  useEffect(() => {
    dispatch({ type: "ctx", ctx: {
      sharing: hosting, mediaPlaying: !!session?.playing, showMedia: ns?.showMedia ?? true, hoverExpand: ns?.hoverExpand ?? true,
      hoverDelay: ns?.hoverDelay ?? 140, fullscreen: fsHere, notifications: ns?.notifications ?? true,
    } })
  }, [hosting, session?.playing, ns?.showMedia, ns?.hoverExpand, ns?.hoverDelay, ns?.notifications, fsHere])

  useEffect(() => on("notch:fullscreen", (v: boolean) => setFsHere(!!v)), [])
  useEffect(() => on("notch:toggle", () => dispatch({ type: "toggle" })), [])
  // avisos aparecem só no notch do monitor principal (sem repetir em todas as telas)
  useEffect(() => (IS_PRIMARY ? on("notify:new", (n: Notice) => dispatch({ type: "notify", notice: n })) : undefined), [])

  // um temporizador por vez, definido pela máquina
  useEffect(() => {
    if (!s.timer) return
    const t = setTimeout(() => dispatch({ type: s.timer!.event } as never), s.timer.ms)
    return () => clearTimeout(t)
  }, [s.timer?.seq])

  // a janela só "pega" o mouse quando o ponteiro está sobre o desenho do notch
  const shape = useRef<HTMLDivElement>(null)
  const inside = useRef(false)
  useEffect(() => {
    const setInside = (v: boolean) => {
      if (v === inside.current) return
      inside.current = v
      void invoke("notch:interactive", v)
      dispatch({ type: v ? "enter" : "leave" })
    }
    const move = (e: MouseEvent) => {
      const r = shape.current?.getBoundingClientRect()
      if (!r) return
      // as orelhas e uma faixa de 2 px no topo também contam (mais fácil de acertar com o mouse)
      setInside(e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= 0 && e.clientY <= r.bottom + 2)
    }
    const out = () => setInside(false)
    window.addEventListener("mousemove", move)
    document.addEventListener("mouseleave", out)
    window.addEventListener("blur", out)
    return () => { window.removeEventListener("mousemove", move); document.removeEventListener("mouseleave", out); window.removeEventListener("blur", out) }
  }, [])

  if (!ns || !settings) return null
  const size = sizeOf(s.mode, { idleClock: ns.idleClock, fullscreen: fsHere })
  const style = { "--w": size.w + "px", "--h": size.h + "px", "--r": size.r + "px" } as CSSProperties
  return (
    <div className="notch-stage">
      <div className="notch-zoom" style={{ transform: `scale(${ns.scale})` }}>
        <div
          ref={shape} className="notch" data-mode={fsHere ? "fullscreen" : s.mode} style={style}
          role="region" aria-label="Notch do Aureon"
          onClick={(e) => { if ((e.target as HTMLElement).closest("button,[data-noclick]")) return; dispatch({ type: "click" }) }}
          onContextMenu={(e) => { e.preventDefault(); void invoke("notch:menu") }}
        >
          <div className="notch-clip">
            {fsHere ? <FullscreenPill share={share} /> : <Content s={s} dispatch={dispatch} share={share} media={session} idleClock={ns.idleClock} widgetsOn={widgets?.enabled ?? true} />}
          </div>
        </div>
      </div>
    </div>
  )
}

type Dispatch = (e: Parameters<typeof reduce>[1]) => void

function Content({ s, dispatch, share, media, idleClock, widgetsOn }: { s: NotchState; dispatch: Dispatch; share: SharePublic; media: MediaSession | null; idleClock: boolean; widgetsOn: boolean }) {
  const shown: Mode = s.mode === "hover" ? (s.ctx.sharing ? "sharing" : s.ctx.showMedia && s.ctx.mediaPlaying ? "media" : "idle") : s.mode
  if (s.mode === "expanded") return <Panel tab={s.tab} dispatch={dispatch} share={share} media={media} widgetsOn={widgetsOn} />
  if (shown === "notification" || shown === "alert") return s.notice ? <NoticeView n={s.notice} dispatch={dispatch} /> : null
  return (
    <div key={shown + (s.mode === "hover" ? "-h" : "")} className="notch-content n-compact">
      {shown === "sharing" && <SharingCompact share={share} hover={s.mode === "hover"} />}
      {shown === "media" && media && <MediaCompact m={media} hover={s.mode === "hover"} />}
      {shown === "idle" && <IdleCompact clock={idleClock || s.mode === "hover"} hover={s.mode === "hover"} />}
    </div>
  )
}

function IdleCompact({ clock, hover }: { clock: boolean; hover: boolean }) {
  const now = useNow(clock ? 60000 : 0)
  if (!clock) return null
  return (
    <>
      <span className="n-clock">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
      {hover && <span style={{ color: "#8f8e95", fontSize: 11.5 }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace(".", "")}</span>}
    </>
  )
}

function MediaCompact({ m, hover }: { m: MediaSession; hover: boolean }) {
  return (
    <>
      {m.art ? <img className="n-art" src={m.art} alt="" /> : <span className="n-art" style={{ display: "grid", placeItems: "center" }}><Music2 size={12} /></span>}
      <span className="truncate grow" style={{ color: "#d7d6db", fontSize: 12, textAlign: "left" }}>{hover ? `${m.title} · ${m.artist}` : m.title}</span>
      <span className="n-bars" data-paused={!m.playing}><i /><i /><i /></span>
    </>
  )
}

function SharingCompact({ share, hover }: { share: SharePublic; hover: boolean }) {
  const now = useNow(1000)
  const elapsed = share.startedAt ? (now.getTime() - share.startedAt) / 1000 : 0
  const warn = share.connection === "poor" || share.connection === "reconnecting"
  return (
    <>
      <span className="n-live"><span className="dot" />AO VIVO</span>
      <span className="n-clock">{fmtTime(elapsed)}</span>
      <span className="grow" />
      {hover && warn && <TriangleAlert size={13} color="var(--warn)" />}
      {!!share.requests && <span style={{ color: "var(--warn)", fontSize: 11.5 }}>{share.requests} pedido{share.requests > 1 ? "s" : ""}</span>}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#c9c8ce", fontSize: 12 }}><Eye size={13} />{share.viewers ?? 0}</span>
    </>
  )
}

function FullscreenPill({ share }: { share: SharePublic }) {
  return <div className="notch-content n-compact"><span className="n-live" style={{ fontSize: 10.5 }}><span className="dot" />AO VIVO · {share.viewers ?? 0}</span></div>
}

function NoticeView({ n, dispatch }: { n: Notice; dispatch: Dispatch }) {
  const act = (id: string) => { void invoke("notify:action", n.id, id); dispatch({ type: "dismiss" }) }
  const Icon = n.kind === "alert" ? TriangleAlert : n.kind === "request" ? Users : n.kind === "share" ? Radio : n.kind === "media" ? Music2 : n.kind === "game" ? Activity : Bell
  return (
    <div key={n.id} className="notch-content n-notice">
      <span className="n-notice-icon" style={n.kind === "alert" ? { color: "var(--warn)" } : undefined}>{n.image ? <img src={n.image} alt="" /> : <Icon size={18} />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="n-notice-title truncate">{n.title}</div>
        {n.body && <div className="n-notice-body truncate">{n.body}</div>}
      </div>
      {n.actions.length > 0 ? (
        <div className="row" style={{ gap: 6 }}>
          {n.actions.map((a, i) => <button key={a.id} type="button" className={"n-btn " + (i === 0 ? "n-btn-primary" : "")} onClick={() => act(a.id)}>{a.label}</button>)}
        </div>
      ) : (
        <button type="button" className="n-icon-btn" aria-label="Fechar aviso" onClick={() => { void invoke("notify:dismiss", n.id); dispatch({ type: "dismiss" }) }}><X size={15} /></button>
      )}
    </div>
  )
}

/* ───────────── painel aberto ───────────── */
const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: "now", label: "Agora", icon: Sun },
  { id: "media", label: "Mídia", icon: Music2 },
  { id: "share", label: "Transmissão", icon: MonitorUp },
  { id: "activity", label: "Atividade", icon: Bell },
]

function Panel({ tab, dispatch, share, media, widgetsOn }: { tab: Tab; dispatch: Dispatch; share: SharePublic; media: MediaSession | null; widgetsOn: boolean }) {
  const live = share.active && share.role === "host"
  return (
    <div className="n-panel">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="n-tabs" role="tablist" aria-label="Seções do notch">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => dispatch({ type: "tab", tab: t.id })}>
              <t.icon size={13} />{t.label}{t.id === "share" && live && <span className="dot dot-live" style={{ width: 6, height: 6 }} />}
            </button>
          ))}
        </div>
        <span className="grow" />
        <button type="button" className="n-icon-btn" aria-label={widgetsOn ? "Esconder widgets" : "Mostrar widgets"} title={widgetsOn ? "Esconder widgets" : "Mostrar widgets"} onClick={() => void patch("widgets", { enabled: !widgetsOn })}><LayoutGrid size={15} style={{ opacity: widgetsOn ? 1 : 0.45 }} /></button>
        <button type="button" className="n-icon-btn" aria-label="Editar posição dos widgets" title="Editar posição dos widgets" onClick={() => void patch("widgets", { editMode: true, enabled: true })}><Pencil size={14} /></button>
        <button type="button" className="n-icon-btn" aria-label="Abrir Aureon Hub" title="Abrir Aureon Hub" onClick={() => void invoke("app:open")}><AppWindow size={15} /></button>
      </div>
      <div key={tab} className="grow fade-in" style={{ minHeight: 0 }}>
        {tab === "now" && <NowTab media={media} />}
        {tab === "media" && <MediaTab m={media} />}
        {tab === "share" && <ShareTab share={share} />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  )
}

const WX_ICON: Record<WeatherKind, typeof Sun> = { clear: Sun, cloudy: Cloud, fog: CloudFog, rain: CloudRain, snow: Snowflake, storm: CloudLightning }
export function WeatherIcon({ w, size = 20 }: { w: Pick<Weather, "kind" | "isDay">; size?: number }) {
  const I = w.kind === "clear" && !w.isDay ? Moon : w.kind === "cloudy" && w.isDay ? CloudSun : WX_ICON[w.kind]
  return <I size={size} />
}

function NowTab({ media }: { media: MediaSession | null }) {
  const now = useNow(1000)
  const w = useWeather()
  const ok = w && !("error" in w && !("temp" in w)) ? (w as Weather) : null
  return (
    <div style={{ display: "grid", gridTemplateColumns: "190px 200px 1fr", gap: 10, height: "100%" }}>
      <div className="n-card col" style={{ justifyContent: "center", gap: 2 }}>
        <div className="num" style={{ fontSize: 46, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.03em" }}>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
        <div style={{ color: "#8f8e95", fontSize: 12 }}>{cap(now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</div>
      </div>
      <div className="n-card col" style={{ justifyContent: "center", gap: 6 }}>
        {ok ? (
          <>
            <div className="row" style={{ gap: 10 }}><WeatherIcon w={ok} size={26} /><span className="num" style={{ fontSize: 30, fontWeight: 500 }}>{Math.round(ok.temp)}°</span></div>
            <div style={{ fontSize: 12 }}>{ok.label}</div>
            <div style={{ fontSize: 11, color: "#8f8e95" }} className="truncate">{ok.city}{ok.days[0] ? ` · ${Math.round(ok.days[0].min)}° / ${Math.round(ok.days[0].max)}°` : ""}</div>
          </>
        ) : (
          <>
            <Cloud size={22} color="#6a6970" />
            <div style={{ fontSize: 12, color: "#a3a2a8" }}>{w && "error" in w && w.error ? w.error : "Carregando clima…"}</div>
          </>
        )}
      </div>
      <div className="n-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {media ? <MiniMedia m={media} /> : <div className="col" style={{ gap: 4, color: "#8f8e95", fontSize: 12 }}><Music2 size={20} />Nada tocando. Abra o Spotify, YouTube Music ou outro player.</div>}
      </div>
    </div>
  )
}

function MiniMedia({ m }: { m: MediaSession }) {
  return (
    <>
      {m.art ? <img src={m.art} alt="" style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", flex: "none" }} /> : <div style={{ width: 84, height: 84, borderRadius: 12, background: "#1d1d20", display: "grid", placeItems: "center", flex: "none" }}><Music2 size={22} /></div>}
      <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
        <div><div className="truncate" style={{ fontWeight: 600 }}>{m.title}</div><div className="truncate" style={{ color: "#8f8e95", fontSize: 12 }}>{m.artist || appLabel(m.app)}</div></div>
        <Controls m={m} />
      </div>
    </>
  )
}

function Controls({ m, big }: { m: MediaSession; big?: boolean }) {
  return (
    <div className="row" style={{ gap: big ? 14 : 4 }}>
      <button type="button" className="n-icon-btn" aria-label="Anterior" disabled={m.canPrev === false} onClick={() => void mediaCommand("prev", m.app)}><SkipBack size={big ? 18 : 15} /></button>
      <button type="button" className={"n-icon-btn" + (big ? " n-play" : "")} aria-label={m.playing ? "Pausar" : "Tocar"} onClick={() => void mediaCommand("toggle", m.app)}>{m.playing ? <Pause size={big ? 18 : 15} /> : <Play size={big ? 18 : 15} />}</button>
      <button type="button" className="n-icon-btn" aria-label="Próxima" disabled={m.canNext === false} onClick={() => void mediaCommand("next", m.app)}><SkipForward size={big ? 18 : 15} /></button>
    </div>
  )
}

function MediaTab({ m }: { m: MediaSession | null }) {
  const pos = useMediaPosition(m)
  if (!m) return <div className="n-card col" style={{ height: "100%", justifyContent: "center", alignItems: "center", color: "#8f8e95", fontSize: 12.5, textAlign: "center" }}><Music2 size={24} />Nenhum player com música agora.<span style={{ fontSize: 11.5 }}>Spotify, YouTube Music, Deezer e navegadores aparecem aqui sozinhos (controles de mídia do Windows).</span></div>
  const pct = m.dur ? Math.min(100, (pos / m.dur) * 100) : 0
  return (
    <div className="n-card" style={{ display: "flex", gap: 18, height: "100%", alignItems: "center", padding: 16 }}>
      {m.art ? <img src={m.art} alt="" style={{ width: 160, height: 160, borderRadius: 18, objectFit: "cover", flex: "none" }} /> : <div style={{ width: 160, height: 160, borderRadius: 18, background: "#1d1d20", display: "grid", placeItems: "center", flex: "none" }}><Music2 size={36} /></div>}
      <div className="col grow" style={{ gap: 12, minWidth: 0 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8f8e95", marginBottom: 2 }}>{appLabel(m.app)}</div>
          <div className="truncate" style={{ fontSize: 17, fontWeight: 600 }}>{m.title}</div>
          <div className="truncate" style={{ color: "#a3a2a8" }}>{[m.artist, m.album].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="n-progress" role="slider" aria-label="Posição" aria-valuemin={0} aria-valuemax={Math.round(m.dur)} aria-valuenow={Math.round(pos)} data-noclick
            onClick={(e) => { if (!m.canSeek || !m.dur) return; const r = e.currentTarget.getBoundingClientRect(); void mediaCommand("seek", m.app, ((e.clientX - r.left) / r.width) * m.dur) }}>
            <i style={{ width: pct + "%" }} />
          </div>
          <div className="row num" style={{ fontSize: 11, color: "#8f8e95" }}><span>{fmtTime(pos)}</span><span className="grow" /><span>{m.dur ? fmtTime(m.dur) : "—"}</span></div>
        </div>
        <div className="row" style={{ justifyContent: "center" }}><Controls m={m} big /></div>
      </div>
    </div>
  )
}

function ShareTab({ share }: { share: SharePublic }) {
  const now = useNow(1000)
  if (!share.active) {
    return (
      <div className="n-card col" style={{ height: "100%", justifyContent: "center", alignItems: "center", gap: 10, textAlign: "center" }}>
        <MonitorUp size={26} color="#8f8e95" />
        <div style={{ fontWeight: 600 }}>Nenhuma transmissão</div>
        <div style={{ color: "#8f8e95", fontSize: 12, maxWidth: 380 }}>Transmita sua tela para amigos em outras redes, com convite privado. Nada começa sem você escolher a tela.</div>
        <div className="row"><button type="button" className="n-btn n-btn-primary" onClick={() => void invoke("app:open", "share")}>Transmitir tela</button><button type="button" className="n-btn" onClick={() => void invoke("app:open", "share", { tab: "watch" })}>Assistir</button></div>
      </div>
    )
  }
  if (share.role === "viewer") {
    return (
      <div className="n-card col" style={{ height: "100%", justifyContent: "center", gap: 8 }}>
        <div className="row"><Eye size={16} /><b>Assistindo {share.hostName || "uma transmissão"}</b></div>
        <div style={{ color: "#8f8e95", fontSize: 12 }}>Conexão: {CONN[share.connection ?? "good"]}</div>
        <div className="row"><button type="button" className="n-btn" onClick={() => void invoke("app:open", "share", { tab: "watch" })}>Abrir</button><button type="button" className="n-btn n-btn-danger" onClick={() => void invoke("share:command", "leave")}>Sair</button></div>
      </div>
    )
  }
  const elapsed = share.startedAt ? (now.getTime() - share.startedAt) / 1000 : 0
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, height: "100%" }}>
      <div className="n-card col" style={{ gap: 12 }}>
        <div className="row"><span className="n-live"><span className="dot" />AO VIVO</span><span className="truncate grow" style={{ color: "#a3a2a8", fontSize: 12 }}>{share.source}</span></div>
        <div className="row" style={{ gap: 26 }}>
          <div className="n-stat"><b>{fmtTime(elapsed)}</b><span>tempo</span></div>
          <div className="n-stat"><b>{share.viewers ?? 0}</b><span>assistindo</span></div>
          <div className="n-stat"><b style={{ fontSize: 14, paddingTop: 4, color: CONN_COLOR[share.connection ?? "good"] }}>{CONN[share.connection ?? "good"]}</b><span>conexão</span></div>
          <div className="n-stat"><b style={{ fontSize: 14, paddingTop: 4 }}>{share.quality ?? "—"}</b><span>qualidade</span></div>
        </div>
        <div className="row" style={{ marginTop: "auto" }}>
          <button type="button" className="n-btn" onClick={() => void invoke("share:command", "pick-source")}><Repeat size={12} style={{ marginRight: 5, verticalAlign: -1 }} />Trocar fonte</button>
          <button type="button" className="n-btn" onClick={() => void invoke("app:open", "share")}>Abrir painel <ChevronRight size={12} style={{ verticalAlign: -2 }} /></button>
          <span className="grow" />
          <button type="button" className="n-btn n-btn-danger" onClick={() => void invoke("share:command", "stop")}>Encerrar</button>
        </div>
      </div>
      <div className="n-card col" style={{ gap: 6 }}>
        <div style={{ fontSize: 11, color: "#8f8e95" }}>Convite</div>
        <div className="num" style={{ fontSize: 15, letterSpacing: "0.08em" }}>{share.code ?? "—"}</div>
        <div style={{ fontSize: 11, color: "#8f8e95", marginTop: "auto" }}>{share.requests ? `${share.requests} pedido(s) para entrar: responda no aviso acima ou no painel.` : "Quem tiver o convite pede para entrar e você aprova."}</div>
      </div>
    </div>
  )
}
const CONN: Record<string, string> = { good: "boa", fair: "razoável", poor: "fraca", reconnecting: "reconectando", offline: "sem servidor" }
const CONN_COLOR: Record<string, string> = { good: "var(--ok)", fair: "#e9e8ec", poor: "var(--warn)", reconnecting: "var(--warn)", offline: "var(--bad)" }

function ActivityTab() {
  const list = useNotices()
  const ns = useSection("notch")
  useEffect(() => { void invoke("notify:read") }, [])
  const time = useCallback((t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), [])
  return (
    <div className="n-card col" style={{ height: "100%", gap: 0, padding: "8px 6px 8px 14px" }}>
      <div className="row" style={{ paddingRight: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#8f8e95" }} className="grow">{list.length ? `${list.length} aviso(s) desta sessão` : "Sem avisos nesta sessão"}</span>
        <button type="button" className="n-icon-btn" title={ns?.notifications ? "Silenciar avisos" : "Ativar avisos"} aria-label={ns?.notifications ? "Silenciar avisos" : "Ativar avisos"} onClick={() => void patch("notch", { notifications: !ns?.notifications })}>{ns?.notifications ? <Bell size={14} /> : <BellOff size={14} />}</button>
        <button type="button" className="n-icon-btn" title="Limpar" aria-label="Limpar avisos" disabled={!list.length} onClick={() => void invoke("notify:clear")}><Trash2 size={14} /></button>
      </div>
      <div className="n-list grow col" style={{ gap: 2 }}>
        {list.map((n) => (
          <div key={n.id} className="row" style={{ padding: "6px 6px 6px 0", gap: 10 }}>
            <span className="num" style={{ fontSize: 11, color: "#6a6970", width: 38 }}>{time(n.at)}</span>
            <div className="grow" style={{ minWidth: 0 }}><div className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>{n.title}</div>{n.body && <div className="truncate" style={{ fontSize: 11.5, color: "#8f8e95" }}>{n.body}</div>}</div>
            {n.actions.length > 0 && n.actions.map((a, i) => <button key={a.id} type="button" className={"n-btn " + (i === 0 ? "n-btn-primary" : "")} onClick={() => void invoke("notify:action", n.id, a.id)}>{i === 0 ? <Check size={12} /> : <X size={12} />}</button>)}
          </div>
        ))}
      </div>
    </div>
  )
}
