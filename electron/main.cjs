"use strict"
// Aureon Hub — processo principal.
// Módulos: core (estado, janelas, avisos, tela cheia), notch, widgets, share (captura) e integrations.
// Não substitui nem altera nada do Windows: barra de tarefas, Explorer, atalhos e papel de parede ficam intactos.
const path = require("node:path")
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, globalShortcut, net, powerSaveBlocker, shell } = require("electron")
const { createStore } = require("./core/store.cjs")
const windows = require("./core/windows.cjs")
const { createMonitor } = require("./core/fullscreen.cjs")
const { createNotifications } = require("./core/notifications.cjs")
const { createNotchManager } = require("./notch/manager.cjs")
const { createWidgetManager } = require("./widgets/manager.cjs")
const { createWidgetDrag } = require("./widgets/drag.cjs")
const { createCapture } = require("./share/capture.cjs")
const { createMedia } = require("./integrations/media.cjs")
const { createSystem } = require("./integrations/system.cjs")
const { createWeather } = require("./integrations/weather.cjs")
const { createGames } = require("./integrations/games.cjs")
const { probeSignal } = require("./share/probe.cjs")
const { createUpdater } = require("./core/updater.cjs")
const { fetchSafeText } = require("./integrations/widgy/net-guard.cjs")
const sportsMod = require("./integrations/widgy/sports.cjs")
const teamsMod = require("./integrations/widgy/teams.cjs")
const valorant = require("./integrations/widgy/gamestats.cjs")
const sysaudio = require("./integrations/widgy/sysaudio.cjs")
const { createWallpaper } = require("./integrations/wallpaper.cjs")

const SMOKE = process.env.AUREON_SMOKE === "1"
if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
app.setAppUserModelId("com.aureon.hub")
if (process.defaultApp) app.setAsDefaultProtocolClient("aureon", process.execPath, [path.resolve(process.argv[1])])
else app.setAsDefaultProtocolClient("aureon")

let store, notch, widgets, widgetDrag, monitor, notifications, capture, media, system, weather, games, updates, wallpaper
let mainWin = null, tray = null, quitting = false
let shareState = { active: false }, blocker = null

const state = () => store.get()
const broadcast = (ch, payload, role) => windows.broadcast(ch, payload, role)

/* ───────────── convites aureon://join/CODIGO ───────────── */
function inviteFrom(argv) {
  const url = (argv || []).find((a) => typeof a === "string" && a.startsWith("aureon://"))
  if (!url) return null
  const m = /^aureon:\/\/join\/([A-Z0-9-]{8,24})\/?$/i.exec(url)
  return m ? m[1].toUpperCase() : null
}
let pendingInvite = inviteFrom(process.argv)

/* ───────────── janela principal ───────────── */
function showMain(page, params) {
  if (!mainWin || mainWin.isDestroyed()) createMain()
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show(); mainWin.focus()
  if (page) mainWin.webContents.send("nav", { page, params: params ?? {} })
}
function createMain() {
  const s = state()
  mainWin = new BrowserWindow({
    width: 1200, height: 780, minWidth: 800, minHeight: 560, title: "Aureon Hub",
    frame: false, show: false, backgroundColor: s.settings.surface,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    // o motor da transmissão vive nesta página: não pode ser congelado quando a janela fica escondida
    webPreferences: windows.webPreferences({ backgroundThrottling: false }),
  })
  windows.register(mainWin, "main")
  windows.load(mainWin, "index")
  mainWin.once("ready-to-show", () => {
    if (!process.argv.includes("--hidden")) mainWin.show()
    if (pendingInvite) { mainWin.webContents.send("nav", { page: "share", params: { join: pendingInvite } }); pendingInvite = null }
  })
  // fechar a janela esconde: transmissão, notch e widgets continuam (sair de verdade é pela bandeja)
  mainWin.on("close", (e) => { if (!quitting) { e.preventDefault(); mainWin.hide() } })
  mainWin.on("maximize", () => mainWin.webContents.send("win:maximized", true))
  mainWin.on("unmaximize", () => mainWin.webContents.send("win:maximized", false))
  // se a página da transmissão cair, a transmissão acabou: avisa e limpa o estado
  mainWin.webContents.on("render-process-gone", (_e, d) => {
    if (shareState.active) { setShare({ active: false }); notifications.push({ kind: "alert", title: "Transmissão encerrada", body: "A janela principal parou (" + d.reason + ")." }) }
  })
}

