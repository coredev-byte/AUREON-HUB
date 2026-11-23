import { useEffect, useMemo, useRef, useState } from "react"
import {
  AppWindow, Check, Clipboard, Crown, Eye, EyeOff, Lock, LockOpen, LogIn, LogOut, Maximize, Monitor, MonitorUp, Plus, RefreshCw, Repeat,
  ShieldCheck, Square, Stethoscope, UserX, Users, Volume2, VolumeX, X,
} from "lucide-react"
import { invoke, isElectron } from "@/shared/bridge"
import { fmtTime, useNow } from "@/shared/hooks"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Segmented, Switch, Empty, cx, Select, Tabs } from "@/shared/ui"
import type { ShareSource } from "@/shared/types"
import {
  admit, createRoom, endRoom, joinRoom, leaveRoom, roomSession, setQuality, signalUrl, setResolution, startSharing, stopSharing, switchSource, unwatchPeer, useShare, watchPeer,
} from "@/share/engine"
import type { Member, Watch } from "@/share/room"
import { PROFILES, RESOLUTIONS, type QualityId, type ResolutionId } from "@/share/quality"
import { diagnose, report, type DiagResult } from "@/share/diag"
import { useNav } from "../nav"

type Tab = "room" | "server"
const QUALITIES: QualityId[] = ["auto", "eco", "balanced", "quality"]
/** escolha da resolução de envio (lista suspensa: são 7 opções) */
function ResolutionPick({ value, onChange }: { value: ResolutionId; onChange: (r: ResolutionId) => void }) {
  return (
    <label className="row small" style={{ gap: 8 }} title="Automática: segue a qualidade e a rede. Fixa: a imagem mantém essa resolução e, se a rede apertar, diminui a taxa e os quadros por segundo.">
      Resolução
      <Select label="Resolução" value={value} onChange={onChange} options={RESOLUTIONS.map((r) => ({ value: r.id, label: r.label }))} />
    </label>
  )
}
/** "abcd efgh" -> "ABCD-EFGH" enquanto digita */
export const tidyCode = (v: string) => { const s = v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8); return s.length > 4 ? s.slice(0, 4) + "-" + s.slice(4) : s }
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
const Avatar = ({ name, live }: { name: string; live?: boolean }) => (
  <span className="au-avatar" data-live={!!live} style={{ background: `linear-gradient(140deg, hsl(${hue(name)} 60% 46%), hsl(${(hue(name) + 40) % 360} 55% 30%))` }}>{(name.trim()[0] || "?").toUpperCase()}</span>
)

export default function Share() {
  const params = useNav((s) => s.params)
  const [tab, setTab] = useState<Tab>(params.tab === "server" ? "server" : "room")
  useEffect(() => { if (params.tab === "server") setTab("server"); else if (params.join || params.pick) setTab("room") }, [params])
  const configured = !!signalUrl()
  return (
    <div className="page">
      <PageHead title="Transmissão" desc="Uma sala privada como um canal de voz: todo mundo pode transmitir a própria tela e cada um escolhe o que assistir." />
      <Tabs label="Transmissão" value={tab} onChange={setTab} tabs={[{ id: "room", label: "Sala" }, { id: "server", label: "Servidor e conexão" }]} />
      {!configured && tab !== "server" && (
        <div className="callout callout-warn" style={{ marginBottom: 14 }}>
          <span className="grow">A transmissão precisa de um servidor de sinalização (o seu, gratuito em Render/Fly.io). Configure o endereço para começar.</span>
          <button type="button" className="btn btn-sm" onClick={() => setTab("server")}>Configurar</button>
        </div>
      )}
      {tab === "room" && <RoomView join={typeof params.join === "string" ? params.join : ""} pick={!!params.pick} />}
      {tab === "server" && <ServerPanel />}
    </div>
  )
}

