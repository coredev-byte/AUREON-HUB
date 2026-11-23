import { useEffect, useState } from "react"
import { Activity, Eye, Gamepad2, LayoutGrid, MonitorUp, Music2, Pencil, Radio } from "lucide-react"
import { invoke } from "@/shared/bridge"
import { appLabel, fmtBytes, fmtTime, useFullscreen, useGames, useMedia, useNow, useSharePublic } from "@/shared/hooks"
import { patch, useSection } from "@/shared/state"
import { Switch } from "@/shared/ui"
import { useNav } from "../nav"

interface Metrics { processes: { type: string; cpu: number; mem: number }[]; windows: { notch: number; widgets: number } }

/** consumo real do Aureon (todas as janelas), atualizado a cada 3 s só enquanto esta página está aberta */
function useMetrics() {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => void invoke<Metrics>("app:metrics").then((v) => alive && setM(v)).catch(() => {})
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return m
}

export default function Dashboard() {
  const now = useNow(60000)
  const go = useNav((s) => s.go)
  const ns = useSection("notch"), ws = useSection("widgets"), profiles = useSection("profiles")
  const share = useSharePublic()
  const { session } = useMedia()
  const fs = useFullscreen()
  const { current: game } = useGames()
  const m = useMetrics()
  const tick = useNow(share.active ? 1000 : 0)
  if (!ns || !ws || !profiles) return <div />
  const profile = profiles.items.find((p) => p.id === ws.activeProfile) ?? profiles.items[0]
  const active = profile.widgets.filter((w) => w.enabled).length
  const cpu = m ? m.processes.reduce((a, p) => a + p.cpu, 0) : 0
  const mem = m ? m.processes.reduce((a, p) => a + p.mem, 0) : 0
  const hour = now.getHours()
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"

  return (
    <div className="page">
      <header style={{ marginBottom: 22 }}>
        <div className="cap">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="h1" style={{ marginTop: 4 }}>{hello}</h1>
      </header>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <div className="card stat-card">
          <div className="row"><LayoutGrid size={15} className="muted" /><span className="h3 grow">Widgets</span><Switch label="Widgets" checked={ws.enabled} onChange={(v) => void patch("widgets", { enabled: v })} /></div>
          <div className="k num">{active}</div>
          <div className="small muted">ativos no perfil “{profile.name}”{ws.hideFullscreen ? " · somem em tela cheia" : ""}</div>
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => void patch("widgets", { editMode: true, enabled: true })}><Pencil size={12} />Editar na área de trabalho</button>
        </div>
        <div className="card stat-card">
          <div className="row"><Activity size={15} className="muted" /><span className="h3 grow">Notch</span><Switch label="Notch" checked={ns.enabled} onChange={(v) => void patch("notch", { enabled: v })} /></div>
          <div className="k" style={{ fontSize: 18, marginTop: 6 }}>{!ns.enabled ? "Desligado" : fs?.fs ? "Escondido (tela cheia)" : "No topo da tela"}</div>
          <div className="small muted">{ns.displays === "all" ? "em todos os monitores" : "no monitor principal"} · atalho <span className="kbd">Ctrl+Alt+Espaço</span></div>
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => go("notch")}>Personalizar</button>
        </div>
        <div className="card stat-card">
          <div className="row"><MonitorUp size={15} className="muted" /><span className="h3 grow">Transmissão</span>{share.active && share.role === "host" && <span className="badge badge-live"><span className="dot" />AO VIVO</span>}</div>
          {share.active && share.role === "host" ? (
            <>
              <div className="k num">{fmtTime(((tick.getTime()) - (share.startedAt ?? Date.now())) / 1000)}</div>
              <div className="small muted row" style={{ gap: 6 }}><Eye size={13} />{share.viewers ?? 0} assistindo · {share.source}</div>
            </>
          ) : share.active ? (
            <><div className="k" style={{ fontSize: 18, marginTop: 6 }}>Na sala {share.code}</div><div className="small muted">{share.members ?? 1} pessoa(s) · {share.hostName ? "assistindo " + share.hostName : `${share.live ?? 0} transmitindo`}</div></>
          ) : (
            <><div className="k" style={{ fontSize: 18, marginTop: 6 }}>Nenhuma ativa</div><div className="small muted">Sala com nome e senha: várias pessoas podem transmitir.</div></>
          )}
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => go("share")}>{share.active ? "Abrir sala" : "Criar ou entrar"}</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 12 }}><Music2 size={15} className="muted" /><span className="h3">Tocando agora</span></div>
          {session ? (
            <div className="row" style={{ gap: 14 }}>
              {session.art ? <img src={session.art} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} /> : <div className="inset" style={{ width: 56, height: 56, display: "grid", placeItems: "center" }}><Music2 size={18} /></div>}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontWeight: 600 }}>{session.title}</div>
                <div className="truncate small muted">{session.artist} · {appLabel(session.app)}</div>
              </div>
              <span className={"badge " + (session.playing ? "badge-ok" : "")}>{session.playing ? "tocando" : "pausado"}</span>
            </div>
          ) : <div className="small muted">Nenhum player ativo. Spotify, YouTube Music e players do navegador aparecem aqui pelos controles de mídia do Windows.</div>}
        </div>
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 12 }}><Gamepad2 size={15} className="muted" /><span className="h3">Desempenho</span></div>
          <div className="row" style={{ gap: 28 }}>
            <div><div className="num" style={{ fontSize: 22 }}>{m ? cpu.toFixed(1) + "%" : "—"}</div><div className="tiny muted">CPU do Aureon</div></div>
            <div><div className="num" style={{ fontSize: 22 }}>{m ? fmtBytes(mem) : "—"}</div><div className="tiny muted">memória do Aureon</div></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 500 }}>{game ? (game.known ? game.name : "App em tela cheia") : "Nenhum jogo"}</div>
              <div className="tiny muted">{game ? "widgets daquele monitor pausados" : "widgets e notch somem em tela cheia"}</div>
            </div>
          </div>
          {m && <div className="tiny dim" style={{ marginTop: 10 }}>{m.processes.length} processos · {m.windows.notch} notch · {m.windows.widgets} camada(s) de widgets</div>}
        </div>
      </div>
      {share.active && !!share.requests && (
        <div className="callout callout-warn" style={{ marginTop: 14 }}><Radio size={16} />{share.requests} pessoa(s) pedindo para entrar na sala. <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("share")}>Responder</button></div>
      )}
    </div>
  )
}
