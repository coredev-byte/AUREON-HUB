// Esportes e e-sports no estilo Aureon: placar em destaque (com tempo de jogo ou mapa atual), lista de
// próximos jogos (futebol, basquete e F1), classificação do campeonato e versão pequena.
// Só dados reais: ESPN (futebol, NBA, F1, classificação), vlr.gg (Valorant) e Liquipedia (CS2).
import { useEffect, useMemo, useState } from "react"
import { Crosshair, Trophy } from "lucide-react"
import { invoke } from "@/shared/bridge"
import type { WidgetInstance } from "@/shared/types"
import { useAgents } from "../widgy/ValAgentWidget"
import type { FavTeam, SportTeam } from "../widgy/compat/bridge"
import { LEAGUES } from "../widgy/Sports"
import "./sports-aureon.css"
import { featured, isFav, liveInfo, norm, when, type Match } from "./sportsLogic"

type Sport = "football" | "cs2" | "valorant"
type Layout = "auto" | "live" | "list" | "table" | "mini"
type Tab = "football" | "basket" | "f1"
interface Standings { league: string; name: string; rows: { rank: number; team: SportTeam; pts: number; gp: number; w: number; d: number; l: number; gd: string; note: { color: string; text: string } | null }[] }
interface F1Event { id: string; name: string; start: number; circuit: string; sessions: { type: string; label: string; start: number; state: "live" | "done" | "upcoming" }[] }
interface VlrDetail { logos: { a: string; b: string }; maps: { name: string; a: number; b: number; done: boolean }[]; current: number }

const DEFAULT_LEAGUES = ["bra.1", "conmebol.libertadores", "uefa.champions", "uefa.europa", "eng.1", "esp.1", "eng.3"]
const LEAGUE_NAME = Object.fromEntries(LEAGUES.map((l) => [l.id, l.label])) as Record<string, string>
function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[], paused: boolean) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    let alive = true
    const run = () => fn().then((d) => { if (alive) { setData(d); setErr("") } }).catch((e) => { if (alive) setErr(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")) })
    void run()
    if (paused) return () => { alive = false }
    const id = setInterval(run, ms)
    return () => { alive = false; clearInterval(id) }
  }, [...deps, paused])
  return { data, err }
}

/* ───────────── peças ───────────── */
function Crest({ t, size }: { t: SportTeam; size: number }) {
  const [bad, setBad] = useState(false)
  if (t.logo && !bad) return <img className="au-crest" src={t.logo} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBad(true)} draggable={false} />
  return <span className="spa-initials" style={{ width: size, height: size, fontSize: size * 0.34 }}>{(t.short || t.name || "?").slice(0, 3).toUpperCase()}</span>
}
const Ball = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="M12 7.2l4 2.9-1.5 4.7h-5L8 10.1Z" fill="currentColor" /><path d="M12 7.2V2.6M16 10.1l4.3-1.4M14.5 14.8l2.7 3.7M9.5 14.8l-2.7 3.7M8 10.1 3.7 8.7" /></svg>
)
const Hoop = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5v19M5.3 5.3c3.2 2.9 3.2 10.5 0 13.4M18.7 5.3c-3.2 2.9-3.2 10.5 0 13.4" /></svg>
)
const F1Mark = ({ size = 16 }: { size?: number }) => (
  <svg width={size * 1.9} height={size} viewBox="0 0 38 20" aria-hidden><path d="M3 17 12 6h17l-3 3H14.5l-2 2.4H23l-2.6 3H10l-2.3 2.6Z M24 17 33 6h3l-9 11Z" fill="currentColor" /></svg>
)
const ValMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M2 5l9 11.5h6L2 5Zm20 0-7 8.6h5.4L22 11.5Z" fill="currentColor" /></svg>
)
function SportIcon({ sport, tab, size = 16 }: { sport: Sport; tab?: Tab; size?: number }) {
  if (tab === "basket") return <Hoop size={size} />
  if (tab === "f1") return <F1Mark size={size * 0.8} />
  if (sport === "valorant") return <ValMark size={size} />
  if (sport === "cs2") return <Crosshair size={size} strokeWidth={1.8} />
  return <Ball size={size} />
}
const SPORT_NAME: Record<Sport, string> = { football: "Futebol", cs2: "CS2", valorant: "VALORANT" }