/* ───────────── fora da sala: criar ou entrar ───────────── */
function RoomView({ join, pick }: { join: string; pick: boolean }) {
  const r = useShare((s) => s.room)
  if (r.phase === "in-room") return <InRoom pick={pick} />
  if (r.phase === "waiting" || r.phase === "connecting") {
    return (
      <div className="au-card col" style={{ alignItems: "center", textAlign: "center", padding: 44, gap: 10 }}>
        <Users size={26} className="au-muted" />
        <div className="h2">{r.phase === "waiting" ? "Esperando aprovação" : "Conectando…"}</div>
        <div className="small au-muted">{r.phase === "waiting" ? "Quem cuida da sala precisa aceitar sua entrada." : "Falando com o servidor de transmissão."}</div>
        <button type="button" className="au-btn" onClick={leaveRoom}>Cancelar</button>
      </div>
    )
  }
  return <Lobby initialCode={join} />
}

function Lobby({ initialCode }: { initialCode: string }) {
  const r = useShare((s) => s.room)
  const prefs = useSection("share")
  const [code, setCode] = useState(tidyCode(initialCode))
  const [busy, setBusy] = useState<"" | "create" | "join">("")
  const [err, setErr] = useState("")
  useEffect(() => { if (initialCode) setCode(tidyCode(initialCode)) }, [initialCode])
  if (!prefs) return null
  const name = prefs.name
  const run = async (what: "create" | "join") => {
    setBusy(what); setErr("")
    try { if (what === "create") await createRoom(name.trim() || "Anfitrião"); else await joinRoom(code, name.trim() || "Convidado") }
    catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy("") }
  }
  const ok = code.replace("-", "").length === 8
  return (
    <div className="col" style={{ gap: 14 }}>
      {(err || r.phase === "error" || r.phase === "ended") && <div className={"callout " + (r.phase === "ended" ? "" : "callout-bad")}>{err || r.error}</div>}
      <div className="au-card" style={{ padding: 22 }}>
        <div className="row" style={{ gap: 10, marginBottom: 16 }}>
          <span className="au-muted small">Seu nome na sala</span>
          <input className="au-field" style={{ height: 36, width: 220 }} value={name} maxLength={40} placeholder="Como os outros te veem" aria-label="Seu nome" onChange={(e) => void patch("share", { name: e.target.value })} />
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="au-card au-flat col" style={{ padding: 18, gap: 12 }}>
            <div className="row" style={{ gap: 10 }}><span className="au-pill" style={{ paddingRight: 4 }}><span className="au-ico"><Plus size={14} /></span></span><div><div className="h2">Criar sala</div><div className="small au-muted">Você recebe um código curto para mandar aos amigos.</div></div></div>
            <label className="row small" style={{ gap: 10 }}><Switch label="Aprovar quem entra" checked={prefs.approval} onChange={(v) => void patch("share", { approval: v })} /><span>Aprovar quem entra <span className="au-dim">(recomendado)</span></span></label>
            <button type="button" className="au-btn au-btn-primary" style={{ marginTop: "auto" }} disabled={!!busy || !signalUrl()} onClick={() => void run("create")}><Plus size={15} />{busy === "create" ? "Criando…" : "Criar sala"}</button>
          </div>
          <div className="au-card au-flat col" style={{ padding: 18, gap: 12 }}>
            <div className="row" style={{ gap: 10 }}><span className="au-pill" style={{ paddingRight: 4 }}><span className="au-ico"><LogIn size={14} /></span></span><div><div className="h2">Entrar com código</div><div className="small au-muted">Ou abra o link aureon://join/… que você recebeu.</div></div></div>
            <input className="au-field au-code" placeholder="XXXX-XXXX" value={code} aria-label="Código da sala" onChange={(e) => setCode(tidyCode(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter" && ok) void run("join") }} />
            <button type="button" className="au-btn au-btn-primary" disabled={!ok || !!busy || !signalUrl()} onClick={() => void run("join")}><LogIn size={15} />{busy === "join" ? "Entrando…" : "Entrar"}</button>
          </div>
        </div>
      </div>
      <div className="row small au-muted" style={{ gap: 10, padding: "0 4px" }}>
        <ShieldCheck size={16} />
        <span>A tela vai criptografada direto entre os PCs. Ninguém transmite sem escolher a própria tela, nada é gravado e ninguém controla o PC de ninguém.</span>
      </div>
    </div>
  )
}

/* ───────────── dentro da sala ───────────── */
function InRoom({ pick }: { pick: boolean }) {
  const r = useShare((s) => s.room)
  const [picking, setPicking] = useState(false)
  useEffect(() => { if (pick && r.share.phase !== "off") setPicking(true) }, [pick])
  const others = r.members.filter((m) => m.peer !== r.me)
  const liveOthers = others.filter((m) => m.live)
  const sharing = r.share.phase !== "off"
  const tiles = r.watching.length + (sharing ? 1 : 0)
  return (
    <div className="col cr" style={{ gap: 14 }}>
    <StatusStrip />
    <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 14, alignItems: "start" }}>
      <div className="col" style={{ gap: 14, minWidth: 0 }}>
        {r.signal !== "online" && <div className="callout callout-warn">{r.signal === "reconnecting" ? "Reconectando ao servidor… as telas abertas continuam." : "Sem servidor: as telas abertas continuam, mas ninguém novo entra."}</div>}
        {(picking || r.share.phase === "source-lost") && (
          <SourcePanel
            title={r.share.phase === "source-lost" ? "A tela fechou: escolha outra" : sharing ? "Trocar a tela" : "O que você quer transmitir?"}
            onClose={() => setPicking(false)} live={sharing}
            onPick={async (s, audio, quality, resolution) => {
              if (sharing) await switchSource(s.id, s.name, s.kind)
              else await startSharing({ sourceId: s.id, sourceName: s.name, sourceKind: s.kind, audio, quality, resolution })
              setPicking(false)
            }} />
        )}
        {tiles > 0 ? (
          <div className="au-stage" data-n={Math.min(6, tiles)}>
            {sharing && <MyTile />}
            {r.watching.map((w) => <StreamTile key={w.peer} w={w} member={r.members.find((m) => m.peer === w.peer)} solo={tiles === 1} />)}
          </div>
        ) : (
          <div className="au-card col" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 260, gap: 12, padding: 24 }}>
            <MonitorUp size={28} className="au-muted" />
            <div className="h2">{liveOthers.length ? "Escolha uma tela para assistir" : "Ninguém está transmitindo"}</div>
            <div className="small au-muted" style={{ maxWidth: 420 }}>{liveOthers.length ? "Quem está ao vivo aparece abaixo e na lista ao lado. Dá para assistir várias telas ao mesmo tempo." : "Transmita a sua tela ou espere alguém começar. Você recebe um aviso quando isso acontecer."}</div>
            {liveOthers.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {liveOthers.map((m) => <button key={m.peer} type="button" className="au-btn" onClick={() => watchPeer(m.peer)}><Eye size={14} />Assistir {m.name}</button>)}
              </div>
            )}
          </div>
        )}
        <ShareBar onPick={() => setPicking(true)} picking={picking} />
      </div>
      <Sidebar />
    </div>
    </div>
  )
}

