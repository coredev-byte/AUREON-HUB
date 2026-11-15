"use strict"
// Camada de widgets: uma janela transparente por monitor, na área útil (sem cobrir a barra do Windows),
// atrás das janelas comuns e atravessável pelo mouse fora dos widgets. Não usa WorkerW/Progman nem mexe no
// Explorer: depois de perder o foco ela é mandada para o fundo da pilha (só a própria janela).
const { BrowserWindow, screen } = require("electron")
const windows = require("../core/windows.cjs")

function createWidgetManager({ getState, toBottom }) {
  const wins = new Map() // displayId -> BrowserWindow
  let fsDisplay = null

  const hwnd = (w) => {
    const b = w.getNativeWindowHandle()
    return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0))
  }
  const sendBack = (w) => { if (!w.isDestroyed() && process.platform === "win32") toBottom?.(hwnd(w)) }

  function create(display) {
    const id = String(display.id)
    const win = new BrowserWindow({
      ...display.workArea, title: "aureon-widgets",
      frame: false, transparent: true, resizable: false, movable: false, minimizable: true, maximizable: false,
      fullscreenable: false, skipTaskbar: true, hasShadow: false, show: false, backgroundColor: "#00000000",
      // janela de ferramenta no Windows: fora do Alt+Tab (os widgets não são uma "janela" para o usuário)
      ...(process.platform === "win32" ? { type: "toolbar" } : {}),
      webPreferences: windows.webPreferences({ backgroundThrottling: true }),
    })
    win.setIgnoreMouseEvents(true, { forward: true })
    windows.register(win, "widgets", { displayId: id })
    windows.load(win, "widgets", { display: id, primary: display.id === screen.getPrimaryDisplay().id ? "1" : "0" })
    win.once("ready-to-show", () => apply(id))
    win.on("blur", () => { if (!getState().widgets.editMode) sendBack(win) })
    // "Mostrar área de trabalho" (Win+D) minimiza tudo: os widgets voltam, porque eles SÃO a área de trabalho.
    win.on("minimize", () => setTimeout(() => { if (!win.isDestroyed() && shouldShow(id)) { win.restore(); sendBack(win) } }, 250))
    win.on("closed", () => { if (wins.get(id) === win) wins.delete(id) })
    wins.set(id, win)
  }

  const shouldShow = (id) => {
    const s = getState()
    if (!s.widgets.enabled) return false
    if (s.widgets.hideFullscreen && fsDisplay === id) return false
    return true
  }

  function apply(id) {
    const w = wins.get(id)
    if (!w || w.isDestroyed()) return
    if (!shouldShow(id)) { w.hide(); w.webContents.send("widgets:paused", true); return }
    w.webContents.send("widgets:paused", false)
    if (!w.isVisible()) { w.showInactive(); sendBack(w) }
  }

  function sync() {
    const displays = screen.getAllDisplays()
    const keep = new Set(displays.map((d) => String(d.id)))
    for (const [id, w] of wins) if (!keep.has(id)) { wins.delete(id); if (!w.isDestroyed()) w.destroy() }
    for (const d of displays) {
      const id = String(d.id)
      const w = wins.get(id)
      if (!w || w.isDestroyed()) create(d)
      else { w.setBounds(d.workArea); apply(id) }
    }
  }

  return {
    sync,
    setFullscreen(displayId) { fsDisplay = displayId; for (const id of wins.keys()) apply(id) },
    setEditMode(on) {
      for (const w of wins.values()) {
        if (w.isDestroyed()) continue
        w.setIgnoreMouseEvents(!on, { forward: true })
        if (on) { w.setAlwaysOnTop(true, "floating"); w.showInactive() } else { w.setAlwaysOnTop(false); sendBack(w) }
      }
    },
    setInteractive(sender, on) {
      if (getState().widgets.editMode) return
      for (const w of wins.values()) if (!w.isDestroyed() && w.webContents.id === sender.id) w.setIgnoreMouseEvents(!on, { forward: true })
    },
    refresh() { for (const id of wins.keys()) apply(id) },
    count: () => wins.size,
    destroyAll() { for (const w of wins.values()) if (!w.isDestroyed()) w.destroy(); wins.clear() },
  }
}

module.exports = { createWidgetManager }
