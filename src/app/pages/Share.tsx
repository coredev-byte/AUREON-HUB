import { useEffect, useMemo, useRef, useState } from "react"
import {
  AppWindow, Check, Clipboard, Crown, Expand, Eye, EyeOff, KeyRound, Shrink, Lock, LockOpen, LogIn, Maximize, Minimize, Monitor, MonitorOff, MonitorUp, PhoneOff, Plus,
  RefreshCw, Repeat, Settings2, ShieldCheck, Stethoscope, UserPlus, UserX, Users, Volume2, VolumeX, X,
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
import "./share-dc.css"

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
/** nome da sala enquanto digita: minúsculas, sem acento, hífen no lugar de espaço */
export const tidyRoom = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").slice(0, 24)
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
const Avatar = ({ name, size = 32, live }: { name: string; size?: number; live?: boolean }) => (
  <span className="dc-avatar" data-live={!!live} style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(name)} 45% 42%)` }}>{(name.trim()[0] || "?").toUpperCase()}</span>
)
const invite = (room: string, pw: string) => `Entra na minha sala do Aureon Hub!\nSala: ${room}\nSenha: ${pw}\n(ou abra aureon://join/${room} e digite a senha)`

export default function Share() {
  const params = useNav((s) => s.params)
  const [tab, setTab] = useState<Tab>(params.tab === "server" ? "server" : "room")
  useEffect(() => { if (params.tab === "server") setTab("server"); else if (params.join || params.pick) setTab("room") }, [params])
  const configured = !!signalUrl()
  return (
    <div className="page dc-page">
      <PageHead title="Transmissão" desc="Uma sala como um canal de voz: todo mundo pode transmitir a própria tela e cada um escolhe o que assistir." />
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

/* ───────────── fora da sala: criar ou entrar (nome + senha) ───────────── */
function RoomView({ join, pick }: { join: string; pick: boolean }) {
  const r = useShare((s) => s.room)
  if (r.phase === "in-room") return <InRoom pick={pick} />
  if (r.phase === "waiting" || r.phase === "connecting") {
    return (
      <div className="dc dc-center">
        <div className="dc-spinner" aria-hidden />
        <div className="dc-title">{r.phase === "waiting" ? "Esperando aprovação" : "Conectando…"}</div>
        <div className="dc-muted">{r.phase === "waiting" ? "Quem cuida da sala precisa aceitar sua entrada." : "Falando com o servidor de transmissão."}</div>
        <button type="button" className="dc-btn" onClick={leaveRoom}>Cancelar</button>
      </div>
    )
  }
  return <Lobby initialRoom={join} />
}

function PasswordField({ value, onChange, label, placeholder, onEnter }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; onEnter?: () => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="dc-input-wrap">
      <KeyRound size={15} className="dc-input-ico" />
      <input className="dc-input" type={show ? "text" : "password"} value={value} maxLength={64} placeholder={placeholder} aria-label={label} autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter?.() }} />
      <button type="button" className="dc-input-btn" aria-label={show ? "Esconder senha" : "Mostrar senha"} onClick={() => setShow(!show)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
  )
}

function Lobby({ initialRoom }: { initialRoom: string }) {
  const r = useShare((s) => s.room)
  const prefs = useSection("share")
  const [newRoom, setNewRoom] = useState("")
  const [newPw, setNewPw] = useState("")
  const [room, setRoom] = useState(tidyRoom(initialRoom))
  const [pw, setPw] = useState("")
  const [busy, setBusy] = useState<"" | "create" | "join">("")
  const [err, setErr] = useState("")
  useEffect(() => { if (initialRoom) setRoom(tidyRoom(initialRoom)) }, [initialRoom])
  if (!prefs) return null
  const name = prefs.name
  const run = async (what: "create" | "join") => {
    setBusy(what); setErr("")
    try {
      if (what === "create") await createRoom(newRoom, newPw, name.trim() || "Anfitrião")
      else await joinRoom(room, pw, name.trim() || "Convidado")
    } catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy("") }
  }
  const canCreate = newRoom.length >= 3 && newPw.length >= 4
  const canJoin = room.length >= 3 && pw.length >= 1
  return (
    <div className="dc dc-lobby">
      {(err || r.phase === "error" || r.phase === "ended") && <div className={"dc-alert" + (r.phase === "ended" && !err ? "" : " dc-alert-bad")}>{err || r.error}</div>}
      <label className="dc-field">
        <span className="dc-label">Seu nome na sala</span>
        <input className="dc-input" value={name} maxLength={40} placeholder="Como os outros te veem" aria-label="Seu nome" onChange={(e) => void patch("share", { name: e.target.value })} />
      </label>
      <div className="dc-lobby-grid">
        <div className="dc-box">
          <div className="dc-box-head"><span className="dc-box-ico"><Plus size={18} /></span><div><div className="dc-title">Criar sala</div><div className="dc-muted">Escolha um nome e uma senha e mande para os amigos.</div></div></div>
          <label className="dc-field"><span className="dc-label">Nome da sala</span>
            <input className="dc-input" value={newRoom} placeholder="ex.: jogatina-de-sexta" aria-label="Nome da nova sala" onChange={(e) => setNewRoom(tidyRoom(e.target.value))} />
          </label>
          <label className="dc-field"><span className="dc-label">Senha <span className="dc-dim">(mínimo 4 caracteres)</span></span>
            <PasswordField value={newPw} onChange={setNewPw} label="Senha da nova sala" placeholder="Crie uma senha" onEnter={() => canCreate && void run("create")} />
          </label>
          <label className="dc-check"><Switch label="Aprovar quem entra" checked={prefs.approval} onChange={(v) => void patch("share", { approval: v })} />Aprovar cada pessoa que entrar <span className="dc-dim">(recomendado)</span></label>
          <button type="button" className="dc-btn dc-btn-primary" disabled={!canCreate || !!busy || !signalUrl()} onClick={() => void run("create")}><Plus size={16} />{busy === "create" ? "Criando…" : "Criar sala"}</button>
        </div>
        <div className="dc-box">
          <div className="dc-box-head"><span className="dc-box-ico"><LogIn size={18} /></span><div><div className="dc-title">Entrar numa sala</div><div className="dc-muted">Digite o nome da sala e a senha que você recebeu.</div></div></div>
          <label className="dc-field"><span className="dc-label">Nome da sala</span>
            <input className="dc-input" value={room} placeholder="nome-da-sala" aria-label="Nome da sala" onChange={(e) => setRoom(tidyRoom(e.target.value))} />
          </label>
          <label className="dc-field"><span className="dc-label">Senha</span>
            <PasswordField value={pw} onChange={setPw} label="Senha da sala" placeholder="Senha da sala" onEnter={() => canJoin && void run("join")} />
          </label>
          <span className="grow" />
          <button type="button" className="dc-btn dc-btn-primary" disabled={!canJoin || !!busy || !signalUrl()} onClick={() => void run("join")}><LogIn size={16} />{busy === "join" ? "Entrando…" : "Entrar"}</button>
        </div>
      </div>
      <div className="dc-note"><ShieldCheck size={15} />A tela vai criptografada direto entre os PCs. Ninguém transmite sem escolher a própria tela, nada é gravado e ninguém controla o PC de ninguém. O servidor guarda só um resumo da senha, nunca a senha.</div>
    </div>
  )
}

