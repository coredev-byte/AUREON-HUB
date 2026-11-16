// Módulos do processo principal que não dependem do Electron.
const test = require("node:test")
const assert = require("node:assert/strict")
const defaults = require("../electron/core/defaults.cjs")
const { parseLine, displayFor, PS, CS } = require("../electron/core/fullscreen.cjs")
const { parseForecast } = require("../electron/integrations/weather.cjs")
const { identify } = require("../electron/integrations/games.cjs")
const { healthUrl, errorKind, probeSignal } = require("../electron/share/probe.cjs")
const { clean } = require("../electron/core/notifications.cjs")
const { cpuUsage } = require("../electron/integrations/system.cjs")
const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const { createStore } = require("../electron/core/store.cjs")

test("estado: chaves desconhecidas somem, valores inválidos voltam ao padrão", () => {
  const s = defaults.sanitize("settings", { accent: "vermelho", radius: 99, signalUrl: "http://x", evil: 1, city: { name: "SP", lat: -23.5, lon: -46.6 } })
  assert.equal(s.accent, defaults.DEFAULTS.settings.accent)
  assert.equal(s.radius, 22)
  assert.equal(s.signalUrl, "")
  assert.equal(s.evil, undefined)
  assert.equal(s.city.name, "SP")
  assert.equal(defaults.sanitize("settings", { signalUrl: "wss://sinal.exemplo.com/ws" }).signalUrl, "wss://sinal.exemplo.com/ws")
})
test("perfis: widgets inválidos são descartados, tamanhos limitados", () => {
  const p = defaults.sanitize("profiles", { items: [{ id: "padrao", name: "P", widgets: [
    { id: "w-aaaaaaaa", type: "clock", x: 10, y: 10, w: 5, h: 99999, config: {} },
    { id: "w-bbbbbbbb", type: "malware", x: 0, y: 0 },
    { id: "../x", type: "note" },
  ] }] })
  assert.equal(p.items[0].widgets.length, 1)
  assert.equal(p.items[0].widgets[0].w, 80)
  assert.equal(p.items[0].widgets[0].h, 2000)
})
test("store: grava, avisa e relê do disco", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureon-"))
  const a = createStore(dir)
  let seen = null
  a.onChange((sec, v) => { seen = [sec, v.enabled] })
  a.patch("notch", { enabled: false })
  assert.deepEqual(seen, ["notch", false])
  assert.throws(() => a.patch("hack", {}))
  a.flush()
  const b = createStore(dir)
  assert.equal(b.get().notch.enabled, false)
})
test("tela cheia: linha do helper e monitor certo", () => {
  const v = parseLine('{"fs":true,"quns":5,"exe":"cs2","x":1920,"y":0,"w":2560,"h":1440}')
  assert.equal(v.fs, true)
  const displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }, { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }]
  assert.equal(displayFor(v.bounds, displays), "2")
  assert.equal(parseLine("lixo"), null)
  // o helper só mexe em janelas do próprio processo
  assert.match(CS, /pid != \(uint\)ownPid\) return false/)
  assert.match(CS, /AboveDesktop/)
  assert.doesNotMatch(CS, /new IntPtr\(1\)/, "nada de HWND_BOTTOM (some atrás do papel de parede)")
  assert.match(PS(42), /\^desk \(\\d\{1,20\}\)\$/)
})
test("clima: resposta da Open-Meteo vira estados diferentes por condição", () => {
  const j = { current: { temperature_2m: 21.4, apparent_temperature: 22, relative_humidity_2m: 70, wind_speed_10m: 9, weather_code: 63, is_day: 1 }, daily: { time: ["2026-11-15"], weather_code: [95], temperature_2m_max: [25], temperature_2m_min: [18], precipitation_probability_max: [80] } }
  const w = parseForecast(j, { name: "Campinas" })
  assert.equal(w.kind, "rain")
  assert.equal(w.label, "Chuva")
  assert.equal(w.days[0].kind, "storm")
  assert.throws(() => parseForecast({}, { name: "x" }))
})
test("jogos: executável conhecido e app desconhecido em tela cheia", () => {
  assert.equal(identify("cs2", true).name, "Counter-Strike 2")
  assert.equal(identify("vlc", true).known, false)
  assert.equal(identify("notepad", false), null)
})
test("teste do servidor: endereço de saúde e tradução de erros", async () => {
  assert.equal(healthUrl("wss://s.exemplo.com/ws"), "https://s.exemplo.com/health")
  assert.equal(errorKind("net::ERR_NAME_NOT_RESOLVED"), "dns")
  assert.equal(errorKind("net::ERR_CERT_DATE_INVALID"), "clock")
  const fake = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ service: "outro" }) })
  assert.equal((await probeSignal(fake, "wss://x.com/ws")).kind, "wrong")
  assert.equal((await probeSignal(fake, "https://x.com")).kind, "config")
})
test("avisos: só campos conhecidos, imagens só data: pequenas", () => {
  const n = clean({ kind: "hack", title: "x".repeat(500), image: "https://evil", actions: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] })
  assert.equal(n.kind, "info")
  assert.equal(n.title.length, 80)
  assert.equal(n.image, "")
  assert.equal(n.actions.length, 2)
})
test("CPU: uso entre duas leituras", () => {
  assert.equal(cpuUsage([{ idle: 0, total: 0 }], [{ idle: 50, total: 100 }]), 50)
})
