import { useEffect, useRef, useState } from "react"
import {
  AppWindow, Check, Clipboard, Eye, Lock, LockOpen, LogOut, Maximize, Monitor, MonitorUp, RefreshCw, Repeat, ShieldCheck, Square, Stethoscope,
  UserX, Volume2, VolumeX, X,
} from "lucide-react"
import { invoke, isElectron } from "@/shared/bridge"
import { fmtTime, useNow } from "@/shared/hooks"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Segmented, Setting, Switch, Empty, cx } from "@/shared/ui"
import type { ShareSource } from "@/shared/types"
import { admit, hostSession, leaveWatching, setQuality, signalUrl, startHosting, stopHosting, switchSource, useShare, watch } from "@/share/engine"
import { PROFILES, type QualityId } from "@/share/quality"
import { diagnose, report, type DiagResult } from "@/share/diag"
import { useNav } from "../nav"

type Tab = "host" | "watch" | "server"

export default function Share() {
  const params = useNav((s) => s.params)
  const [tab, setTab] = useState<Tab>(params.join || params.tab === "watch" ? "watch" : params.tab === "server" ? "server" : "host")
  useEffect(() => { if (params.join || params.tab === "watch") setTab("watch"); else if (params.tab === "server") setTab("server"); else if (params.pick) setTab("host") }, [params])
  const configured = !!signalUrl()
  return (
    <div className="page">
      <PageHead title="Transmissão de tela" desc="Sala privada com convite: sua tela vai criptografada direto para quem você aprovar, em qualquer rede." />
      <div className="tabs-line" role="tablist">
        {([["host", "Transmitir"], ["watch", "Assistir"], ["server", "Servidor e conexão"]] as [Tab, string][]).map(([id, l]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {!configured && tab !== "server" && (
        <div className="callout callout-warn" style={{ marginBottom: 14 }}>
          <span className="grow">A transmissão precisa de um servidor de sinalização (o seu, gratuito em Render/Fly.io). Configure o endereço para começar.</span>
          <button type="button" className="btn btn-sm" onClick={() => setTab("server")}>Configurar</button>
        </div>
      )}
      {tab === "host" && <HostPanel pickNow={!!params.pick} />}
      {tab === "watch" && <ViewerPanel code={typeof params.join === "string" ? params.join : ""} />}
      {tab === "server" && <ServerPanel />}
    </div>
  )
}

/* ───────────── escolher tela/janela ───────────── */
function SourcePicker({ value, onPick }: { value: string; onPick: (s: ShareSource) => void }) {
  const [list, setList] = useState<ShareSource[] | null>(null)
  const [err, setErr] = useState("")
  const load = () => { setErr(""); void invoke<ShareSource[]>("share:sources").then(setList).catch((e) => setErr(String(e?.message || e))) }
  useEffect(load, [])
  const screens = list?.filter((s) => s.kind === "screen") ?? [], windows = list?.filter((s) => s.kind === "window") ?? []
  const card = (s: ShareSource) => (
    <button key={s.id} type="button" onClick={() => onPick(s)} aria-pressed={value === s.id}
      className={cx("card")} style={{ padding: 8, textAlign: "left", borderColor: value === s.id ? "var(--accent)" : undefined, boxShadow: value === s.id ? "0 0 0 1px var(--accent)" : undefined }}>
      <div className="inset" style={{ aspectRatio: "16 / 9", overflow: "hidden", display: "grid", placeItems: "center", marginBottom: 8 }}>
        {s.thumb ? <img src={s.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : s.kind === "screen" ? <Monitor size={22} className="dim" /> : <AppWindow size={22} className="dim" />}
      </div>
      <div className="row small" style={{ gap: 6 }}>{s.icon ? <img src={s.icon} alt="" width={14} height={14} /> : s.kind === "screen" ? <Monitor size={13} /> : <AppWindow size={13} />}<span className="truncate">{s.name}</span></div>
    </button>
  )
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}><span className="h3 grow">Telas</span><button type="button" className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={12} />Atualizar</button></div>
      {err && <div className="callout callout-bad">{err}</div>}
      <div className="grid-3" style={{ gap: 10, marginBottom: 14 }}>{screens.map(card)}</div>
      {windows.length > 0 && <><div className="h3" style={{ marginBottom: 8 }}>Janelas</div><div className="grid-3 scroll" style={{ gap: 10, maxHeight: 360 }}>{windows.map(card)}</div></>}
    </div>
  )
}

/* ───────────── transmitir ───────────── */
function HostPanel({ pickNow }: { pickNow: boolean }) {
  const h = useShare((s) => s.host)
  const prefs = useSection("share")
  const [src, setSrc] = useState<ShareSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [picking, setPicking] = useState(false)
  useEffect(() => { if (pickNow && (h.phase === "live" || h.phase === "source-lost")) setPicking(true) }, [pickNow])
  if (!prefs) return null
  const live = h.phase === "live" || h.phase === "source-lost"

  const start = async () => {
    if (!src) return
    setBusy(true); setErr("")
    try { await startHosting({ sourceId: src.id, sourceName: src.name, sourceKind: src.kind, audio: prefs.audio, quality: prefs.quality }) }
    catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  if (live) {
    return (
      <>
        {(picking || h.phase === "source-lost") && (
          <Section title={h.phase === "source-lost" ? "A fonte fechou: escolha outra" : "Trocar a fonte"} desc="Quem está assistindo continua conectado." actions={h.phase !== "source-lost" && <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setPicking(false)}><X size={15} /></button>}>
            <SourcePicker value={h.source?.id ?? ""} onPick={async (s) => { try { await switchSource(s.id, s.name, s.kind); setPicking(false) } catch (e: any) { setErr(e?.message || String(e)) } }} />
          </Section>
        )}
        <LiveHost onPick={() => setPicking(true)} />
        {err && <div className="callout callout-bad" style={{ marginTop: 10 }}>{err}</div>}
      </>
    )
  }

  return (
    <>
      <Section title="1. O que transmitir"><SourcePicker value={src?.id ?? ""} onPick={setSrc} /></Section>
      <Section title="2. Qualidade e som">
        <Setting title="Qualidade" desc={PROFILES[prefs.quality].desc + (prefs.quality === "auto" ? " — ajusta resolução, taxa e quadros conforme a rede e o processador." : ". Ainda reduz sozinho se a rede apertar.")}>
          <Segmented label="Qualidade" value={prefs.quality} onChange={(v) => void patch("share", { quality: v })} options={(["auto", "eco", "balanced", "quality"] as QualityId[]).map((q) => ({ value: q, label: PROFILES[q].label }))} />
        </Setting>
        <Setting title="Som do PC" desc={isElectron && navigator.userAgent.includes("Windows") ? "Envia todo o som do computador (o Windows não separa o som de uma janela só)." : "Disponível no Windows."}>
          <Switch label="Som do PC" checked={prefs.audio} onChange={(v) => void patch("share", { audio: v })} />
        </Setting>
        <Setting title="Aprovar quem entra" desc="Recomendado: cada pessoa com o convite pede para entrar e você aceita."><Switch label="Aprovar quem entra" checked={prefs.approval} onChange={(v) => void patch("share", { approval: v })} /></Setting>
        <Setting title="Preferir codificação pela placa de vídeo" desc="Usa H.264 (NVENC, Quick Sync, AMF) quando existir; menos uso de processador."><Switch label="Preferir placa de vídeo" checked={prefs.preferHardware} onChange={(v) => void patch("share", { preferHardware: v })} /></Setting>
        <Setting title="Seu nome na sala"><input className="field" style={{ width: 200 }} value={prefs.name} maxLength={40} placeholder="Como aparece para quem assiste" onChange={(e) => void patch("share", { name: e.target.value })} aria-label="Seu nome na sala" /></Setting>
      </Section>
      {(err || h.phase === "error") && <div className="callout callout-bad" style={{ marginBottom: 14 }}>{err || h.error}</div>}
      <div className="card card-pad row" style={{ gap: 14 }}>
        <ShieldCheck size={20} className="muted" />
        <div className="grow small muted">Ao iniciar, {src ? <b style={{ color: "var(--fg)" }}>{src.name}</b> : "a fonte escolhida"} começa a ser enviada para quem você aprovar. Nada é gravado e ninguém controla seu PC. Você encerra quando quiser (aqui, no notch ou na bandeja).</div>
        <button type="button" className="btn btn-primary btn-lg" disabled={!src || busy || !signalUrl()} onClick={() => void start()}><MonitorUp size={15} />{busy ? (h.phase === "capturing" ? "Capturando…" : "Criando sala…") : "Iniciar transmissão"}</button>
      </div>
    </>
  )
}

function LiveHost({ onPick }: { onPick: () => void }) {
  const h = useShare((s) => s.host)
  const now = useNow(1000)
  const video = useRef<HTMLVideoElement>(null)
  const [copied, setCopied] = useState("")
  useEffect(() => { const s = hostSession()?.localStream; if (video.current && s) video.current.srcObject = s }, [h.source?.id, h.phase])
  const copy = (txt: string, what: string) => { void navigator.clipboard.writeText(txt); setCopied(what); setTimeout(() => setCopied(""), 1500) }
  const st = h.stats
  return (
    <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)", gap: 14 }}>
      <div className="col" style={{ gap: 14 }}>
        <div className="card" style={{ overflow: "hidden", position: "relative" }}>
          <video ref={video} autoPlay muted playsInline style={{ width: "100%", aspectRatio: "16 / 9", background: "#000", display: "block" }} aria-label="Pré-visualização local" />
          <div className="row" style={{ position: "absolute", top: 10, left: 10, gap: 6 }}>
            <span className="badge badge-live"><span className="dot" />AO VIVO</span>
            <span className="badge" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>{fmtTime((now.getTime() - h.startedAt) / 1000)}</span>
          </div>
          <div className="tiny" style={{ position: "absolute", bottom: 8, right: 10, color: "rgba(255,255,255,.7)" }}>pré-visualização local</div>
        </div>
        <div className="card card-pad row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="grow" style={{ minWidth: 0 }}><div className="tiny muted">Transmitindo</div><div className="truncate" style={{ fontWeight: 500 }}>{h.source?.name}</div></div>
          <button type="button" className="btn" onClick={onPick}><Repeat size={13} />Trocar fonte</button>
          <Segmented label="Qualidade" value={h.quality} onChange={(q) => void setQuality(q)} options={(["auto", "eco", "balanced", "quality"] as QualityId[]).map((q) => ({ value: q, label: PROFILES[q].label }))} />
          <button type="button" className="btn btn-danger" onClick={stopHosting}><Square size={12} />Encerrar</button>
        </div>
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 8 }}>Envio</div>
          <div className="row small" style={{ gap: 22, flexWrap: "wrap" }}>
            <Stat k={st ? `${st.width}×${st.height}` : "—"} l="resolução enviada" />
            <Stat k={st ? String(st.fps) : "—"} l="quadros/s" />
            <Stat k={st ? (st.kbps / 1000).toFixed(1) + " Mbit/s" : "—"} l="taxa" />
            <Stat k={st?.rttMs != null ? st.rttMs + " ms" : "—"} l="ida e volta" />
            <Stat k={st?.codec ? st.codec + (st.hardware ? " · placa" : " · CPU") : "—"} l="codificação" />
            <Stat k={st?.limit && st.limit !== "none" ? (st.limit === "bandwidth" ? "rede" : st.limit === "cpu" ? "processador" : st.limit) : "nada"} l="limitando" />
          </div>
          {!st && <div className="tiny muted" style={{ marginTop: 8 }}>Os números aparecem quando alguém estiver assistindo.</div>}
          {h.signal !== "online" && <div className="callout callout-warn" style={{ marginTop: 10 }}>{h.signal === "reconnecting" ? "Reconectando ao servidor… quem já assiste continua vendo." : "Sem servidor: quem já assiste continua, mas ninguém novo consegue entrar."}</div>}
        </div>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <div className="card card-pad">
          <div className="tiny muted">Convite</div>
          <div className="num" style={{ fontSize: 22, letterSpacing: "0.1em", margin: "4px 0 10px" }}>{h.code}</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm" onClick={() => copy(h.code, "code")}>{copied === "code" ? <Check size={12} /> : <Clipboard size={12} />}Copiar código</button>
            <button type="button" className="btn btn-sm" onClick={() => copy("aureon://join/" + h.code, "link")}>{copied === "link" ? <Check size={12} /> : <Clipboard size={12} />}Copiar link</button>
            <button type="button" className="btn btn-ghost btn-sm" title="Gera um código novo; o antigo deixa de valer" onClick={() => hostSession()?.rotateCode()}><RefreshCw size={12} />Novo código</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>Vale até {new Date(h.codeExpires).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} para novas entradas. Envie só para quem você conhece.</div>
          <hr className="divider" style={{ margin: "12px 0" }} />
          <div className="row small"><span className="grow">Aprovar quem entra</span><Switch label="Aprovar quem entra" checked={h.approval} onChange={(v) => hostSession()?.setApproval(v)} /></div>
          <div className="row small" style={{ marginTop: 8 }}><span className="grow">{h.locked ? <><Lock size={12} /> Sala trancada</> : <><LockOpen size={12} /> Aceitando pedidos</>}</span><Switch label="Trancar sala" checked={h.locked} onChange={(v) => hostSession()?.setLocked(v)} /></div>
        </div>
        {h.requests.length > 0 && (
          <div className="card card-pad" style={{ borderColor: "color-mix(in srgb, var(--warn) 35%, transparent)" }}>
            <div className="h3" style={{ marginBottom: 6 }}>Pedindo para assistir</div>
            {h.requests.map((r) => (
              <div key={r.peer} className="row" style={{ padding: "6px 0" }}>
                <span className="grow truncate">{r.name}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => admit(r.peer, true)}>Aceitar</button>
                <button type="button" className="btn btn-sm" onClick={() => admit(r.peer, false)}>Recusar</button>
              </div>
            ))}
          </div>
        )}
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 6 }}><Eye size={14} className="muted" /><span className="h3 grow">Assistindo ({h.viewers.length})</span></div>
          {!h.viewers.length && <div className="small muted">Ninguém ainda.</div>}
          {h.viewers.map((v) => (
            <div key={v.peer} className="row" style={{ padding: "6px 0" }}>
              <span className="dot" style={{ color: v.state === "connected" ? (v.grade === "poor" ? "var(--warn)" : "var(--ok)") : "var(--dim)" }} />
              <span className="grow truncate">{v.name}</span>
              <span className="tiny muted">{v.state === "connected" ? (v.stats?.rttMs != null ? v.stats.rttMs + " ms" : "conectado") : v.state === "failed" ? "reconectando" : "conectando"}</span>
              <button type="button" className="icon-btn" title="Remover da transmissão" aria-label={`Remover ${v.name}`} onClick={() => hostSession()?.kick(v.peer)}><UserX size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const Stat = ({ k, l }: { k: string; l: string }) => <div><div className="num" style={{ fontSize: 15 }}>{k}</div><div className="tiny muted">{l}</div></div>

/* ───────────── assistir ───────────── */
function ViewerPanel({ code: initial }: { code: string }) {
  const v = useShare((s) => s.viewer)
  const prefs = useSection("share")
  const [code, setCode] = useState(initial)
  const [name, setName] = useState(prefs?.name || "")
  useEffect(() => { if (initial) setCode(initial) }, [initial])
  const active = v.phase !== "idle" && v.phase !== "error" && v.phase !== "ended"
  if (active && (v.phase === "watching" || v.phase === "host-away" || v.phase === "joining")) return <Player />
  if (active) {
    return (
      <div className="card card-pad col" style={{ alignItems: "center", textAlign: "center", padding: 40, gap: 10 }}>
        <div className="h2">{v.phase === "waiting" ? "Esperando aprovação" : "Conectando…"}</div>
        <div className="small muted">{v.phase === "waiting" ? "Quem transmite precisa aceitar sua entrada." : "Falando com o servidor de transmissão."}</div>
        <button type="button" className="btn" onClick={leaveWatching}>Cancelar</button>
      </div>
    )
  }
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, "")
  return (
    <Section title="Entrar numa transmissão" desc="Cole o código do convite (ou abra o link aureon://join/… que recebeu).">
      {(v.phase === "error" || v.phase === "ended") && <div className={"callout " + (v.phase === "error" ? "callout-bad" : "")} style={{ marginBottom: 12 }}>{v.error}</div>}
      <div className="row" style={{ gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
        <input className="field code-field" style={{ width: 300 }} placeholder="XXXX-XXXX-XXXX-XXXX" value={code} maxLength={24} aria-label="Código do convite" onChange={(e) => setCode(e.target.value)} />
        <input className="field" style={{ width: 200, height: 40 }} placeholder="Seu nome" value={name} maxLength={40} aria-label="Seu nome" onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn btn-primary btn-lg" style={{ height: 40 }} disabled={clean.length !== 16 || !signalUrl()} onClick={() => void watch(code, name.trim() || "Convidado")}>Entrar</button>
      </div>
    </Section>
  )
}

function Player() {
  const v = useShare((s) => s.viewer)
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  useEffect(() => { if (ref.current && v.stream && ref.current.srcObject !== v.stream) ref.current.srcObject = v.stream }, [v.stream])
  useEffect(() => { if (ref.current) { ref.current.volume = vol; ref.current.muted = muted } }, [vol, muted])
  const hasAudio = !!v.stream?.getAudioTracks().length
  const st = v.stats
  return (
    <div className="col" style={{ gap: 12 }}>
      <div ref={box} className="card" style={{ overflow: "hidden", position: "relative", background: "#000" }}>
        <video ref={ref} autoPlay playsInline style={{ width: "100%", aspectRatio: "16 / 9", display: "block", background: "#000" }} aria-label="Transmissão recebida" onDoubleClick={() => void box.current?.requestFullscreen()} />
        {v.phase !== "watching" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#ccc" }} className="small">{v.phase === "host-away" ? "Quem transmite caiu; esperando voltar…" : "Recebendo vídeo…"}</div>}
        {v.signal !== "online" && <div className="badge badge-warn" style={{ position: "absolute", top: 10, left: 10 }}>reconectando</div>}
      </div>
      <div className="card card-pad row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="grow" style={{ minWidth: 0 }}><div className="tiny muted">Assistindo</div><div style={{ fontWeight: 500 }}>{v.hostName || "Transmissão"}</div></div>
        <span className="tiny muted num">{st ? `${st.width}×${st.height} · ${st.fps} fps · ${(st.kbps / 1000).toFixed(1)} Mbit/s${st.rttMs != null ? " · " + st.rttMs + " ms" : ""}` : ""}</span>
        {hasAudio ? (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="icon-btn" aria-label={muted ? "Ativar som" : "Silenciar"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
            <input className="range" type="range" min={0} max={1} step={0.05} value={vol} aria-label="Volume" style={{ width: 100 }} onChange={(e) => { setVol(Number(e.target.value)); setMuted(false) }} />
          </div>
        ) : <span className="tiny dim">sem som</span>}
        <button type="button" className="btn" onClick={() => void box.current?.requestFullscreen()}><Maximize size={13} />Tela cheia</button>
        <button type="button" className="btn btn-danger" onClick={leaveWatching}><LogOut size={13} />Sair</button>
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
        <div className="small muted" style={{ marginTop: 10 }}>Quem transmite e quem assiste precisam usar o mesmo servidor. Como publicar o seu (Render, Fly.io ou VPS) e o TURN para redes fechadas: <b>docs/servidor-transmissao.md</b>.</div>
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