/* ───────────── dentro da sala ───────────── */
type TileKind = { peer: string; kind: "me" | "video" | "preview" | "avatar" }
function InRoom({ pick }: { pick: boolean }) {
  const r = useShare((s) => s.room)
  const [picking, setPicking] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => { if (pick && r.share.phase !== "off") setPicking(true) }, [pick])
  const sharing = r.share.phase !== "off"
  const watching = useMemo(() => new Map(r.watching.map((w) => [w.peer, w])), [r.watching])
  // como num canal de voz: um bloco por pessoa (a tela, a prévia "ao vivo" ou o avatar)
  const tiles: TileKind[] = r.members.map((m) => ({
    peer: m.peer,
    kind: m.peer === r.me ? (sharing ? "me" : "avatar") : watching.has(m.peer) ? "video" : m.live ? "preview" : "avatar",
  }))
  // quem eu assisto mas já saiu da lista continua até eu fechar
  for (const w of r.watching) if (!r.members.some((m) => m.peer === w.peer)) tiles.push({ peer: w.peer, kind: "video" })
  const focused = focus && tiles.some((t) => t.peer === focus) ? focus : null
  const main = focused ? tiles.filter((t) => t.peer === focused) : tiles
  const strip = focused ? tiles.filter((t) => t.peer !== focused) : []
  const tile = (t: TileKind, small = false) => {
    const m = r.members.find((x) => x.peer === t.peer)
    const props = { small, focused: focused === t.peer, onFocus: () => setFocus(focused === t.peer ? null : t.peer) }
    if (t.kind === "me") return <MyTile key={t.peer} {...props} />
    if (t.kind === "video") return <StreamTile key={t.peer} {...props} w={watching.get(t.peer)!} member={m} />
    if (t.kind === "preview") return <PreviewTile key={t.peer} {...props} m={m!} />
    return <AvatarTile key={t.peer} {...props} m={m!} me={t.peer === r.me} />
  }
  return (
    <div className="dc dc-room">
      <RoomHeader />
      <div className="dc-body">
        <div className="dc-stage-wrap">
          {r.signal !== "online" && <div className="dc-alert">{r.signal === "reconnecting" ? "Reconectando ao servidor… as telas abertas continuam." : "Sem servidor: as telas abertas continuam, mas ninguém novo entra."}</div>}
          <div className="dc-stage" data-n={Math.min(9, main.length)} data-focus={!!focused}>{main.map((t) => tile(t))}</div>
          {strip.length > 0 && <div className="dc-strip">{strip.map((t) => tile(t, true))}</div>}
          <ControlBar onPick={() => setPicking(true)} picking={picking} />
        </div>
        <MemberPanel />
      </div>
      {(picking || r.share.phase === "source-lost") && (
        <SourcePicker
          title={r.share.phase === "source-lost" ? "A tela fechou: escolha outra" : sharing ? "Trocar a tela" : "Transmitir tela"}
          onClose={() => setPicking(false)} live={sharing}
          onPick={async (s, audio, quality, resolution) => {
            if (sharing) await switchSource(s.id, s.name, s.kind)
            else await startSharing({ sourceId: s.id, sourceName: s.name, sourceKind: s.kind, audio, quality, resolution })
            setPicking(false)
          }} />
      )}
    </div>
  )
}