/* ───────────── bandeja ───────────── */
function trayImage() {
  const img = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon.png"))
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 })
}
function updateTray() {
  if (!tray) return
  const s = state()
  const live = shareState.active && shareState.role === "host"
  tray.setToolTip(live ? `Aureon Hub — transmitindo (${shareState.viewers ?? 0} assistindo)` : "Aureon Hub")
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Aureon Hub", click: () => showMain() },
    { type: "separator" },
    ...(live ? [{ label: "Encerrar transmissão", click: () => sendShareCommand("stop") }, { type: "separator" }] : []),
    { label: "Notch", type: "checkbox", checked: s.notch.enabled, click: (i) => store.patch("notch", { enabled: i.checked }) },
    { label: "Widgets", type: "checkbox", checked: s.widgets.enabled, click: (i) => store.patch("widgets", { enabled: i.checked }) },
    { label: "Editar posição dos widgets", click: () => store.patch("widgets", { editMode: true }) },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit() } },
  ]))
}

/* ───────────── transmissão (estado publicado pela página principal) ───────────── */
function setShare(next) {
  const was = shareState.active && shareState.role === "host"
  shareState = next && typeof next === "object" ? next : { active: false }
  const live = shareState.active && shareState.role === "host"
  notch?.setSharing(live)
  if (live && blocker == null) blocker = powerSaveBlocker.start("prevent-app-suspension")
  if (!live && blocker != null) { powerSaveBlocker.stop(blocker); blocker = null }
  if (was !== live) updateTray()
  broadcast("share:state", shareState)
}
function sendShareCommand(cmd, ...args) {
  if (!mainWin || mainWin.isDestroyed()) return false
  mainWin.webContents.send("share:command", { cmd, args })
  return true
}

/* ───────────── atalho global (Ctrl+Alt+Espaço: abre/fecha o notch) ───────────── */
function applyHotkey() {
  globalShortcut.unregisterAll()
  const s = state().settings
  if (!s.hotkeyOn || !s.hotkey) return
  try { globalShortcut.register(s.hotkey, () => notch.toggle()) } catch { /* combinação inválida: ignora */ }
}

/* ───────────── IPC ───────────── */
const need = (role) => (e) => { if (windows.roleOf(e.sender) !== role) throw new Error("Não permitido nesta janela") }
const any = (e) => { if (!windows.roleOf(e.sender)) throw new Error("Janela desconhecida") }

