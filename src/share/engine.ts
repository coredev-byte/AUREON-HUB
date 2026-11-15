// Orquestra a transmissão dentro da janela principal (que só é escondida, nunca destruída, ao fechar):
// uma sessão de transmissão e/ou uma de espectador, o estado para a interface, o resumo público para o
// notch/bandeja e os comandos vindos de fora (encerrar, aceitar, recusar).
import { create } from "zustand"
import { invoke, on } from "@/shared/bridge"
import { setSharePublicLocal } from "@/shared/hooks"
import { getSection } from "@/shared/state"
import type { SharePublic } from "@/shared/types"
import { HostSession, idleHost, type HostState, type StartOpts } from "./host"
import { PROFILES, type QualityId } from "./quality"
import { ViewerSession, idleViewer, type ViewerState } from "./viewer"

interface ShareStore { host: HostState; viewer: ViewerState; grade: "good" | "fair" | "poor" }
export const useShare = create<ShareStore>(() => ({ host: idleHost(), viewer: idleViewer(), grade: "good" }))

let host: HostSession | null = null
let viewer: ViewerSession | null = null
const notify = (n: Record<string, unknown>) => void invoke("notify:push", n).catch(() => {})

/** resumo para o notch e a bandeja (sem fluxo de vídeo, só números e textos) */
function publish() {
  const { host: h, viewer: v, grade } = useShare.getState()
  let pub: SharePublic = { active: false }
  if (h.phase === "live" || h.phase === "source-lost" || h.phase === "connecting") {
    pub = {
      active: true, role: "host", phase: h.phase, source: h.source?.name ?? "", startedAt: h.startedAt || Date.now(), viewers: h.viewers.length,
      requests: h.requests.length, code: h.code, quality: PROFILES[h.quality].label, audio: h.audio,
      connection: h.signal === "reconnecting" ? "reconnecting" : h.signal === "offline" ? "offline" : grade,
    }
  } else if (v.phase !== "idle" && v.phase !== "ended" && v.phase !== "error") {
    pub = { active: true, role: "viewer", phase: v.phase, hostName: v.hostName, connection: v.signal !== "online" ? "reconnecting" : v.grade }
  }
  const key = JSON.stringify(pub)
  if (key === lastPub) return
  lastPub = key
  setSharePublicLocal(pub)
  void invoke("share:publish", pub).catch(() => {})
}
let lastPub = ""

export function signalUrl(): string {
  return getSection("settings")?.signalUrl?.trim() || import.meta.env.VITE_AUREON_SIGNAL_URL || ""
}

export async function startHosting(o: Omit<StartOpts, "signalUrl" | "name" | "preferHardware" | "approval"> & { approval?: boolean }) {
  if (host && host.state.phase !== "idle" && host.state.phase !== "error") throw new Error("Já existe uma transmissão ativa.")
  const url = signalUrl()
  if (!url) throw new Error("Configure o servidor de transmissão em Configurações › Transmissão.")
  const prefs = getSection("share")
  host = new HostSession(
    (s) => { useShare.setState({ host: s }); publish() },
    (e) => {
      if (e.type === "request") notify({ kind: "request", title: `${e.name} quer assistir`, body: "Aceite só quem você conhece.", actions: [{ id: "accept", label: "Aceitar" }, { id: "deny", label: "Recusar" }], target: "main", ref: e.peer, sticky: true })
      else if (e.type === "joined") notify({ kind: "share", title: `${e.name} está assistindo` })
      else if (e.type === "left") notify({ kind: "share", title: `${e.name} saiu da transmissão` })
      else if (e.type === "source-lost") notify({ kind: "alert", title: "A fonte da transmissão fechou", body: "Escolha outra tela ou janela, ou encerre." })
      else if (e.type === "alert" && e.code === "brute") notify({ kind: "alert", title: "Muitas tentativas com código errado", body: "A sala foi trancada. Gere um novo convite se quiser liberar." })
      else if (e.type === "signal-lost") notify({ kind: "alert", title: "Sem servidor de transmissão", body: "Quem já assiste continua; novos espectadores não conseguem entrar." })
      else if (e.type === "ended") notify({ kind: "share", title: "Transmissão encerrada" })
      else if (e.type === "grade") { if (useShare.getState().grade !== e.grade) { useShare.setState({ grade: e.grade }); publish() } }
    },
  )
  await host.start({ ...o, signalUrl: url, name: prefs?.name || "", preferHardware: prefs?.preferHardware ?? true, approval: o.approval ?? prefs?.approval ?? true })
  notify({ kind: "share", title: "Transmissão no ar", body: `${o.sourceName} · convite ${host.state.code}` })
}

export function stopHosting() {
  if (!host) return
  host.stop()
  useShare.setState({ host: idleHost() })
  publish()
}
export const hostSession = () => host
export async function switchSource(id: string, name: string, kind: string) { await host?.switchSource(id, name, kind) }
export async function setQuality(q: QualityId) { await host?.setQuality(q) }
export function admit(peer: string, ok: boolean) { host?.admit(peer, ok); void invoke("notify:list").then((l: any[]) => { for (const n of l) if (n.ref === peer) void invoke("notify:dismiss", n.id) }) }

export async function watch(code: string, name: string) {
  const url = signalUrl()
  if (!url) throw new Error("Configure o servidor de transmissão em Configurações › Transmissão.")
  viewer?.leave()
  viewer = new ViewerSession((s) => { useShare.setState({ viewer: s }); publish() })
  await viewer.join(url, code, name)
}
export function leaveWatching() { viewer?.leave(); viewer = null; useShare.setState({ viewer: idleViewer() }); publish() }

// comandos vindos do notch, da bandeja ou dos avisos
on("share:command", ({ cmd, args }: { cmd: string; args: string[] }) => {
  if (cmd === "stop") stopHosting()
  else if (cmd === "admit") admit(args[0], true)
  else if (cmd === "deny") admit(args[0], false)
  else if (cmd === "kick") host?.kick(args[0])
  else if (cmd === "leave") leaveWatching()
})
// a página foi recarregada/fechada: nada de transmissão fantasma
window.addEventListener("beforeunload", () => { host?.stop(); viewer?.leave() })