function RoomHeader() {
  const r = useShare((s) => s.room)
  const [copied, setCopied] = useState(false)
  const sig = r.signal === "online" ? { t: "Conectado", c: "var(--dc-green)" } : r.signal === "reconnecting" ? { t: "Reconectando", c: "#f0b232" } : { t: "Sem servidor", c: "var(--dc-red)" }
  const live = r.members.filter((m) => m.live).length
  return (
    <div className="dc-head">
      <Monitor size={20} className="dc-head-ico" />
      <span className="dc-head-name" aria-label="Nome da sala">{r.roomName || r.code || "sala"}</span>
      <span className="dc-head-sep" />
      <span className="dc-head-info"><i className="dc-dot" style={{ background: sig.c }} />{sig.t}</span>
      <span className="dc-head-info"><Users size={14} />{r.members.length}</span>
      {live > 0 && <span className="dc-live-pill">{live} ao vivo</span>}
      <span className="grow" />
      <button type="button" className="dc-btn dc-btn-sm dc-btn-primary" onClick={() => { void navigator.clipboard.writeText(invite(r.roomName, r.password)); setCopied(true); setTimeout(() => setCopied(false), 1600) }}>
        {copied ? <Check size={14} /> : <UserPlus size={14} />}{copied ? "Convite copiado" : "Convidar"}
      </button>
    </div>
  )
}

