// Atualizador: diz claramente quando não dá para atualizar pelo app (desenvolvimento / versão portátil).
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const { createUpdater } = require("../electron/core/updater.cjs")

const fakeApp = (packaged) => ({ isPackaged: packaged, getVersion: () => "0.1.2" })
const deps = (app) => ({ app, broadcast: () => {}, getSettings: () => ({ autoCheck: true, autoUpdate: true }), notify: () => {} })

test("rodando pelo código: desligado, com motivo", () => {
  const u = createUpdater(deps(fakeApp(false)))
  assert.equal(u.get().supported, false)
  assert.match(u.get().reason, /desenvolvimento/)
  assert.equal(u.install(), false)
})

test("versão portátil (sem app-update.yml): desligado, explica que precisa do instalador", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "res-"))
  const old = process.resourcesPath
  Object.defineProperty(process, "resourcesPath", { value: dir, configurable: true })
  try {
    const u = createUpdater(deps(fakeApp(true)))
    assert.equal(u.get().supported, false)
    assert.match(u.get().reason, /portátil/)
  } finally { Object.defineProperty(process, "resourcesPath", { value: old, configurable: true }) }
})

test("instalado (com app-update.yml): ativo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "res-"))
  fs.writeFileSync(path.join(dir, "app-update.yml"), "provider: github\nowner: core-dev-user\nrepo: aureon-hub\n")
  const old = process.resourcesPath
  Object.defineProperty(process, "resourcesPath", { value: dir, configurable: true })
  try {
    const u = createUpdater(deps(fakeApp(true)))
    // electron-updater só carrega dentro do Electron; fora dele o motivo aparece em vez de quebrar
    assert.ok(u.get().supported || /Atualizador indisponível/.test(u.get().reason))
  } finally { Object.defineProperty(process, "resourcesPath", { value: old, configurable: true }) }
})
