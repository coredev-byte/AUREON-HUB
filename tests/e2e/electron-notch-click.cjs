// Cliques REAIS do sistema (xdotool) no notch do app Electron: passar o mouse abre, clicar numa aba troca o conteúdo.
// Pega o tipo de erro visto no Windows (hover funcionava, clique não). Só roda no Linux com xdotool + Xvfb.
const { spawn, execFileSync } = require("node:child_process")
const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const ROOT = path.resolve(__dirname, "../..")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (c, m) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m) }

;(async () => {
  try { execFileSync("which", ["xdotool", "Xvfb"]) } catch { console.log("pulado: precisa de xdotool e Xvfb"); return }
  const disp = ":" + (90 + Math.floor(Math.random() * 9))
  const x = spawn("Xvfb", [disp, "-screen", "0", "1920x1080x24"], { stdio: "ignore" })
  await sleep(800)
  const env = { ...process.env, DISPLAY: disp }
  const out = path.join(os.tmpdir(), "aureon-click.json")
  try { fs.unlinkSync(out) } catch {}
  const app = spawn(require("electron"), [ROOT, "--no-sandbox", "--disable-gpu"], { env: { ...env, AUREON_SMOKE: "1", AUREON_TEST_SOLID_NOTCH: "1", ...(process.env.UNFOCUSABLE ? { AUREON_TEST_NOTCH_UNFOCUSABLE: "1" } : {}), AUREON_SMOKE_OUT: out, AUREON_SMOKE_WAIT: "14000", AUREON_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "aureon-d-")) }, stdio: "ignore" })
  try {
    await sleep(5000)
    const xdo = (...a) => execFileSync("xdotool", a, { env })
    // a janela principal fica por cima no centro; o notch está no topo, acima dela
    xdo("mousemove", "960", "40"); await sleep(150)
    xdo("mousemove", "960", "12"); await sleep(1400) // passa o mouse: deve abrir
    xdo("mousemove", "858", "30"); await sleep(300)
    xdo("click", "1"); await sleep(900) // aba "Atividade"
    await new Promise((r) => app.on("exit", r))
    const rep = JSON.parse(fs.readFileSync(out, "utf8"))
    const notch = rep.windows.find((w) => w.title === "aureon-notch")
    console.log("texto do notch:", JSON.stringify(notch.text))
    ok(/Agora/.test(notch.text) && /Atividade/.test(notch.text), "passar o mouse abriu o painel")
    ok(/avisos? nesta sessão|Sem avisos/.test(notch.text), "clique real na aba Atividade trocou o conteúdo")
  } finally { try { app.kill() } catch {} x.kill() }
})().catch((e) => { console.error(e.message); process.exit(1) })
