import { useEffect, useState } from "react"
import { Download, MapPin, RefreshCw, RotateCw, Search } from "lucide-react"
import { invoke, on } from "@/shared/bridge"
import { useSharePublic } from "@/shared/hooks"
import type { UpdateState } from "@/shared/types"
import { patch, useSection } from "@/shared/state"
import { PageHead, Section, Setting, Switch } from "@/shared/ui"
import type { City } from "@/shared/types"
import { useNav } from "../nav"

export default function Settings() {
  const s = useSection("settings")
  const go = useNav((x) => x.go)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<City[] | null>(null)
  const [err, setErr] = useState("")
  if (!s) return <div />
  const search = async () => {
    setErr("")
    try { const r = await invoke<City[]>("weather:search", q); setRes(r); if (!r.length) setErr("Nenhuma cidade encontrada.") } catch { setErr("Sem conexão com o serviço de clima.") }
  }
  return (
    <div className="page">
      <PageHead title="Configurações" />
      <Updates />
      <Section title="Geral">
        <Setting title="Iniciar com o Windows" desc="Abre escondido na bandeja; notch e widgets aparecem sozinhos."><Switch label="Iniciar com o Windows" checked={s.launchAtLogin} onChange={(v) => void patch("settings", { launchAtLogin: v })} /></Setting>
      </Section>
      <Section title="Clima" desc="Dados da Open-Meteo (sem conta). Só a cidade escolhida é consultada.">
        <Setting title="Cidade" desc={s.city ? s.city.name : "Nenhuma escolhida"}>
          <div className="row">
            <input className="field" style={{ width: 200 }} placeholder="Buscar cidade" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} aria-label="Buscar cidade" />
            <button type="button" className="btn" onClick={() => void search()} disabled={q.trim().length < 2}><Search size={13} />Buscar</button>
          </div>
        </Setting>
        {err && <div className="small muted">{err}</div>}
        {res && res.length > 0 && (
          <div className="col" style={{ gap: 2, marginTop: 6 }}>
            {res.map((c) => (
              <button key={c.lat + "," + c.lon} type="button" className="list-row" style={{ border: 0, background: "transparent", textAlign: "left" }} onClick={() => { void patch("settings", { city: c }); setRes(null); setQ("") }}>
                <MapPin size={14} className="muted" /><span className="grow">{c.name}</span><span className="tiny dim num">{c.lat.toFixed(2)}, {c.lon.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title="Transmissão">
        <Setting title="Servidor de transmissão" desc={s.signalUrl || "Não configurado"}><button type="button" className="btn" onClick={() => go("share", { tab: "server" })}>Configurar</button></Setting>
      </Section>
      <Section title="Privacidade e segurança">
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>O Aureon não altera a barra de tarefas, o Explorer, os atalhos nem o papel de parede do Windows.</li>
          <li>Nenhuma transmissão começa sem você escolher a tela e clicar em iniciar. Não há gravação nem controle remoto.</li>
          <li>Quem entra numa transmissão precisa do convite e, por padrão, da sua aprovação.</li>
          <li>Vídeo e áudio vão criptografados direto entre os PCs (ou pelo seu servidor TURN); o servidor de sinalização só troca as mensagens de conexão.</li>
          <li>Os avisos do notch são só os do próprio Aureon: ele não lê notificações de outros aplicativos.</li>
        </ul>
      </Section>
      <Section title="Encerrar">
        <Setting title="Sair do Aureon Hub" desc="Fecha notch, widgets e qualquer transmissão."><button type="button" className="btn btn-danger" onClick={() => void invoke("app:quit")}>Sair</button></Setting>
      </Section>
    </div>
  )
}

/** Atualizar pelo próprio app: procura, baixa e instala por cima (sem desinstalar). */
function Updates() {
  const s = useSection("settings")
  const share = useSharePublic()
  const [u, setU] = useState<UpdateState | null>(null)
  useEffect(() => { void invoke<UpdateState>("update:get").then(setU); return on("update:state", setU) }, [])
  if (!s || !u) return null
  const busy = u.status === "checking" || u.status === "downloading"
  const live = share.active && share.role === "host"
  const install = () => {
    if (live && !confirm("Você está transmitindo. Atualizar agora encerra a transmissão. Continuar?")) return
    void invoke("update:install")
  }
  const when = u.checkedAt ? new Date(u.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""
  return (
    <Section title="Atualizações" desc={`Versão instalada: ${u.current}. As novas versões vêm do GitHub e instalam por cima, sem desinstalar e sem perder suas configurações.`}>
      {!u.supported ? (
        <div className="callout">{u.reason}</div>
      ) : (
        <>
          <div className="row" style={{ gap: 12, padding: "4px 0 10px", flexWrap: "wrap" }}>
            <div className="grow" style={{ minWidth: 220 }}>
              {u.status === "idle" && <span className="muted">Ainda não procurou nesta sessão.</span>}
              {u.status === "checking" && <span className="muted">Procurando…</span>}
              {u.status === "none" && <span>Você está na versão mais nova.{when && <span className="muted"> Conferido às {when}.</span>}</span>}
              {u.status === "available" && <span><b>Versão {u.version} disponível.</b></span>}
              {u.status === "downloading" && (
                <div className="col" style={{ gap: 6 }}>
                  <span>Baixando a versão {u.version}… <span className="num">{u.percent}%</span></span>
                  <div className="wg-bar" style={{ height: 5, borderRadius: 3, background: "var(--s3)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: u.percent + "%", background: "var(--accent)" }} /></div>
                </div>
              )}
              {u.status === "ready" && <span><b>Versão {u.version} pronta para instalar.</b> <span className="muted">Ou ela entra sozinha quando você sair do app.</span></span>}
              {u.status === "error" && <span style={{ color: "var(--bad)" }}>{u.error}</span>}
            </div>
            {(u.status === "available" || (u.status === "error" && u.version)) && <button type="button" className="btn btn-primary" onClick={() => void invoke("update:download")}><Download size={13} />Baixar</button>}
            {u.status === "ready" && <button type="button" className="btn btn-primary" onClick={install}><RotateCw size={13} />Reiniciar e atualizar</button>}
            <button type="button" className="btn" disabled={busy} onClick={() => void invoke("update:check")}><RefreshCw size={13} />Procurar agora</button>
          </div>
          {u.notes && (u.status === "available" || u.status === "ready") && <div className="small muted" style={{ whiteSpace: "pre-line", marginBottom: 8 }}>{u.notes}</div>}
        </>
      )}
      <Setting title="Procurar sozinho" desc="Ao abrir o app e a cada 4 horas."><Switch label="Procurar sozinho" checked={s.autoCheck} onChange={(v) => void patch("settings", { autoCheck: v })} /></Setting>
      <Setting title="Baixar sozinho" desc="Instalar continua sendo um clique seu (ou acontece ao sair do app)."><Switch label="Baixar sozinho" checked={s.autoUpdate} onChange={(v) => void patch("settings", { autoUpdate: v })} /></Setting>
    </Section>
  )
}