/* ───────────── blocos do palco ───────────── */
type TileProps = { small: boolean; focused: boolean; onFocus: () => void }
function TileFrame({ children, label, live, small, focused, onFocus, extra, aria }: { children: React.ReactNode; label: React.ReactNode; live?: boolean; extra?: React.ReactNode; aria?: string } & TileProps) {
  return (
    <div className={cx("dc-tile", small && "dc-tile-small", focused && "dc-tile-focused")} aria-label={aria} onDoubleClick={onFocus}>
      {children}
      <div className="dc-tile-name">{live && <span className="dc-live">AO VIVO</span>}<span className="truncate">{label}</span></div>
      {extra}
      {!small && <button type="button" className="dc-tile-focus" aria-label={focused ? "Voltar à grade" : "Focar"} title={focused ? "Voltar à grade" : "Focar"} onClick={onFocus}>{focused ? <Minimize size={15} /> : <Maximize size={15} />}</button>}
    </div>
  )
}

function AvatarTile({ m, me, ...t }: TileProps & { m: Member; me: boolean }) {
  return (
    <TileFrame {...t} label={m.name + (me ? " (você)" : "")} aria={"Bloco de " + m.name}>
      <div className="dc-tile-bg" style={{ background: `hsl(${hue(m.name)} 30% 22%)` }}><Avatar name={m.name} size={t.small ? 40 : 76} /></div>
      {m.away && <div className="dc-tile-over">caiu, voltando…</div>}
    </TileFrame>
  )
}

function PreviewTile({ m, ...t }: TileProps & { m: Member }) {
  return (
    <TileFrame {...t} live label={m.name} aria={"Transmissão de " + m.name + " (não aberta)"}>
      <div className="dc-tile-bg dc-tile-preview" style={{ background: `hsl(${hue(m.name)} 30% 18%)` }}>
        <Avatar name={m.name} size={t.small ? 36 : 64} live />
        {!t.small && <div className="dc-preview-text">{m.name} está transmitindo<span className="dc-dim truncate">{m.live?.label}</span></div>}
        <button type="button" className="dc-btn dc-btn-primary dc-btn-sm" onClick={() => watchPeer(m.peer)}><Eye size={14} />Assistir transmissão</button>
      </div>
    </TileFrame>
  )
}

function MyTile(t: TileProps) {
  const r = useShare((s) => s.room)
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => { const s = roomSession()?.localStream; if (v.current && s && v.current.srcObject !== s) v.current.srcObject = s }, [r.share.source?.id, r.share.phase])
  return (
    <TileFrame {...t} live label={"Você · " + (r.share.source?.name ?? "")} aria="Sua tela"
      extra={<span className="dc-tile-badge"><Eye size={12} />{r.share.viewers.length}</span>}>
      <video ref={v} autoPlay muted playsInline aria-label="Sua tela (pré-visualização)" />
    </TileFrame>
  )
}

const GRADE: Record<string, { t: string; c: string }> = { good: { t: "boa", c: "var(--dc-green)" }, fair: { t: "razoável", c: "#f0b232" }, poor: { t: "fraca", c: "var(--dc-red)" } }
/** tela cheia de um bloco: entra e SAI pelo mesmo botão (e por Esc / clique duplo); avisa quando muda */
function useFullscreen(box: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    // além do aviso de mudança, confere ao redimensionar: sair por Esc ou pelo sistema sempre muda o tamanho
    const ch = () => setOn(!!box.current && document.fullscreenElement === box.current)
    document.addEventListener("fullscreenchange", ch)
    window.addEventListener("resize", ch)
    return () => { document.removeEventListener("fullscreenchange", ch); window.removeEventListener("resize", ch) }
  }, [box])
  // Esc sai da tela cheia mesmo onde o Electron não trata isso sozinho
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && document.fullscreenElement) void document.exitFullscreen().catch(() => {}) }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [on])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void box.current?.requestFullscreen().catch(() => {})
  }
  return { on, toggle }
}