function Head({ sport, title, sub, right, tab }: { sport: Sport; title: string; sub?: string; right?: React.ReactNode; tab?: Tab }) {
  return (
    <div className="spa-head">
      <span className="au-pill"><span className="au-ico"><SportIcon sport={sport} tab={tab} size={15} /></span><span className="truncate">{title}{sub && <span className="au-sub"> · {sub}</span>}</span></span>
      <span className="grow" />
      {right}
    </div>
  )
}

/* ───────────── componente ───────────── */
export default function SportsAureon({ w, paused, sport, bg }: { w: WidgetInstance; paused: boolean; sport: Sport; bg: "default" | "glass" | "solid" | "none" }) {
  const c = w.config as Record<string, any>
  const leagues: string[] = c.leagues?.length ? c.leagues : DEFAULT_LEAGUES
  const favs: FavTeam[] = Array.isArray(c.favs) ? c.favs : []
  let layout = (c.layout ?? "auto") as Layout
  if (layout === "auto") layout = w.h < 175 || w.w < 300 ? "mini" : w.h >= 290 ? "list" : "live"
  if (layout === "table" && sport !== "football") layout = "list"
  const [tab, setTab] = useState<Tab>("football")
  const teamsOpt = favs.filter((f) => f.id && f.league).map((f) => ({ id: f.id, league: f.league }))
  const matches = usePoll<Match[]>(() => invoke("sports:get", sport, { leagues, teams: teamsOpt }), 60_000, [sport, leagues.join(), JSON.stringify(teamsOpt)], paused)
  const list = matches.data ?? []
  const feat = useMemo(() => featured(list, favs), [list, favs])
  const cls = "spa au-card" + (bg === "glass" ? " au-glass" : bg === "none" ? " au-clear" : "")
  const style = { ["--au-glow" as string]: c.glow || undefined }

  let body: React.ReactNode
  if (layout === "table") body = <TableView league={c.tableLeague || leagues[0] || "bra.1"} paused={paused} rows={Math.max(3, Math.floor((w.h - 70) / 44))} favs={favs} />
  else if (layout === "list") body = <ListView sport={sport} tab={sport === "football" ? tab : undefined} setTab={setTab} list={list} favs={favs} rows={Math.max(2, Math.floor((w.h - 112) / 46))} paused={paused} err={matches.err} loading={!matches.data} />
  else if (!feat) body = <><Head sport={sport} title={SPORT_NAME[sport]} /><div className="spa-empty small au-muted">{matches.err ? "Sem conexão com a fonte: " + matches.err : !matches.data ? "Buscando partidas…" : "Nenhuma partida nos próximos dias."}</div></>
  else if (layout === "mini") body = <MiniView sport={sport} m={feat} />
  else body = <LiveView sport={sport} m={feat} agent={c.agentArt ?? "Jett"} wide={w.w >= 520} />

  return <div className={cls} style={style} data-layout={layout}>{body}</div>
}