function registerIpc() {
  const h = (ch, guard, fn) => ipcMain.handle(ch, (e, ...a) => { guard(e); return fn(e, ...a) })

  h("store:get", any, () => state())
  h("store:patch", any, (_e, section, value) => store.patch(section, value))
  h("store:replace", any, (_e, section, value) => store.replace(section, value))

  h("media:sub", any, (e) => media.subscribe("w" + e.sender.id))
  h("media:unsub", any, (e) => media.unsubscribe("w" + e.sender.id))
  h("media:cmd", any, (_e, cmd, app_, arg) => media.command(String(cmd), String(app_ || ""), arg))
  h("system:sub", any, (e) => system.subscribe(e.sender.id))
  h("system:unsub", any, (e) => system.unsubscribe(e.sender.id))
  h("weather:sub", any, () => weather.subscribe())
  h("weather:unsub", any, () => weather.unsubscribe())
  h("weather:refresh", any, () => weather.refresh())
  h("weather:search", any, (_e, q) => weather.search(q))
  h("games:get", any, () => games.get())
  h("wallpaper:get", any, () => wallpaper.get())
  // widgets portados do Widgy: texto de URLs públicas (pelo principal, com limites), esportes, times e Valorant
  h("net:text", any, (_e, url) => fetchSafeText(net.fetch.bind(net), String(url || "")))
  const relay = { isDestroyed: () => false, webContents: { send: (ch, d) => broadcast(ch, d) } }
  const fakeIpc = { handle: (ch, fn) => h(ch, any, fn) }
  sportsMod.register(fakeIpc)
  teamsMod.register(fakeIpc, sportsMod.teams)
  valorant.register(fakeIpc, () => relay)
  // espectro do som do PC para a capa reativa do notch (só enquanto ela está na tela e tocando; nada é gravado)
  sysaudio.register(fakeIpc, () => ({ ...relay, isVisible: () => true, isMinimized: () => false }), () => mainWin)
  h("fs:get", any, () => monitor.get())

  h("share:sources", need("main"), () => capture.sources())
  h("share:select", need("main"), (_e, id, audio) => capture.select(id, audio))
  h("share:publish", need("main"), (_e, s) => { setShare(s); return true })
  h("share:get", any, () => shareState)
  // notch/bandeja pedem algo à transmissão (encerrar, aceitar alguém); trocar a fonte abre o seletor
  h("share:command", any, (_e, cmd, ...args) => {
    if (!["stop", "admit", "deny", "kick", "leave", "watch", "pick-source"].includes(cmd)) return false
    if (cmd === "pick-source") { showMain("share", { pick: true }); return true }
    return sendShareCommand(cmd, ...args.map((x) => String(x).slice(0, 80)))
  })
  h("share:probe", any, (_e, url) => probeSignal(net.fetch.bind(net), String(url || "")))

  h("notify:push", any, (_e, n) => notifications.push(n))
  h("notify:list", any, () => notifications.list())
  h("notify:dismiss", any, (_e, id) => notifications.dismiss(String(id)))
  h("notify:read", any, () => notifications.markRead())
  h("notify:clear", any, () => notifications.clear())
  h("notify:action", any, (_e, id, action) => {
    const n = notifications.find(String(id))
    if (!n || !n.actions.some((a) => a.id === action)) return false
    notifications.dismiss(n.id)
    if (n.target === "main") sendShareCommand(action === "accept" ? "admit" : action === "watch" ? "watch" : "deny", n.ref)
    if (action === "watch") showMain("share")
    return true
  })

  h("notch:interactive", need("notch"), (e, on) => notch.setInteractive(e.sender, !!on))
  h("notch:menu", need("notch"), (e) => {
    const s = state()
    const live = shareState.active && shareState.role === "host"
    Menu.buildFromTemplate([
      { label: "Abrir Aureon Hub", click: () => showMain() },
      { label: "Personalizar notch", click: () => showMain("notch") },
      ...(live ? [{ label: "Encerrar transmissão", click: () => sendShareCommand("stop") }] : [{ label: "Transmitir tela", click: () => showMain("share") }]),
      { type: "separator" },
      { label: s.widgets.enabled ? "Esconder widgets" : "Mostrar widgets", click: () => store.patch("widgets", { enabled: !s.widgets.enabled }) },
      { label: "Desligar o notch", click: () => store.patch("notch", { enabled: false }) },
    ]).popup({ window: BrowserWindow.fromWebContents(e.sender) })
  })
  h("widgets:interactive", need("widgets"), (e, on) => widgets.setInteractive(e.sender, !!on))
  h("widgets:drag-start", need("widgets"), (e, id, grab) => widgetDrag.start(windows.infoOf(e.sender)?.displayId, id, grab))
  h("widgets:drag-end", need("widgets"), () => widgetDrag.finish())
  h("widgets:drag-cancel", need("widgets"), () => { widgetDrag.cancel(); return true })

  h("app:open", any, (_e, page, params) => { showMain(typeof page === "string" ? page : undefined, params); return true })
  h("app:info", any, (e) => ({
    version: app.getVersion(), platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome,
    displays: screen.getAllDisplays().map((d) => ({ id: String(d.id), label: d.label || "", bounds: d.bounds, workArea: d.workArea, scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id })),
    display: windows.infoOf(e.sender)?.displayId ?? null,
  }))
  h("app:metrics", any, () => ({
    processes: app.getAppMetrics().map((p) => ({ pid: p.pid, type: p.type, name: p.name || "", cpu: Math.round(p.cpu.percentCPUUsage * 10) / 10, mem: p.memory.workingSetSize * 1024 })),
    windows: { notch: notch.count(), widgets: widgets.count() },
    fullscreen: monitor.get(), media: media.status(), share: shareState,
  }))
  h("app:external", any, (_e, url) => { if (/^https:\/\//.test(String(url))) void shell.openExternal(String(url)) })
  h("app:quit", need("main"), () => { quitting = true; app.quit() })

  h("update:get", any, () => updates.get())
  h("update:check", need("main"), () => updates.check())
  h("update:download", need("main"), () => updates.download())
  h("update:install", need("main"), () => {
    // transmissão ativa: a página principal pergunta antes; aqui só garante que fecha de verdade
    return updates.install(() => { quitting = true; globalShortcut.unregisterAll(); store.flush() })
  })

  h("win:cmd", need("main"), (_e, cmd) => {
    if (cmd === "minimize") mainWin.minimize()
    else if (cmd === "maximize") mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize()
    else if (cmd === "close") mainWin.close()
    else if (cmd === "fullscreen") mainWin.setFullScreen(!mainWin.isFullScreen())
  })
}

/* ───────────── início ───────────── */
app.on("second-instance", (_e, argv) => {
  const code = inviteFrom(argv)
  showMain(code ? "share" : undefined, code ? { join: code } : undefined)
})
app.on("open-url", (e, url) => { e.preventDefault(); const code = inviteFrom([url]); if (code) showMain("share", { join: code }) })

app.whenReady().then(() => {
  store = createStore(process.env.AUREON_DATA_DIR || app.getPath("userData"))
  if (state().widgets.editMode) store.patch("widgets", { editMode: false })
  notifications = createNotifications({ broadcast })
  media = createMedia({ broadcast })
  system = createSystem({ broadcast, appMetrics: () => app.getAppMetrics() })
  weather = createWeather({ fetch: net.fetch.bind(net), broadcast, getCity: () => state().settings.city })
  games = createGames({ broadcast })
  wallpaper = createWallpaper({ nativeImage, broadcast })
  updates = createUpdater({ app, broadcast, getSettings: () => state().settings, notify: (n) => notifications.push(n) })
  capture = createCapture()
  monitor = createMonitor({
    screen,
    onChange: (fs) => {
      notch.setFullscreen(fs.fs ? fs.displayId : null)
      widgets.setFullscreen(fs.fs ? fs.displayId : null)
      games.update(fs)
      // a API local do Riot só é consultada enquanto o Valorant está na frente
      valorant.onPlaying(fs.fs && /valorant/i.test(fs.exe) ? [{ id: "valorant" }] : [])
      broadcast("fs:state", fs)
    },
  })
  notch = createNotchManager({ getState: state })
  widgets = createWidgetManager({ getState: state, toDesktop: (h) => monitor.toDesktop(h) })
  widgetDrag = createWidgetDrag({
    screen, getState: state,
    saveProfiles: (profiles) => store.replace("profiles", profiles),
    sendPreview: (preview) => broadcast("widgets:drag-preview", preview, "widgets"),
  })
  registerIpc()

  store.onChange((section, value) => {
    broadcast("store:changed", { section, value })
    if (section === "notch") notch.sync()
    if (section === "widgets") { if (!value.editMode) widgetDrag.cancel(); widgets.refresh(); widgets.setEditMode(value.editMode) }
    if (section === "settings") {
      applyHotkey()
      updates.schedule()
      if (!SMOKE) app.setLoginItemSettings({ openAtLogin: value.launchAtLogin, args: ["--hidden"] })
      void weather.refresh()
    }
    if (section === "notch" || section === "widgets") updateTray()
  })
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"]) {
    screen.on(ev, () => { widgetDrag.cancel(); notch.sync(); widgets.sync(); broadcast("displays:changed", null); void wallpaper.refresh() })
  }

  createMain()
  notch.sync()
  widgets.sync()
  monitor.start()
  wallpaper.start()
  applyHotkey()
  if (!SMOKE) updates.schedule()
  tray = new Tray(trayImage())
  tray.on("click", () => showMain())
  updateTray()
  if (SMOKE) require("./core/smoke.cjs").run({ app, BrowserWindow, store, out: process.env.AUREON_SMOKE_OUT })
})

app.on("window-all-closed", (e) => e.preventDefault())
app.on("before-quit", () => {
  quitting = true
  globalShortcut.unregisterAll()
  widgetDrag?.cancel(); monitor?.stop(); wallpaper?.stop(); media?.stop(); updates?.stop(); sysaudio.stop(); system?.stop(); weather?.stop()
  store?.flush()
})