const GRADE: Record<string, { t: string; c: string }> = { good: { t: "boa", c: "var(--ok)" }, fair: { t: "razoável", c: "var(--warn)" }, poor: { t: "fraca", c: "var(--bad)" } }
/** faixa de status da sala (só leitura): sinal, pessoas, quem transmite, você no ar e qualidade */
function StatusStrip() {
  const r = useShare((s) => s.room)
  const grade = useShare((s) => s.grade)
  const now = useNow(1000)
  const sig = r.signal === "online" ? { t: "Conectado", c: "var(--ok)" } : r.signal === "reconnecting" ? { t: "Reconectando", c: "var(--warn)" } : { t: "Sem servidor", c: "var(--bad)" }
  const on = r.share.phase !== "off"
  const cells: { k: string; v: React.ReactNode; dot?: string; pulse?: boolean }[] = [
    { k: "Sala", v: <span className="num" style={{ letterSpacing: "0.1em" }}>{r.code || "—"}</span> },
    { k: "Servidor", v: sig.t, dot: sig.c, pulse: r.signal === "reconnecting" },
    { k: "Na sala", v: r.members.length },
    { k: "Transmitindo", v: r.members.filter((m) => m.live).length },
    { k: "Você", v: on ? <span className="num">{fmtTime((now.getTime() - r.share.startedAt) / 1000)}</span> : "fora do ar", dot: on ? "var(--live)" : "var(--dim)", pulse: on },
    { k: "Conexão", v: r.watching.length || r.share.viewers.length ? GRADE[grade].t : "—", dot: r.watching.length || r.share.viewers.length ? GRADE[grade].c : undefined },
  ]
  return (
    <div className="cr-strip au-card au-flat" role="status" aria-label="Status da sala">
      {cells.map((c) => (
        <div key={c.k} className="cr-cell">
          <span className="cr-k">{c.k}</span>
          <span className="cr-v">{c.dot && <i className={"cr-dot" + (c.pulse ? " cr-pulse" : "")} style={{ background: c.dot }} />}{c.v}</span>
        </div>
      ))}
    </div>
  )
}

