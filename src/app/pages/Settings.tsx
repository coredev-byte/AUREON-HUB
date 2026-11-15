import { useState } from "react"
import { MapPin, Search } from "lucide-react"
import { invoke } from "@/shared/bridge"
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
