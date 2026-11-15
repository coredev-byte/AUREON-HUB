// Abre o Aureon Hub de verdade (Electron, display virtual no Linux) e confere o relatório do modo fumaça.
const { spawnSync } = require("node:child_process")
const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const ROOT = path.resolve(__dirname, "../..")
const out = path.join(os.tmpdir(), "aureon-smoke.json")
const data = fs.mkdtempSync(path.join(os.tmpdir(), "aureon-data-"))
try { fs.unlinkSync(out) } catch {}
const electron = require("electron")
const args = [ROOT, "--no-sandbox", "--disable-gpu"]
const cmd = process.platform === "linux" && !process.env.DISPLAY ? ["xvfb-run", ["-a", "-s", "-screen 0 1920x1080x24", electron, ...args]] : [electron, args]
const r = spawnSync(cmd[0], cmd[1], { env: { ...process.env, AUREON_SMOKE: "1", AUREON_SMOKE_OUT: out, AUREON_DATA_DIR: data, ELECTRON_ENABLE_LOGGING: "0" }, timeout: 60000, encoding: "utf8" })
if (!fs.existsSync(out)) { console.error("sem relatório", r.status, (r.stderr || "").slice(-2000)); process.exit(1) }
const rep = JSON.parse(fs.readFileSync(out, "utf8"))
console.log(JSON.stringify(rep, null, 1))
process.exit(rep.ok && rep.roundtrip ? 0 : 1)