/** minha transmissão: começar, trocar, qualidade, parar */
function ShareBar({ onPick, picking }: { onPick: () => void; picking: boolean }) {
  const r = useShare((s) => s.room)
  const now = useNow(1000)
  const sh = r.share
  if (sh.phase === "off") {
    return (
      <div className="au-card cr-console cr-off">
        <div className="cr-onair"><span className="cr-lamp" aria-hidden />Fora do ar</div>
        <div className="grow small au-muted" style={{ minWidth: 200 }}>{sh.error ? <span style={{ color: "var(--bad)" }}>{sh.error}</span> : "Mostre a sua tela para a sala. Cada pessoa decide se quer assistir."}</div>
        <button type="button" className="au-btn au-btn-primary" disabled={picking} onClick={onPick}><MonitorUp size={15} />Transmitir minha tela</button>
      </div>
    )
  }
  const st = sh.stats
  return (
    <div className="au-card cr-console">
      <div className="cr-onair"><span className="au-live">Ao vivo</span><span className="num cr-timer">{fmtTime((now.getTime() - sh.startedAt) / 1000)}</span></div>
      <div className="grow cr-src" style={{ minWidth: 160 }}>
        <div className="truncate" style={{ fontWeight: 500 }}>{sh.phase === "capturing" ? "Capturando…" : sh.source?.name}</div>
        {sh.audioMode === "no-discord" && sh.audio && <span className="au-chip" style={{ marginRight: 6 }} title="O som da sua call no Discord não vai para quem assiste">{sh.discordExcluded ? "Som sem o Discord" : "Som do PC"}</span>}
        {sh.audioNote && <div className="tiny" style={{ color: "var(--warn)" }}>{sh.audioNote}</div>}
        <div className="tiny au-muted num">{sh.viewers.length} assistindo{st ? ` · ${st.width}×${st.height} · ${st.fps} fps · ${(st.kbps / 1000).toFixed(1)} Mbit/s${st.codec ? " · " + st.codec + (st.hardware ? " (placa)" : "") : ""}` : ""}</div>
      </div>
      <div className="cr-controls">
        <Segmented label="Qualidade" value={sh.quality} onChange={(q) => void setQuality(q)} options={QUALITIES.map((q) => ({ value: q, label: PROFILES[q].label }))} />
        <ResolutionPick value={sh.resolution} onChange={(r) => { void patch("share", { resolution: r }); void setResolution(r) }} />
        <span className="cr-sep" aria-hidden />
        <button type="button" className="au-btn au-btn-sm" onClick={onPick}><Repeat size={13} />Trocar tela</button>
        <button type="button" className="au-btn au-btn-sm au-btn-danger" onClick={stopSharing}><Square size={11} />Parar</button>
      </div>
    </div>
  )
}

function MyTile() {
  const r = useShare((s) => s.room)
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => { const s = roomSession()?.localStream; if (v.current && s && v.current.srcObject !== s) v.current.srcObject = s }, [r.share.source?.id, r.share.phase])
  return (
    <div className="au-tile" style={{ aspectRatio: "16 / 9" }}>
      <video ref={v} autoPlay muted playsInline aria-label="Sua tela (pré-visualização)" />
      <div className="au-tile-tag"><span className="au-live">Você</span><span className="au-chip"><Eye size={12} />{r.share.viewers.length}</span></div>
      <div className="au-tile-bar"><span className="tiny" style={{ color: "rgba(255,255,255,.75)" }}>pré-visualização local · {r.share.source?.name}</span></div>
    </div>
  )
}

