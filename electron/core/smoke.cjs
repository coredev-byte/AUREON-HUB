"use strict"
// Teste de fumaça (só com AUREON_SMOKE=1): abre o app de verdade, espera as janelas, confere se cada página
// montou sem erros, mede memória/CPU e grava um relatório JSON. Usado em tests/e2e/electron-smoke.cjs.
const fs = require("node:fs")

function run({ app, BrowserWindow, store, out }) {
  const errors = []
  app.on("web-contents-created", () => {})
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.on("console-message", (e) => { if (e.level === "error") errors.push(`${w.getTitle()}: ${e.message}`.slice(0, 300)) })
    w.webContents.on("render-process-gone", (_e, d) => errors.push(`${w.getTitle()}: processo caiu (${d.reason})`))
  }
  setTimeout(async () => {
    const windows = []
    for (const w of BrowserWindow.getAllWindows()) {
      let mounted = false, text = ""
      try {
        mounted = await w.webContents.executeJavaScript("document.getElementById('root')?.children.length > 0")
        text = await w.webContents.executeJavaScript("document.body.innerText.slice(0, 120)")
      } catch (e) { errors.push(String(e)) }
      if (process.env.AUREON_SMOKE_SHOTS) {
        try { fs.writeFileSync(require("node:path").join(process.env.AUREON_SMOKE_SHOTS, w.getTitle().replace(/\W+/g, "-") + ".png"), (await w.webContents.capturePage()).toPNG()) } catch { /* sem captura */ }
      }
      windows.push({ title: w.getTitle(), url: w.webContents.getURL().replace(/^.*\/dist\//, "dist/"), visible: w.isVisible(), bounds: w.getBounds(), mounted, text, ignoreMouse: undefined })
    }
    // ida e volta pelo processo principal (o que as páginas fazem)
    store.patch("notch", { idleClock: false })
    const roundtrip = store.get().notch.idleClock === false
    await new Promise((r) => setTimeout(r, 1500))
    const metrics = app.getAppMetrics().map((p) => ({ type: p.type, cpu: Math.round(p.cpu.percentCPUUsage * 10) / 10, memMB: Math.round(p.memory.workingSetSize / 1024) }))
    const report = { ok: !errors.length && windows.every((w) => w.mounted), windows, errors, roundtrip, metrics, totalMemMB: metrics.reduce((a, p) => a + p.memMB, 0) }
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1))
    app.exit(0)
  }, 9000)
}
module.exports = { run }
