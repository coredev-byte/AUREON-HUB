// Orquestra a sala de transmissão dentro da janela principal (que só é escondida, nunca destruída, ao fechar):
// o estado para a interface, o resumo público para o notch/bandeja e os comandos vindos de fora
// (parar de transmitir, sair, aceitar, recusar, assistir).
import { create } from "zustand"
import { invoke, on } from "@/shared/bridge"
import { setSharePublicLocal } from "@/shared/hooks"
import { getSection } from "@/shared/state"
import type { SharePublic } from "@/shared/types"
import { PROFILES, RESOLUTIONS, type QualityId, type ResolutionId } from "./quality"
import { RoomSession, idleRoom, type RoomEvent, type RoomState, type ShareOpts } from "./room"

interface ShareStore { room: RoomState; grade: "good" | "fair" | "poor" }
export const useShare = create<ShareStore>(() => ({ room: idleRoom(), grade: "good" }))

let session: RoomSession | null = null
const notify = (n: Record<string, unknown>) => void invoke("notify:push", n).catch(() => {})

/** resumo para o notch e a bandeja (sem fluxo de vídeo, só números e textos) */
function publish() {
  const { room: r, grade } = useShare.getState()
  let pub: SharePublic = { active: false }
  if (r.phase === "in-room" || r.phase === "waiting" || r.phase === "connecting") {
    const sharing = r.share.phase !== "off"
    const watching = r.watching.map((w) => r.members.find((m) => m.peer === w.peer)?.name ?? "").filter(Boolean)
    pub = {
      active: true, role: sharing ? "host" : "viewer", phase: sharing ? r.share.phase : r.phase,
      source: r.share.source?.name ?? "", startedAt: r.share.startedAt || Date.now(), viewers: r.share.viewers.length,
      requests: r.requests.length, code: r.code, quality: PROFILES[r.share.quality].label + (r.share.resolution !== "auto" ? " · " + (RESOLUTIONS.find((x) => x.id === r.share.resolution)?.label ?? "") : ""), audio: r.share.audio,
      hostName: watching.join(", "), members: r.members.length, live: r.members.filter((m) => m.live).length, owner: r.me === r.owner,
      connection: r.signal === "reconnecting" ? "reconnecting" : r.signal === "offline" ? "offline" : grade,
    }
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

function onEvent(e: RoomEvent) {
  if (e.type === "request") notify({ kind: "request", title: `${e.name} quer entrar na sala`, body: "Aceite só quem você conhece.", actions: [{ id: "accept", label: "Aceitar" }, { id: "deny", label: "Recusar" }], target: "main", ref: e.peer, sticky: true })
  else if (e.type === "member") notify({ kind: "share", title: `${e.name} entrou na sala` })
  else if (e.type === "member-left") notify({ kind: "share", title: `${e.name} saiu da sala` })
  else if (e.type === "live") notify({ kind: "share", title: `${e.name} começou a transmitir`, body: e.label, actions: [{ id: "watch", label: "Assistir" }], target: "main", ref: e.peer })
  else if (e.type === "viewer") notify({ kind: "share", title: `${e.name} está assistindo sua tela` })
  else if (e.type === "owner" && e.me) notify({ kind: "share", title: "Agora você cuida da sala", body: "Quem criou saiu. Você aprova as entradas." })
  else if (e.type === "source-lost") notify({ kind: "alert", title: "A tela que você transmitia fechou", body: "Escolha outra tela ou janela, ou pare de transmitir." })
  else if (e.type === "alert" && e.code === "brute") notify({ kind: "alert", title: "Muitas tentativas com código errado", body: "A sala foi trancada. Gere um novo código se quiser liberar." })
  else if (e.type === "signal-lost") notify({ kind: "alert", title: "Sem servidor de transmissão", body: "As telas abertas continuam; ninguém novo consegue entrar." })
  else if (e.type === "ended") notify({ kind: "share", title: "Você saiu da sala" })
  else if (e.type === "grade") { if (useShare.getState().grade !== e.grade) { useShare.setState({ grade: e.grade }); publish() } }
}

function newSession() {
  session?.leave()
  session = new RoomSession((s) => { useShare.setState({ room: s }); publish() }, onEvent)
  return session
}

const needUrl = () => {
  const url = signalUrl()
  if (!url) throw new Error("Configure o servidor de transmissão em Transmissão › Servidor e conexão.")
  return url
}
const myName = () => getSection("share")?.name?.trim() || "Convidado"

export async function createRoom(name = myName()) {
  const url = needUrl()
  const prefs = getSection("share")
  await newSession().create(url, name, prefs?.approval ?? true)
  notify({ kind: "share", title: "Sala criada", body: `Convite ${session?.state.code}` })
}
export async function joinRoom(code: string, name = myName()) {
  const url = needUrl()
  await newSession().join(url, code, name)
}
export function leaveRoom() { session?.leave(); session = null; useShare.setState({ room: idleRoom() }); publish() }
export function endRoom() { session?.endForAll(); session = null; useShare.setState({ room: idleRoom() }); publish() }

export async function startSharing(o: Omit<ShareOpts, "preferHardware">) {
  if (!session) throw new Error("Entre numa sala primeiro.")
  const prefs = getSection("share")
  await session.startShare({ ...o, audioMode: o.audioMode ?? prefs?.audioMode ?? "all", preferHardware: prefs?.preferHardware ?? true })
}
export function stopSharing() { session?.stopShare() }
export const roomSession = () => session
export async function switchSource(id: string, name: string, kind: string) { await session?.switchSource(id, name, kind) }
export async function setQuality(q: QualityId) { await session?.setQuality(q) }
export async function setResolution(r: ResolutionId) { await session?.setResolution(r) }
export function watchPeer(peer: string) { session?.watch(peer) }
export function unwatchPeer(peer: string) { session?.unwatch(peer) }
export function admit(peer: string, ok: boolean) {
  session?.admit(peer, ok)
  void invoke("notify:list").then((l: any[]) => { for (const n of l) if (n.ref === peer) void invoke("notify:dismiss", n.id) })
}

// comandos vindos do notch, da bandeja ou dos avisos
on("share:command", ({ cmd, args }: { cmd: string; args: string[] }) => {
  if (cmd === "stop") stopSharing()
  else if (cmd === "admit") admit(args[0], true)
  else if (cmd === "deny") admit(args[0], false)
  else if (cmd === "kick") session?.kick(args[0])
  else if (cmd === "watch") watchPeer(args[0])
  else if (cmd === "leave") leaveRoom()
})
// a página foi recarregada/fechada: nada de transmissão fantasma
window.addEventListener("beforeunload", () => { session?.leave() })
