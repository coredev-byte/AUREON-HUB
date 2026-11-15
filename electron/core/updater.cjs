"use strict"
// Atualização pelo próprio app: procura versão nova nas Releases do GitHub, baixa em segundo plano e
// instala com um clique (o app fecha, instala por cima e abre de novo). Sem desinstalar nada.
// Só funciona no app INSTALADO pelo AureonHub-Setup (a versão portátil não tem como se substituir).
const fs = require("node:fs")
const path = require("node:path")

function createUpdater({ app, broadcast, getSettings, notify }) {
  let state = { status: "idle", current: app.getVersion(), version: "", percent: 0, error: "", notes: "", supported: false, reason: "", checkedAt: 0 }
  let updater = null
  let timer = null
  const set = (p) => { state = { ...state, ...p }; broadcast("update:state", state) }

  // por que não dá para atualizar (mostrado em Configurações)
  if (!app.isPackaged) state.reason = "Rodando pelo código-fonte (desenvolvimento)."
  else if (!fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) state.reason = "Versão portátil: para atualizar pelo app, use o instalador uma vez."
  else {
    try {
      updater = require("electron-updater").autoUpdater
      state.supported = true
    } catch (e) { state.reason = "Atualizador indisponível: " + String(e?.message || e).slice(0, 120) }
  }

  if (updater) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.on("checking-for-update", () => set({ status: "checking", error: "" }))
    updater.on("update-available", (i) => {
      const notes = typeof i.releaseNotes === "string" ? i.releaseNotes.replace(/<[^>]+>/g, "").slice(0, 600) : ""
      set({ status: "available", version: i.version, notes, checkedAt: Date.now() })
      if (getSettings().autoUpdate) download()
      else notify({ kind: "info", title: `Aureon Hub ${i.version} disponível`, body: "Abra Configurações › Atualizações para baixar." })
    })
    updater.on("update-not-available", () => set({ status: "none", checkedAt: Date.now() }))
    updater.on("download-progress", (p) => set({ status: "downloading", percent: Math.round(p.percent || 0) }))
    updater.on("update-downloaded", (i) => {
      set({ status: "ready", version: i.version, percent: 100 })
      notify({ kind: "info", title: `Atualização ${i.version} pronta`, body: "Reinicie pelo Configurações › Atualizações, ou ela entra quando você sair do app." })
    })
    updater.on("error", (e) => set({ status: "error", error: friendly(e) }))
  }

  function friendly(e) {
    const m = String(e?.message || e).split("\n")[0]
    if (/404|Cannot find latest|No published versions/i.test(m)) return "Nenhuma versão publicada ainda no GitHub (ou o repositório é privado)."
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(m)) return "Sem conexão com o GitHub agora."
    if (/sha512|checksum/i.test(m)) return "O download veio corrompido. Tente de novo."
    return m.slice(0, 200)
  }

  async function check() {
    if (!updater) return state
    try { await updater.checkForUpdates() } catch (e) { set({ status: "error", error: friendly(e) }) }
    return state
  }
  async function download() {
    if (!updater || !["available", "error"].includes(state.status) || !state.version) return state
    set({ status: "downloading", percent: 0, error: "" })
    try { await updater.downloadUpdate() } catch (e) { set({ status: "error", error: friendly(e) }) }
    return state
  }
  function install(beforeQuit) {
    if (!updater || state.status !== "ready") return false
    beforeQuit?.()
    // instala em silêncio por cima e abre a versão nova
    setImmediate(() => updater.quitAndInstall(true, true))
    return true
  }
  function schedule() {
    clearInterval(timer); timer = null
    if (!updater || !getSettings().autoCheck) return
    setTimeout(check, 20_000).unref?.()
    timer = setInterval(check, 4 * 3600_000)
  }

  return { get: () => state, check, download, install, schedule, stop: () => clearInterval(timer) }
}

module.exports = { createUpdater }
