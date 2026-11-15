import { useEffect, useState } from "react"
import { Clipboard, RefreshCw } from "lucide-react"
import { invoke } from "@/shared/bridge"
import { fmtBytes, useFullscreen } from "@/shared/hooks"
import { PageHead, Section } from "@/shared/ui"
import type { AppInfo } from "@/shared/types"
import { ConnectionTest } from "./Share"

interface Metrics { processes: { pid: number; type: string; name: string; cpu: number; mem: number }[]; windows: { notch: number; widgets: number }; media: { running: boolean; subscribers: number; sessions: number; error: string } | null }

const TYPE: Record<string, string> = { Browser: "Principal", GPU: "Placa de vídeo", Tab: "Janela", Utility: "Utilitário", Zygote: "Auxiliar" }

export default function Diagnostics() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [m, setM] = useState<Metrics | null>(null)
  const fs = useFullscreen()
  const load = () => { void invoke("app:info").then(setInfo); void invoke("app:metrics").then(setM) }
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) void invoke("app:metrics").then(setM) }, 3000); return () => clearInterval(t) }, [])
  const text = () => [
    `Aureon Hub ${info?.version} · Electron ${info?.electron} · Chromium ${info?.chrome} · ${info?.platform}`,
    ...(info?.displays ?? []).map((d) => `Monitor ${d.primary ? "(principal) " : ""}${d.bounds.width}x${d.bounds.height} escala ${d.scale}`),
    `Tela cheia: ${fs?.fs ? "sim (" + fs.exe + ")" : "não"} · monitor de tela cheia: ${fs?.helper ?? "?"}`,
    `Mídia: ${m?.media?.running ? "lendo" : "parada"} (${m?.media?.sessions ?? 0} sessões)`,
    ...(m?.processes ?? []).map((p) => `${TYPE[p.type] ?? p.type} ${p.name}: ${p.cpu}% CPU, ${fmtBytes(p.mem)}`),
  ].join("\n")
  const total = m ? m.processes.reduce((a, p) => a + p.mem, 0) : 0
  return (
    <div className="page">
      <PageHead title="Diagnósticos" desc="Números reais deste PC, para entender consumo e resolver problemas."
        actions={<div className="row"><button type="button" className="btn" onClick={load}><RefreshCw size={13} />Atualizar</button><button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(text())}><Clipboard size={13} />Copiar relatório</button></div>} />
      <div className="grid-2">
        <Section title="Aplicativo">
          <div className="small col" style={{ gap: 4 }}>
            <div>Versão <b className="num">{info?.version}</b></div>
            <div className="muted">Electron {info?.electron} · Chromium {info?.chrome} · {info?.platform}</div>
            <div className="muted">Janelas: {m?.windows.notch ?? 0} notch · {m?.windows.widgets ?? 0} camada(s) de widgets</div>
            <div className="muted">Monitor de tela cheia: {fs?.helper ?? "—"}{fs?.fs ? ` · agora: ${fs.exe || "app"} em tela cheia` : ""}</div>
            <div className="muted">Leitor de mídia: {m?.media?.running ? `ativo (${m.media.sessions} sessão/sessões)` : "parado (ninguém usando)"}{m?.media?.error ? " · " + m.media.error : ""}</div>
          </div>
        </Section>
        <Section title="Monitores">
          <div className="col small" style={{ gap: 4 }}>
            {info?.displays.map((d, i) => <div key={d.id} className="row"><span className="grow">{d.primary ? "Principal" : `Monitor ${i + 1}`}</span><span className="num muted">{d.bounds.width}×{d.bounds.height} · {Math.round(d.scale * 100)}%</span></div>)}
          </div>
        </Section>
      </div>
      <Section title="Processos do Aureon" desc={m ? `Total: ${fmtBytes(total)} de memória.` : undefined}>
        <div className="col small" style={{ gap: 2 }}>
          {m?.processes.map((p) => (
            <div key={p.pid} className="row" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="grow">{TYPE[p.type] ?? p.type}{p.name ? " · " + p.name : ""}</span>
              <span className="num muted" style={{ width: 70, textAlign: "right" }}>{p.cpu}%</span>
              <span className="num muted" style={{ width: 80, textAlign: "right" }}>{fmtBytes(p.mem)}</span>
            </div>
          ))}
        </div>
      </Section>
      <ConnectionTest />
    </div>
  )
}