function StreamTile({ w, member, ...t }: TileProps & { w: Watch; member?: Member }) {
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const fs = useFullscreen(box)
  // em tela cheia os controles aparecem ao mexer o mouse e somem depois de um tempo parado
  const [awake, setAwake] = useState(true)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wake = () => { setAwake(true); clearTimeout(idle.current); idle.current = setTimeout(() => setAwake(false), 2500) }
  useEffect(() => { if (fs.on) wake(); return () => clearTimeout(idle.current) }, [fs.on])
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  useEffect(() => { if (ref.current && w.stream && ref.current.srcObject !== w.stream) ref.current.srcObject = w.stream }, [w.stream])
  useEffect(() => { if (ref.current) { ref.current.volume = vol; ref.current.muted = muted } }, [vol, muted])
  const hasAudio = !!w.stream?.getAudioTracks().length
  const st = w.stats
  const name = member?.name ?? "Transmissão"
  return (
    <div ref={box} className={cx("dc-tile", t.small && "dc-tile-small", t.focused && "dc-tile-focused", fs.on && "dc-fs", fs.on && awake && "dc-fs-awake")} aria-label={"Tela de " + name}
      onDoubleClick={fs.on ? fs.toggle : t.onFocus} onMouseMove={fs.on ? wake : undefined}>
      {fs.on && <button type="button" className="dc-fs-exit" aria-label="Sair da tela cheia" onClick={fs.toggle}><Minimize size={16} />Sair da tela cheia<span className="dc-dim">Esc</span></button>}
      <video ref={ref} autoPlay playsInline aria-label={"Transmissão de " + name} />
      {w.phase !== "watching" && (
        <div className="dc-tile-over">
          {w.phase === "away" ? `${name} caiu; esperando voltar…` : w.phase === "stopped" ? (
            <div className="col" style={{ alignItems: "center", gap: 10 }}>
              <span>{name} parou de transmitir.</span>
              <div className="row">
                {member?.live && <button type="button" className="dc-btn dc-btn-sm" onClick={() => { unwatchPeer(w.peer); watchPeer(w.peer) }}>Assistir de novo</button>}
                <button type="button" className="dc-btn dc-btn-sm" onClick={() => unwatchPeer(w.peer)}>Fechar</button>
              </div>
            </div>
          ) : <><span className="dc-spinner dc-spinner-sm" aria-hidden />Conectando à tela…</>}
        </div>
      )}
      <div className="dc-tile-name"><span className="dc-live">AO VIVO</span><span className="truncate">{name}</span>
        {w.phase === "watching" && st && <span className="dc-q" title={"Conexão " + GRADE[w.grade].t}><i className="dc-dot" style={{ background: GRADE[w.grade].c }} />{st.height}p · {st.fps} fps</span>}
      </div>
      <div className="dc-tile-ctl">
        {hasAudio && (
          <>
            <button type="button" className="dc-icon" aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
            {!t.small && <input className="range" type="range" min={0} max={1} step={0.05} value={vol} aria-label="Volume" style={{ width: 80, ["--p" as string]: vol * 100 + "%" }} onChange={(e) => { setVol(Number(e.target.value)); setMuted(false) }} />}
          </>
        )}
        {!fs.on && <button type="button" className="dc-icon" aria-label={t.focused ? "Voltar à grade" : "Focar"} title={t.focused ? "Voltar à grade" : "Focar"} onClick={t.onFocus}>{t.focused ? <Minimize size={16} /> : <Maximize size={16} />}</button>}
        <button type="button" className="dc-icon" aria-label={fs.on ? "Sair da tela cheia" : "Tela cheia"} title={fs.on ? "Sair da tela cheia (Esc)" : "Tela cheia"} onClick={fs.toggle}>{fs.on ? <Shrink size={16} /> : <Expand size={16} />}</button>
        <button type="button" className="dc-icon" aria-label={"Parar de assistir " + name} onClick={() => unwatchPeer(w.peer)}><X size={16} /></button>
      </div>
    </div>
  )
}