function StreamTile({ w, member, solo }: { w: Watch; member?: Member; solo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  useEffect(() => { if (ref.current && w.stream && ref.current.srcObject !== w.stream) ref.current.srcObject = w.stream }, [w.stream])
  useEffect(() => { if (ref.current) { ref.current.volume = vol; ref.current.muted = muted } }, [vol, muted])
  const hasAudio = !!w.stream?.getAudioTracks().length
  const st = w.stats
  const name = member?.name ?? "Transmissão"
  return (
    <div ref={box} className="au-tile" style={{ aspectRatio: "16 / 9" }} aria-label={"Tela de " + name}>
      <video ref={ref} autoPlay playsInline aria-label={"Transmissão de " + name} onDoubleClick={() => void box.current?.requestFullscreen()} />
      {w.phase !== "watching" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#cfd6e4" }} className="small">
          {w.phase === "away" ? `${name} caiu; esperando voltar…` : w.phase === "stopped" ? (
            <div className="col" style={{ alignItems: "center", gap: 10 }}>
              <span>{name} parou de transmitir.</span>
              <div className="row">
                {member?.live && <button type="button" className="au-btn au-btn-sm" onClick={() => { unwatchPeer(w.peer); watchPeer(w.peer) }}>Assistir de novo</button>}
                <button type="button" className="au-btn au-btn-sm" onClick={() => unwatchPeer(w.peer)}>Fechar</button>
              </div>
            </div>
          ) : "Conectando à tela…"}
        </div>
      )}
      <div className="au-tile-tag">
        <span className="au-live">{name}</span>
        {member?.live && <span className="au-chip truncate" style={{ maxWidth: 180 }}>{member.live.label}</span>}
        {w.phase === "watching" && st && <span className="au-chip" title={"Conexão " + GRADE[w.grade].t}><i className="cr-dot" style={{ background: GRADE[w.grade].c }} />{st.height}p</span>}
      </div>
      <div className="au-tile-bar">
        <span className="tiny num grow truncate" style={{ color: "rgba(255,255,255,.8)" }}>{st ? `${st.width}×${st.height} · ${st.fps} fps · ${(st.kbps / 1000).toFixed(1)} Mbit/s${st.rttMs != null ? " · " + st.rttMs + " ms" : ""}` : ""}</span>
        {hasAudio && (
          <>
            <button type="button" className="icon-btn" style={{ color: "#fff" }} aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
            {solo && <input className="range" type="range" min={0} max={1} step={0.05} value={vol} aria-label="Volume" style={{ width: 90 }} onChange={(e) => { setVol(Number(e.target.value)); setMuted(false) }} />}
          </>
        )}
        <button type="button" className="icon-btn" style={{ color: "#fff" }} aria-label="Tela cheia" onClick={() => void box.current?.requestFullscreen()}><Maximize size={15} /></button>
        <button type="button" className="icon-btn" style={{ color: "#fff" }} aria-label={"Parar de assistir " + name} onClick={() => unwatchPeer(w.peer)}><X size={15} /></button>
      </div>
    </div>
  )
}

