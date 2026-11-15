"use strict"
// Registro das janelas do app: cada webContents tem um papel ("main", "notch", "widgets").
// O IPC confere o papel de quem chama antes de aceitar comandos sensíveis (ex.: escolher a tela a transmitir).
const path = require("node:path")
const { BrowserWindow, shell } = require("electron")

const roles = new Map() // webContents.id -> { role, displayId }
const DEV_URL = process.env.AUREON_DEV_URL || ""

function secure(win) {
  const wc = win.webContents
  // nada de abrir janelas ou navegar para fora do app; links externos vão para o navegador
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) void shell.openExternal(url); return { action: "deny" } })
  wc.on("will-navigate", (e, url) => { if (!url.startsWith(DEV_URL || "file://")) e.preventDefault() })
  wc.on("will-attach-webview", (e) => e.preventDefault())
}

function webPreferences(extra = {}) {
  return {
    preload: path.join(__dirname, "..", "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: false,
    ...extra,
  }
}

function load(win, page, query = {}) {
  const q = new URLSearchParams(query).toString()
  if (DEV_URL) return win.loadURL(`${DEV_URL}/${page}.html${q ? "?" + q : ""}`)
  return win.loadFile(path.join(__dirname, "..", "..", "dist", page + ".html"), { query })
}

function register(win, role, extra = {}) {
  const id = win.webContents.id
  roles.set(id, { role, ...extra })
  win.on("closed", () => roles.delete(id))
  secure(win)
}

const roleOf = (sender) => roles.get(sender.id)?.role ?? null
const infoOf = (sender) => roles.get(sender.id) ?? null

/** envia para todas as janelas do app (ou só para um papel) */
function broadcast(channel, payload, role = null) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    const r = roles.get(w.webContents.id)
    if (!r || (role && r.role !== role)) continue
    w.webContents.send(channel, payload)
  }
}

module.exports = { webPreferences, load, register, roleOf, infoOf, broadcast, DEV_URL }