/* ───────────── barra de controles (embaixo, ao centro) ───────────── */
function ControlBar({ onPick, picking }: { onPick: () => void; picking: boolean }) {
  const r = useShare((s) => s.room)
  const now = useNow(1000)
  const [opts, setOpts] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!opts) return
    const out = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".menu")) setOpts(false) }
    addEventListener("pointerdown", out, true)
    return () => removeEventListener("pointerdown", out, true)
  }, [opts])
  const sh = r.share
  const live = sh.phase !== "off"
  const st = sh.stats
  return (
    <div className="dc-bar-wrap">
      {live ? (
        <div className="dc-live-info">
          <span className="dc-live">Ao vivo</span><span className="num">{fmtTime((now.getTime() - sh.startedAt) / 1000)}</span>
          <span className="dc-dim">·</span><span>{sh.phase === "capturing" ? "Capturando…" : sh.source?.name}</span>
          <span className="dc-dim">·</span><span>{sh.viewers.length} assistindo</span>
          {sh.audioMode === "no-discord" && sh.audio && <span className="dc-chip" title="O som da sua call no Discord não vai para quem assiste">{sh.discordExcluded ? "Som sem o Discord" : "Som do PC"}</span>}
          {st && <span className="dc-dim num">{st.width}×{st.height} · {st.fps} fps · {(st.kbps / 1000).toFixed(1)} Mbit/s{st.codec ? " · " + st.codec + (st.hardware ? " (placa)" : "") : ""}</span>}
        </div>
      ) : sh.error ? <div className="dc-live-info" style={{ color: "var(--dc-red)" }}>{sh.error}</div> : null}
      {sh.audioNote && <div className="dc-live-info" style={{ color: "#f0b232" }}>{sh.audioNote}</div>}
      <div className="dc-bar" ref={pop}>
        {live ? (
          <>
            <button type="button" className="dc-round dc-round-on" aria-label="Parar" title="Parar de transmitir" onClick={stopSharing}><MonitorOff size={20} /></button>
            <button type="button" className="dc-round" aria-label="Trocar tela" title="Trocar a tela" onClick={onPick}><Repeat size={19} /></button>
            <button type="button" className={cx("dc-round", opts && "dc-round-active")} aria-label="Qualidade da transmissão" aria-expanded={opts} title="Qualidade e resolução" onClick={() => setOpts(!opts)}><Settings2 size={19} /></button>
          </>
        ) : (
          <button type="button" className="dc-round dc-round-wide" aria-label="Transmitir minha tela" title="Transmitir minha tela" disabled={picking} onClick={onPick}><MonitorUp size={20} /><span>Transmitir</span></button>
        )}
        <button type="button" className="dc-round dc-round-leave" aria-label="Sair da sala" title="Sair da sala" onClick={leaveRoom}><PhoneOff size={20} /></button>
        {opts && live && (
          <div className="dc-pop" role="dialog" aria-label="Qualidade da transmissão">
            <div className="dc-label">Qualidade</div>
            <Segmented label="Qualidade" value={sh.quality} onChange={(q) => void setQuality(q)} options={QUALITIES.map((q) => ({ value: q, label: PROFILES[q].label }))} />
            <div style={{ height: 10 }} />
            <ResolutionPick value={sh.resolution} onChange={(v) => { void patch("share", { resolution: v }); void setResolution(v) }} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────── lista de pessoas e acesso (direita) ───────────── */
function MemberPanel() {
  const r = useShare((s) => s.room)
  const owner = r.me === r.owner
  const watching = useMemo(() => new Set(r.watching.map((w) => w.peer)), [r.watching])
  const viewersOfMe = useMemo(() => new Set(r.share.viewers.map((v) => v.peer)), [r.share.viewers])
  return (
    <aside className="dc-members">
      {owner && r.requests.length > 0 && (
        <div className="dc-section">
          <div className="dc-section-title" style={{ color: "#f0b232" }}>Pedindo para entrar — {r.requests.length}</div>
          {r.requests.map((q) => (
            <div key={q.peer} className="dc-member dc-request">
              <Avatar name={q.name} />
              <span className="grow truncate">{q.name}</span>
              <button type="button" className="dc-btn dc-btn-sm dc-btn-green" onClick={() => admit(q.peer, true)}>Aceitar</button>
              <button type="button" className="dc-btn dc-btn-sm" onClick={() => admit(q.peer, false)}>Recusar</button>
            </div>
          ))}
        </div>
      )}
      <div className="dc-section">
        <div className="dc-section-title">Na sala ({r.members.length})</div>
        {r.members.map((m) => {
          const me = m.peer === r.me
          return (
            <div key={m.peer} className="dc-member" style={{ opacity: m.away ? 0.5 : 1 }}>
              <Avatar name={m.name} live={!!m.live} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 5, minWidth: 0 }}><span className="truncate dc-member-name">{m.name}{me ? " (você)" : ""}</span>{m.owner && <Crown size={12} color="#f0b232" aria-label="cuida da sala" style={{ flex: "none" }} />}</div>
                <div className="dc-member-sub truncate">{m.live && <span className="dc-live dc-live-xs">AO VIVO</span>}{m.away ? "caiu, voltando…" : m.live ? m.live.label : viewersOfMe.has(m.peer) ? "assistindo você" : "na sala"}</div>
              </div>
              {!me && m.live && (watching.has(m.peer)
                ? <button type="button" className="dc-icon" aria-label={"Parar de assistir " + m.name} title="Parar de assistir" onClick={() => unwatchPeer(m.peer)}><EyeOff size={15} /></button>
                : <button type="button" className="dc-btn dc-btn-sm dc-btn-primary" onClick={() => watchPeer(m.peer)}>Assistir</button>)}
              {!me && owner && <button type="button" className="dc-icon dc-kick" title="Remover da sala" aria-label={`Remover ${m.name}`} onClick={() => roomSession()?.kick(m.peer)}><UserX size={15} /></button>}
            </div>
          )
        })}
      </div>
      <AccessCard owner={owner} />
    </aside>
  )
}

function AccessCard({ owner }: { owner: boolean }) {
  const r = useShare((s) => s.room)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState("")
  const [changing, setChanging] = useState(false)
  const [np, setNp] = useState("")
  const [err, setErr] = useState("")
  const copy = (txt: string, what: string) => { void navigator.clipboard.writeText(txt); setCopied(what); setTimeout(() => setCopied(""), 1500) }
  const save = async () => {
    setErr("")
    try { await roomSession()?.setPassword(np); setChanging(false); setNp("") } catch (e: any) { setErr(e?.message || String(e)) }
  }
  return (
    <div className="dc-section dc-access">
      <div className="dc-section-title">Acesso</div>
      <div className="dc-kv"><span className="dc-dim">Sala</span><b className="truncate">{r.roomName}</b><button type="button" className="dc-icon" aria-label="Copiar o nome da sala" onClick={() => copy(r.roomName, "room")}>{copied === "room" ? <Check size={14} /> : <Clipboard size={14} />}</button></div>
      <div className="dc-kv"><span className="dc-dim">Senha</span><b className="truncate num" aria-label="Senha da sala">{r.password ? (show ? r.password : "•".repeat(Math.min(10, r.password.length))) : "—"}</b>
        {r.password && <button type="button" className="dc-icon" aria-label={show ? "Esconder senha" : "Mostrar senha"} onClick={() => setShow(!show)}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
      </div>
      <button type="button" className="dc-btn dc-btn-sm" style={{ width: "100%" }} onClick={() => copy(invite(r.roomName, r.password), "inv")}>{copied === "inv" ? <Check size={13} /> : <UserPlus size={13} />}{copied === "inv" ? "Convite copiado" : "Copiar convite (nome e senha)"}</button>
      {owner && (
        <>
          {changing ? (
            <div className="col" style={{ gap: 6, marginTop: 8 }}>
              <PasswordField value={np} onChange={setNp} label="Nova senha" placeholder="Nova senha" onEnter={() => np.length >= 4 && void save()} />
              {err && <div className="tiny" style={{ color: "var(--dc-red)" }}>{err}</div>}
              <div className="row"><button type="button" className="dc-btn dc-btn-sm dc-btn-primary" disabled={np.length < 4} onClick={() => void save()}>Salvar senha</button><button type="button" className="dc-btn dc-btn-sm" onClick={() => setChanging(false)}>Cancelar</button></div>
              <div className="tiny dc-dim">Quem já está na sala continua; quem for entrar usa a nova.</div>
            </div>
          ) : <button type="button" className="dc-btn dc-btn-sm" style={{ width: "100%", marginTop: 6 }} onClick={() => setChanging(true)}><RefreshCw size={13} />Trocar senha</button>}
          <div className="dc-toggle"><span className="grow">Aprovar quem entra</span><Switch label="Aprovar quem entra" checked={r.approval} onChange={(v) => roomSession()?.setApproval(v)} /></div>
          <div className="dc-toggle"><span className="grow row" style={{ gap: 6 }}>{r.locked ? <><Lock size={12} />Sala trancada</> : <><LockOpen size={12} />Aceitando pedidos</>}</span><Switch label="Trancar sala" checked={r.locked} onChange={(v) => roomSession()?.setLocked(v)} /></div>
          <button type="button" className="dc-btn dc-btn-sm dc-btn-danger" style={{ width: "100%", marginTop: 8 }} title="Fecha a sala para todo mundo" onClick={endRoom}>Encerrar sala</button>
        </>
      )}
    </div>
  )
}

/* ───────────── escolher tela/janela (janela no centro, como no Discord) ───────────── */
function SourcePicker({ title, onPick, onClose, live }: { title: string; onPick: (s: ShareSource, audio: boolean, q: QualityId, r: ResolutionId) => Promise<void>; onClose: () => void; live: boolean }) {
  const prefs = useSection("share")
  const [list, setList] = useState<ShareSource[] | null>(null)
  const [err, setErr] = useState("")
  const [sel, setSel] = useState<ShareSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<"screen" | "window">("screen")
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 150) }
  const load = () => { setErr(""); void invoke<ShareSource[]>("share:sources").then(setList).catch((e) => setErr(String(e?.message || e))) }
  useEffect(load, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close() }; addEventListener("keydown", k); return () => removeEventListener("keydown", k) }, [])
  if (!prefs) return null
  const items = list?.filter((s) => s.kind === tab) ?? []
  const go = async (s: ShareSource | null) => {
    if (!s) return
    setBusy(true); setErr("")
    try { await onPick(s, prefs.audio, prefs.quality, prefs.resolution ?? "auto") } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }
  return (
    <div className={"modal-back" + (closing ? " modal-closing" : "")} onClick={close}>
      <div className="modal dc-picker" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 4 }}>
          <span className="dc-title grow">{title}</span>
          <button type="button" className="dc-icon" aria-label="Atualizar lista" title="Atualizar" onClick={load}><RefreshCw size={15} /></button>
          <button type="button" className="dc-icon" aria-label="Fechar" onClick={close}><X size={16} /></button>
        </div>
        <Tabs label="Tipo de fonte" value={tab} onChange={setTab} tabs={[{ id: "screen", label: "Telas" }, { id: "window", label: "Janelas" }]} />
        {err && <div className="dc-alert dc-alert-bad" style={{ marginBottom: 10 }}>{err}</div>}
        <div className="dc-sources">
          {!list && <div className="dc-muted">Procurando telas…</div>}
          {list && !items.length && <div className="dc-muted">Nada para mostrar aqui.</div>}
          {items.map((s) => (
            <button key={s.id} type="button" className="dc-source" aria-pressed={sel?.id === s.id} onClick={() => { setSel(s); if (live) void go(s) }} onDoubleClick={() => void go(s)}>
              <div className="dc-source-thumb">{s.thumb ? <img src={s.thumb} alt="" /> : s.kind === "screen" ? <Monitor size={24} /> : <AppWindow size={24} />}</div>
              <div className="row small" style={{ gap: 6 }}>{s.icon ? <img src={s.icon} alt="" width={14} height={14} /> : s.kind === "screen" ? <Monitor size={13} /> : <AppWindow size={13} />}<span className="truncate">{s.name}</span></div>
            </button>
          ))}
        </div>
        {!live && (
          <div className="dc-picker-foot">
            <div className="dc-picker-opts">
              <Segmented label="Qualidade" value={prefs.quality} onChange={(v) => void patch("share", { quality: v })} options={QUALITIES.map((q) => ({ value: q, label: PROFILES[q].label }))} />
              <ResolutionPick value={prefs.resolution ?? "auto"} onChange={(v) => void patch("share", { resolution: v })} />
              <label className="row small" style={{ gap: 8 }} title={isElectron && navigator.userAgent.includes("Windows") ? "Envia o som do computador junto com a tela." : "Disponível no Windows."}>
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
            </div>
            <button type="button" className="dc-btn dc-btn-primary" disabled={!sel || busy} onClick={() => void go(sel)}><MonitorUp size={16} />{busy ? "Capturando…" : "Começar a transmitir"}</button>
          </div>
        )}
      </div>
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