/* ───────────── lateral: sala, pessoas, pedidos ───────────── */
function Sidebar() {
  const r = useShare((s) => s.room)
  const [copied, setCopied] = useState("")
  const owner = r.me === r.owner
  const copy = (txt: string, what: string) => { void navigator.clipboard.writeText(txt); setCopied(what); setTimeout(() => setCopied(""), 1500) }
  const watching = useMemo(() => new Set(r.watching.map((w) => w.peer)), [r.watching])
  const viewersOfMe = useMemo(() => new Set(r.share.viewers.map((v) => v.peer)), [r.share.viewers])
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="au-card" style={{ padding: 16 }}>
        <div className="cr-head"><Lock size={12} />Acesso</div>
        <div className="tiny au-muted">Código da sala</div>
        <div className="au-score" style={{ fontSize: 30, letterSpacing: "0.12em", margin: "6px 0 12px" }} aria-label="Código da sala">{r.code || "—"}</div>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          <button type="button" className="au-btn au-btn-sm" onClick={() => copy(r.code, "code")}>{copied === "code" ? <Check size={12} /> : <Clipboard size={12} />}Copiar</button>
          <button type="button" className="au-btn au-btn-sm" onClick={() => copy("aureon://join/" + r.code, "link")}>{copied === "link" ? <Check size={12} /> : <Clipboard size={12} />}Link</button>
          {owner && <button type="button" className="au-btn au-btn-sm" title="Gera um código novo; o antigo deixa de valer" onClick={() => roomSession()?.rotateCode()}><RefreshCw size={12} />Novo</button>}
        </div>
        {owner && r.codeExpires > 0 && <div className="tiny au-dim" style={{ marginTop: 10 }}>Vale até {new Date(r.codeExpires).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} para novas entradas. Mande só para quem você conhece.</div>}
        {owner && (
          <>
            <hr className="au-sep" style={{ margin: "14px 0" }} />
            <div className="row small"><span className="grow">Aprovar quem entra</span><Switch label="Aprovar quem entra" checked={r.approval} onChange={(v) => roomSession()?.setApproval(v)} /></div>
            <div className="row small" style={{ marginTop: 10 }}><span className="grow row" style={{ gap: 6 }}>{r.locked ? <><Lock size={12} />Sala trancada</> : <><LockOpen size={12} />Aceitando pedidos</>}</span><Switch label="Trancar sala" checked={r.locked} onChange={(v) => roomSession()?.setLocked(v)} /></div>
          </>
        )}
      </div>

      {owner && r.requests.length > 0 && (
        <div className="au-card" style={{ padding: 14, borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)" }}>
          <div className="cr-head" style={{ color: "var(--warn)" }}><Users size={12} />Pedindo para entrar ({r.requests.length})</div>
          {r.requests.map((q) => (
            <div key={q.peer} className="row" style={{ padding: "6px 0" }}>
              <Avatar name={q.name} />
              <span className="grow truncate">{q.name}</span>
              <button type="button" className="au-btn au-btn-sm au-btn-primary" onClick={() => admit(q.peer, true)}>Aceitar</button>
              <button type="button" className="au-btn au-btn-sm" onClick={() => admit(q.peer, false)}>Recusar</button>
            </div>
          ))}
        </div>
      )}

      <div className="au-card" style={{ padding: "12px 10px 8px" }}>
        <div className="cr-head" style={{ padding: "0 6px 4px" }}><Users size={12} /><span className="grow">Na sala ({r.members.length})</span></div>
        <div className="col" style={{ gap: 2 }}>
          {r.members.map((m) => {
            const me = m.peer === r.me
            return (
              <div key={m.peer} className="row cr-member" style={{ opacity: m.away ? 0.55 : 1 }}>
                <Avatar name={m.name} live={!!m.live} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 5 }}><span className="truncate" style={{ fontWeight: 500 }}>{m.name}{me ? " (você)" : ""}</span>{m.owner && <Crown size={12} color="var(--warn)" aria-label="cuida da sala" />}</div>
                  <div className="tiny au-muted truncate">{m.away ? "caiu, voltando…" : m.live ? "ao vivo · " + m.live.label : viewersOfMe.has(m.peer) ? "assistindo você" : "na sala"}</div>
                </div>
                {!me && m.live && (watching.has(m.peer)
                  ? <button type="button" className="au-btn au-btn-sm" aria-label={"Parar de assistir " + m.name} onClick={() => unwatchPeer(m.peer)}><EyeOff size={12} /></button>
                  : <button type="button" className="au-btn au-btn-sm au-btn-primary" onClick={() => watchPeer(m.peer)}><Eye size={12} />Assistir</button>)}
                {!me && owner && <button type="button" className="icon-btn" title="Remover da sala" aria-label={`Remover ${m.name}`} onClick={() => roomSession()?.kick(m.peer)}><UserX size={14} /></button>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="au-btn grow" onClick={leaveRoom}><LogOut size={14} />Sair da sala</button>
        {owner && <button type="button" className="au-btn au-btn-danger" title="Fecha a sala para todo mundo" onClick={endRoom}>Encerrar sala</button>}
      </div>
    </div>
  )
}

/* ───────────── escolher tela/janela ───────────── */
function SourcePanel({ title, onPick, onClose, live }: { title: string; onPick: (s: ShareSource, audio: boolean, q: QualityId, r: ResolutionId) => Promise<void>; onClose: () => void; live: boolean }) {
  const prefs = useSection("share")
  const [list, setList] = useState<ShareSource[] | null>(null)
  const [err, setErr] = useState("")
  const [sel, setSel] = useState<ShareSource | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => { setErr(""); void invoke<ShareSource[]>("share:sources").then(setList).catch((e) => setErr(String(e?.message || e))) }
  useEffect(load, [])
  if (!prefs) return null
  const screens = list?.filter((s) => s.kind === "screen") ?? [], windows = list?.filter((s) => s.kind === "window") ?? []
  const go = async (s: ShareSource | null) => {
    if (!s) return
    setBusy(true); setErr("")
    try { await onPick(s, prefs.audio, prefs.quality, prefs.resolution ?? "auto") } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }
  const card = (s: ShareSource) => (
    <button key={s.id} type="button" onClick={() => { setSel(s); if (live) void go(s) }} onDoubleClick={() => void go(s)} aria-pressed={sel?.id === s.id}
      className="au-card au-flat" style={{ padding: 8, textAlign: "left", borderColor: sel?.id === s.id ? "var(--accent)" : undefined, boxShadow: sel?.id === s.id ? "0 0 0 1px var(--accent)" : undefined }}>
      <div style={{ aspectRatio: "16 / 9", overflow: "hidden", display: "grid", placeItems: "center", marginBottom: 8, borderRadius: 10, background: "rgba(0,0,0,.3)" }}>
        {s.thumb ? <img src={s.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : s.kind === "screen" ? <Monitor size={22} className="au-dim" /> : <AppWindow size={22} className="au-dim" />}
      </div>
      <div className="row small" style={{ gap: 6 }}>{s.icon ? <img src={s.icon} alt="" width={14} height={14} /> : s.kind === "screen" ? <Monitor size={13} /> : <AppWindow size={13} />}<span className="truncate">{s.name}</span></div>
    </button>
  )
  return (
    <div className="au-card" style={{ padding: 16 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="h2 grow">{title}</span>
        <button type="button" className="au-btn au-btn-sm" onClick={load}><RefreshCw size={12} />Atualizar</button>
        <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={15} /></button>
      </div>
      {err && <div className="callout callout-bad" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="tiny au-muted" style={{ marginBottom: 6 }}>Telas</div>
      <div className="grid-3" style={{ gap: 10, marginBottom: 12 }}>{screens.map(card)}</div>
      {windows.length > 0 && <><div className="tiny au-muted" style={{ marginBottom: 6 }}>Janelas</div><div className="grid-3 scroll" style={{ gap: 10, maxHeight: 300, marginBottom: 12 }}>{windows.map(card)}</div></>}
      {!live && (
        <>
          <hr className="au-sep" style={{ margin: "4px 0 12px" }} />
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <Segmented label="Qualidade" value={prefs.quality} onChange={(v) => void patch("share", { quality: v })} options={QUALITIES.map((q) => ({ value: q, label: PROFILES[q].label }))} />
            <ResolutionPick value={prefs.resolution ?? "auto"} onChange={(r) => void patch("share", { resolution: r })} />
            <label className="row small" style={{ gap: 8 }} title={isElectron && navigator.userAgent.includes("Windows") ? "Envia todo o som do computador (o Windows não separa o som de uma janela só)." : "Disponível no Windows."}>
              <Switch label="Som do PC" checked={prefs.audio} onChange={(v) => void patch("share", { audio: v })} />Som do PC
            </label>
            {prefs.audio && (
              <label className="row small" style={{ gap: 8 }} title="Tudo menos o Discord: quem assiste ouve o jogo, a música e o resto, mas não a sua call. Usa a captura por programa do Windows (10 versão 2004 ou mais novo, ou 11).">
                Som
                <Select label="Qual som" value={(prefs.audioMode ?? "all") as "all" | "no-discord"} onChange={(v) => void patch("share", { audioMode: v })} options={[{ value: "all", label: "Tudo do PC" }, { value: "no-discord", label: "Tudo menos o Discord" }]} />
              </label>
            )}
            <label className="row small" style={{ gap: 8 }} title="Usa H.264 (NVENC, Quick Sync, AMF) quando existir: menos uso de processador.">
              <Switch label="Preferir placa de vídeo" checked={prefs.preferHardware} onChange={(v) => void patch("share", { preferHardware: v })} />Placa de vídeo
            </label>
            <span className="grow" />
            <button type="button" className={cx("au-btn", "au-btn-primary")} disabled={!sel || busy} onClick={() => void go(sel)}><MonitorUp size={15} />{busy ? "Capturando…" : "Começar a transmitir"}</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ───────────── servidor ───────────── */
function ServerPanel() {
  const s = useSection("settings")
  const [url, setUrl] = useState(s?.signalUrl ?? "")
  const [saved, setSaved] = useState(false)
  if (!s) return null
  const valid = /^wss?:\/\/\S+$/i.test(url.trim())
  return (
    <>
      <Section title="Servidor de sinalização" desc="Faz as pessoas se encontrarem e troca as mensagens de conexão. Vídeo e áudio não passam por ele.">
        <div className="row">
          <input className="field grow" placeholder="wss://seu-servidor.onrender.com/ws" value={url} onChange={(e) => { setUrl(e.target.value); setSaved(false) }} aria-label="Endereço do servidor" />
          <button type="button" className="btn btn-primary" disabled={!valid && url.trim() !== ""} onClick={() => { void patch("settings", { signalUrl: url.trim() }); setSaved(true) }}>{saved ? <><Check size={13} />Salvo</> : "Salvar"}</button>
        </div>
        {url.trim() && !valid && <div className="tiny" style={{ color: "var(--bad)", marginTop: 6 }}>Use um endereço que começa com wss://</div>}
        <div className="small muted" style={{ marginTop: 10 }}>Todo mundo na sala precisa usar o mesmo servidor, na versão 2.0 ou mais nova (salas com várias pessoas transmitindo). Como publicar o seu (Render, Fly.io ou VPS) e o TURN para redes fechadas: <b>docs/servidor-transmissao.md</b>.</div>
      </Section>
      <ConnectionTest />
    </>
  )
}

export function ConnectionTest() {
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<DiagResult | null>(null)
  const run = async () => { setBusy(true); try { setR(await diagnose(signalUrl())) } finally { setBusy(false) } }
  return (
    <Section title="Testar conexão" desc="Confere servidor, conexão em tempo real, criação de sala, conexão direta (UDP) e retransmissão (TURN). Leva uns 10 segundos."
      actions={<button type="button" className="btn" disabled={busy} onClick={() => void run()}><Stethoscope size={13} />{busy ? "Testando…" : r ? "Testar de novo" : "Testar"}</button>}>
      {!r && !busy && <Empty icon={<Stethoscope size={24} />} title="Nenhum teste ainda" desc="Rode o teste se alguém não consegue entrar ou a imagem não chega." />}
      {r && (
        <div className="col" style={{ gap: 10 }}>
          <div className={"callout " + (r.verdict.level === "ok" ? "callout-ok" : r.verdict.level === "warn" ? "callout-warn" : "callout-bad")}>
            <div className="col" style={{ gap: 6 }}>
              <b>{r.verdict.title}</b>
              {r.verdict.fixes.length > 0 && <ol style={{ margin: 0, paddingLeft: 18 }} className="small">{r.verdict.fixes.map((f) => <li key={f}>{f}</li>)}</ol>}
            </div>
          </div>
          {r.steps.map((s) => (
            <div key={s.id} className="row small">
              <span className="dot" style={{ color: s.ok == null ? "var(--dim)" : s.ok ? "var(--ok)" : "var(--bad)" }} />
              <span className="grow">{s.label}</span><span className="muted">{s.detail}</span>
            </div>
          ))}
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => void navigator.clipboard.writeText(report(r))}><Clipboard size={12} />Copiar resultado</button>
        </div>
      )}
    </Section>
  )
}