/* ───────────── placar em destaque ───────────── */
function useVlr(m: Match | null, sport: Sport) {
  const [d, setD] = useState<VlrDetail | null>(null)
  const link = sport === "valorant" && m && m.state !== "done" ? m.link : ""
  useEffect(() => {
    if (!link) { setD(null); return }
    let alive = true
    const run = () => invoke<VlrDetail>("sports:match", link).then((x) => { if (alive) setD(x) }).catch(() => {})
    void run()
    const id = setInterval(run, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [link])
  return d
}

function LiveView({ sport, m, agent, wide }: { sport: Sport; m: Match; agent: string; wide: boolean }) {
  const vlr = useVlr(m, sport)
  // a arte do agente só em cartões largos, num espaço só dela à direita (nunca por cima dos times)
  const art = sport === "valorant" && agent !== "none" && wide
  const live = m.state === "live"
  const info = live ? liveInfo(m) : null
  const map = vlr && live ? vlr.maps[vlr.current] : null
  const a = { ...m.a, logo: m.a.logo || vlr?.logos.a }, b = { ...m.b, logo: m.b.logo || vlr?.logos.b }
  const sub = live
    ? (sport === "valorant" && vlr ? `Mapa ${vlr.current + 1}${map?.name ? " · " + map.name : ""}` : info?.text)
    : m.state === "done" ? (m.detail && m.detail !== "Encerrado" ? m.detail : "Encerrado") : when(m.start) + (m.detail && sport !== "football" ? " · " + m.detail : "")
  return (
    <>
      {art && <AgentArt name={agent} />}
      <Head sport={sport} title={sport === "football" ? "Futebol" : SPORT_NAME[sport]} sub={(m.league && LEAGUE_NAME[m.league]) || m.event}
        right={live ? <span className="au-live">Ao vivo</span> : m.state === "done" ? <span className="au-chip">Encerrado</span> : null} />
      <div className="spa-score" data-wide={wide} data-art={art}>
        <div className="spa-team"><Crest t={a} size={wide ? 76 : 58} /><span className="spa-short">{a.short || a.name}</span></div>
        <div className="spa-mid">
          <div className="au-score spa-big">{m.state === "upcoming" ? "×" : `${m.a.score ?? 0} – ${m.b.score ?? 0}`}</div>
          <div className="spa-sub au-muted">{sub}</div>
        </div>
        <div className="spa-team spa-right"><span className="spa-short">{b.short || b.name}</span><Crest t={b} size={wide ? 76 : 58} /></div>
      </div>
      {info?.frac != null && <div className="au-bar"><i style={{ width: Math.round(info.frac * 100) + "%" }} /></div>}
    </>
  )
}

function AgentArt({ name }: { name: string }) {
  const agents = useAgents()
  const a = agents.find((x) => norm(x.displayName) === norm(name))
  if (!a?.fullPortrait) return null
  return <img className="spa-agent" src={a.fullPortrait} alt="" draggable={false} />
}

/* ───────────── versão pequena ───────────── */
function MiniView({ sport, m }: { sport: Sport; m: Match }) {
  const live = m.state === "live"
  const info = live ? liveInfo(m) : null
  const title = live ? "Ao vivo" : m.state === "upcoming" ? "Próximo jogo" : "Último jogo"
  return (
    <>
      <div className="spa-head"><span className="au-pill"><span className="au-ico"><SportIcon sport={sport} size={14} /></span><span className="truncate">{sport === "football" ? title : (m.event || title)}</span></span></div>
      <div className="spa-mini">
        <div className="spa-team"><Crest t={m.a} size={44} /><span className="spa-short">{m.a.short || m.a.name}</span></div>
        <div className="spa-mid">
          <div className="au-score spa-big">{m.state === "upcoming" ? "×" : `${m.a.score ?? 0}–${m.b.score ?? 0}`}</div>
          <div className="spa-sub au-muted">{live ? (m.clock || info?.text) : m.state === "upcoming" ? when(m.start) : "Encerrado"}</div>
        </div>
        <div className="spa-team"><Crest t={m.b} size={44} /><span className="spa-short">{m.b.short || m.b.name}</span></div>
      </div>
    </>
  )
}

/* ───────────── próximos jogos (futebol, basquete, F1) ───────────── */
function ListView({ sport, tab, setTab, list, favs, rows, paused, err, loading }: { sport: Sport; tab?: Tab; setTab: (t: Tab) => void; list: Match[]; favs: FavTeam[]; rows: number; paused: boolean; err: string; loading: boolean }) {
  const basket = usePoll<Match[]>(() => (tab === "basket" ? invoke("sports:basket", "nba") : Promise.resolve([])), 60_000, [tab], paused || tab !== "basket")
  const f1 = usePoll<F1Event[]>(() => (tab === "f1" ? invoke("sports:f1") : Promise.resolve([])), 5 * 60_000, [tab], paused || tab !== "f1")
  const src = tab === "basket" ? basket.data ?? [] : list
  const items = src.filter((m) => m.state !== "done").sort((a, b) => (a.state === "live" ? -1 : 0) - (b.state === "live" ? -1 : 0) || a.start - b.start)
  const fav = (m: Match) => isFav(m.a, favs) || isFav(m.b, favs)
  const shown = [...items.filter(fav), ...items.filter((m) => !fav(m))].slice(0, rows).sort((a, b) => (a.state === "live" ? -1 : 0) - (b.state === "live" ? -1 : 0) || a.start - b.start)
  const today = shown.length && new Date(shown[0].start).toDateString() === new Date().toDateString()
  const ev = (f1.data ?? []).find((e) => e.sessions.some((s) => s.state !== "done")) ?? (f1.data ?? [])[0]
  return (
    <>
      {tab ? (
        <div className="spa-head">
          <div className="au-tabs" role="group" aria-label="Esporte">
            {(["football", "basket", "f1"] as Tab[]).map((t) => <button key={t} type="button" aria-pressed={tab === t} aria-label={t === "football" ? "Futebol" : t === "basket" ? "Basquete (NBA)" : "Fórmula 1"} title={t === "football" ? "Futebol" : t === "basket" ? "Basquete (NBA)" : "Fórmula 1"} onClick={() => setTab(t)}><SportIcon sport="football" tab={t === "football" ? undefined : t} size={17} /></button>)}
          </div>
        </div>
      ) : <Head sport={sport} title={SPORT_NAME[sport]} sub="Próximos jogos" />}
      {tab === "f1" ? (
        <>
          <div className="spa-caption"><span className="truncate">{ev ? ev.name : "Fórmula 1"}</span><span className="au-muted">{ev?.circuit}</span></div>
          <div className="spa-rows">
            {!ev ? <div className="spa-empty small au-muted">{f1.err || (f1.data ? "Sem corridas na agenda." : "Buscando a agenda…")}</div>
              : ev.sessions.slice(0, rows + 1).map((s) => (
                <div key={s.type + s.start} className="spa-row" data-done={s.state === "done"}>
                  <span className="grow">{s.label}</span>
                  {s.state === "live" ? <span className="au-live">Ao vivo</span> : <span className="au-score spa-time">{when(s.start)}</span>}
                </div>
              ))}
          </div>
        </>
      ) : (
        <>
          <div className="spa-caption"><span>{today ? "Hoje · Próximos jogos" : "Próximos jogos"}</span><span className="au-muted">{shown.length} partida{shown.length === 1 ? "" : "s"}</span></div>
          <div className="spa-rows">
            {!shown.length && <div className="spa-empty small au-muted">{(tab === "basket" ? basket.err : err) ? "Sem conexão com a fonte." : (tab === "basket" ? !basket.data : loading) ? "Buscando partidas…" : "Nenhuma partida nos próximos dias."}</div>}
            {shown.map((m) => (
              <div key={m.id} className="spa-row" data-fav={fav(m)}>
                <Crest t={m.a} size={26} /><span className="spa-abbr">{m.a.short || m.a.name}</span>
                {m.state === "live" ? <span className="au-score spa-live-score">{m.a.score ?? 0} – {m.b.score ?? 0}</span> : <span className="spa-x">×</span>}
                <Crest t={m.b} size={26} /><span className="spa-abbr grow">{m.b.short || m.b.name}</span>
                {m.state === "live" ? <span className="au-live">{m.clock || "Ao vivo"}</span> : <span className="au-score spa-time">{new Date(m.start).toDateString() === new Date().toDateString() ? new Date(m.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : when(m.start)}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ───────────── classificação ───────────── */
function TableView({ league, paused, rows, favs }: { league: string; paused: boolean; rows: number; favs: FavTeam[] }) {
  const st = usePoll<Standings | null>(() => invoke("sports:standings", league), 10 * 60_000, [league], paused)
  const data = st.data
  return (
    <>
      <div className="spa-head">
        <span className="au-pill"><span className="au-ico"><Trophy size={14} /></span><span className="truncate">{LEAGUE_NAME[league] || data?.name || "Campeonato"}<span className="au-sub"> · Classificação</span></span></span>
      </div>
      <div className="spa-table">
        <div className="spa-th"><span /><span className="grow" /><span>PTS</span><span>J</span><span>V</span><span>SG</span></div>
        {!data?.rows.length && <div className="spa-empty small au-muted">{st.err ? "Sem conexão com a ESPN." : data ? "Classificação indisponível para este campeonato." : "Buscando a tabela…"}</div>}
        {data?.rows.slice(0, rows).map((r) => (
          <div key={r.team.id} className="spa-tr" data-fav={isFav(r.team, favs)} title={r.note?.text || undefined}>
            <i style={{ background: r.note?.color || "transparent" }} />
            <span className="spa-rank">{r.rank}</span>
            <Crest t={r.team} size={24} />
            <span className="grow truncate">{r.team.name}</span>
            <b className="au-score">{r.pts}</b><span className="au-score">{r.gp}</span><span className="au-score">{r.w}</span><span className="au-score">{r.gd}</span>
          </div>
        ))}
      </div>
    </>
  )
}
