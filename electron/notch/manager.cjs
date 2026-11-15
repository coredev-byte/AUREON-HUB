"use strict"
// Janelas do Notch: uma por monitor (ou só no principal). Transparente, sempre no topo, sem foco e
// atravessável pelo mouse fora do desenho do notch (a página avisa quando o ponteiro entra na área real).
const { BrowserWindow, screen } = require("electron")
const windows = require("../core/windows.cjs")

const BASE_W = 880, BASE_H = 420

/** retângulo da janela do notch para um monitor (centralizada no topo, na escala escolhida) */
function geometry(display, scale = 1) {
  const w = Math.ceil(BASE_W * scale), h = Math.ceil(BASE_H * scale)
  const b = display.bounds
  return { x: Math.round(b.x + (b.width - w) / 2), y: b.y, width: Math.min(w, b.width), height: Math.min(h, b.height) }
}

/** quais monitores recebem notch */
function targets(displays, primaryId, mode) {
  return mode === "all" ? displays : displays.filter((d) => d.id === primaryId)
}

function createNotchManager({ getState, onCreated }) {
  const wins = new Map() // displayId -> BrowserWindow
  let fsDisplay = null, sharing = false

  function create(display) {
    const s = getState()
    const win = new BrowserWindow({
      ...geometry(display, s.notch.scale), title: "aureon-notch",
      frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false,
      // Focável de propósito: no Windows, janela "não focável" tem o clique descartado pelo Chromium
      // (o hover funciona, o clique não). "toolbar" = janela de ferramenta: fora do Alt+Tab e da barra.
      // Ela não pega o foco ao aparecer (showInactive) e devolve o foco quando o mouse sai.
      fullscreenable: false, skipTaskbar: true, focusable: process.env.AUREON_TEST_NOTCH_UNFOCUSABLE !== "1", hasShadow: false, show: false, alwaysOnTop: true,
      ...(process.platform === "win32" ? { type: "toolbar" } : {}),
      backgroundColor: "#00000000",
      webPreferences: windows.webPreferences({ backgroundThrottling: false }),
    })
    win.setAlwaysOnTop(true, "pop-up-menu")
    // Linux não repassa o movimento do mouse a janelas atravessáveis: nos testes de clique real a janela fica "sólida"
    const solid = process.env.AUREON_TEST_SOLID_NOTCH === "1"
    if (!solid) win.setIgnoreMouseEvents(true, { forward: true })
    win.setVisibleOnAllWorkspaces?.(true)
    windows.register(win, "notch", { displayId: String(display.id) })
    windows.load(win, "notch", { display: String(display.id), primary: display.id === screen.getPrimaryDisplay().id ? "1" : "0" })
    win.once("ready-to-show", () => { applyVisibility(String(display.id)); onCreated?.(win) })
    win.on("closed", () => { if (wins.get(String(display.id)) === win) wins.delete(String(display.id)) })
    wins.set(String(display.id), win)
    return win
  }

  /** esconde o notch no monitor com tela cheia (ou mostra só a pílula de transmissão, sem cliques) */
  function applyVisibility(id) {
    const win = wins.get(id)
    if (!win || win.isDestroyed()) return
    const fsHere = fsDisplay === id
    const s = getState()
    if (fsHere && !(sharing && s.notch.fullscreenIndicator)) { win.hide(); return }
    win.webContents.send("notch:fullscreen", fsHere)
    if (fsHere) win.setIgnoreMouseEvents(true, { forward: false })
    else if (process.env.AUREON_TEST_SOLID_NOTCH !== "1") win.setIgnoreMouseEvents(true, { forward: true })
    if (!win.isVisible()) win.showInactive()
  }

  function sync() {
    const s = getState()
    const displays = screen.getAllDisplays()
    const want = s.notch.enabled ? targets(displays, screen.getPrimaryDisplay().id, s.notch.displays) : []
    const keep = new Set(want.map((d) => String(d.id)))
    for (const [id, w] of wins) if (!keep.has(id)) { wins.delete(id); if (!w.isDestroyed()) w.destroy() }
    for (const d of want) {
      const id = String(d.id)
      const w = wins.get(id)
      if (!w || w.isDestroyed()) create(d)
      else { w.setBounds(geometry(d, s.notch.scale)); applyVisibility(id) }
    }
  }

  return {
    sync,
    setFullscreen(displayId) { fsDisplay = displayId; for (const id of wins.keys()) applyVisibility(id) },
    setSharing(on) { if (sharing === on) return; sharing = on; for (const id of wins.keys()) applyVisibility(id) },
    /** a página diz se o ponteiro está sobre o desenho do notch */
    setInteractive(sender, on) {
      for (const [id, w] of wins) {
        if (w.isDestroyed() || w.webContents.id !== sender.id) continue
        if (fsDisplay === id) return w.setIgnoreMouseEvents(true, { forward: false })
        if (process.env.AUREON_TEST_SOLID_NOTCH !== "1") w.setIgnoreMouseEvents(!on, { forward: true })
        // o mouse saiu depois de um clique: o foco volta para o app que estava em uso
        if (!on && w.isFocused()) w.blur()
      }
    },
    toggle(displayId) {
      const id = displayId ?? String(screen.getPrimaryDisplay().id)
      const w = wins.get(id) ?? [...wins.values()][0]
      w?.webContents.send("notch:toggle")
    },
    count: () => wins.size,
    destroyAll() { for (const w of wins.values()) if (!w.isDestroyed()) w.destroy(); wins.clear() },
  }
}

module.exports = { createNotchManager, geometry, targets, BASE_W, BASE_H }
