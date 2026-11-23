// Transmissão forçada pela retransmissão (TURN): coturn local com "use-auth-secret" e as credenciais
// temporárias geradas pelo servidor de sinalização (mesmo esquema de produção).
// Os dois lados usam iceTransportPolicy "relay": se o vídeo chega, passou pelo TURN.
const { chromium } = require("playwright")
const { spawn, execFileSync } = require("node:child_process")
const path = require("node:path")
const ROOT = path.resolve(__dirname, "../..")
const ok = (c, m) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  try { execFileSync("which", ["turnserver"]) } catch { console.log("pulado: turnserver (coturn) não instalado"); return }
  const SECRET = "segredo-de-teste-" + Date.now()
  const turn = spawn("turnserver", ["-n", "--listening-ip=127.0.0.1", "--relay-ip=127.0.0.1", "--listening-port=34780", "--min-port=49300", "--max-port=49400",
    "--use-auth-secret", "--static-auth-secret=" + SECRET, "--realm=aureon.test", "--allow-loopback-peers", "--no-cli", "--no-tls", "--no-dtls", "--log-file=stdout", "--simple-log"], { stdio: ["ignore", "pipe", "pipe"] })
  let turnLog = ""
  turn.stdout.on("data", (d) => { turnLog += d })
  await sleep(1200)
  const { startServer } = await import(path.join(ROOT, "server/index.mjs"))
  const srv = await startServer({ port: 0, host: "127.0.0.1", trustProxy: false, maxPerIp: 50, hub: { stun: [], turnUrls: ["turn:127.0.0.1:34780?transport=udp"], turnSecret: SECRET } })
  const vite = await (await import("vite")).createServer({ root: ROOT, server: { port: 5191 }, logLevel: "error" })
  await vite.listen()
  const base = vite.resolvedUrls.local[0]
  const signal = `ws://127.0.0.1:${srv.port}/ws`
  const proxy = process.env.HTTPS_PROXY
  const browser = await chromium.launch({ ...(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {}) })
  try {
    const open = async () => {
      const ctx = await browser.newContext()
      await ctx.addInitScript(({ signal }) => {
        localStorage.setItem("aureon-browser-state", JSON.stringify({ settings: { accent: "#0B7BFA", surface: "#0E0E10", font: "inter", radius: 14, reduceMotion: true, launchAtLogin: false, signalUrl: signal, city: null, units: "c", hotkey: "", hotkeyOn: false, onboarded: true }, share: { quality: "balanced", audio: false, approval: false, preferHardware: true, name: "Teste" } }))
        window.__pcs = []
        const RPC = window.RTCPeerConnection
        // força tudo pela retransmissão
        window.RTCPeerConnection = function (cfg = {}) { const pc = new RPC({ ...cfg, iceTransportPolicy: "relay" }); window.__pcs.push(pc); return pc }
        window.RTCPeerConnection.prototype = RPC.prototype
        Object.assign(window.RTCPeerConnection, RPC)
        window.__aureonTestCapture = async () => {
          const c = document.createElement("canvas"); c.width = 640; c.height = 360
          const g = c.getContext("2d"); let n = 0
          setInterval(() => { g.fillStyle = "#30c060"; g.fillRect(0, 0, 640, 360); g.fillStyle = "#fff"; g.fillText(String(n++), 20, 40) }, 33)
          return c.captureStream(30)
        }
      }, { signal })
      const p = await ctx.newPage()
      await p.goto(base + "index.html")
      await p.getByRole("button", { name: "Transmissão", exact: true }).first().click()
      return p
    }
    const host = await open(), viewer = await open()
    await host.getByLabel("Nome da nova sala").fill("teste-turn")
    await host.getByLabel("Senha da nova sala").fill("senha123")
    await host.getByRole("button", { name: "Criar sala" }).click()
    await host.getByLabel("Nome da sala", { exact: true }).waitFor({ timeout: 15000 })
    await viewer.getByLabel("Nome da sala", { exact: true }).fill("teste-turn")
    await viewer.getByLabel("Senha da sala", { exact: true }).fill("senha123")
    await viewer.getByRole("button", { name: "Entrar", exact: true }).click()
    await viewer.getByText("Na sala (2)").waitFor({ timeout: 15000 })
    await host.getByRole("button", { name: "Transmitir minha tela" }).first().click()
    await host.getByRole("button", { name: /Tela inteira/ }).first().click()
    await host.getByRole("button", { name: "Começar a transmitir" }).click()
    await viewer.getByRole("button", { name: "Assistir", exact: true }).first().click()
    await viewer.waitForFunction(() => { const v = document.querySelector(".dc-tile video"); return v && v.videoWidth > 0 && v.currentTime > 0.3 }, null, { timeout: 25000 })
    const pair = await viewer.evaluate(async () => {
      const pc = window.__pcs[window.__pcs.length - 1]
      const r = []; (await pc.getStats()).forEach((x) => r.push(x))
      const p = r.find((x) => x.type === "candidate-pair" && x.nominated && x.state === "succeeded")
      const loc = r.find((x) => x.id === p?.localCandidateId), rem = r.find((x) => x.id === p?.remoteCandidateId)
      return { local: loc?.candidateType, remote: rem?.candidateType }
    })
    ok(pair.local === "relay" || pair.remote === "relay", `vídeo chegou pela retransmissão TURN (candidatos: ${pair.local} ↔ ${pair.remote})`)
    const f1 = await viewer.evaluate(() => document.querySelector(".dc-tile video").getVideoPlaybackQuality().totalVideoFrames)
    await sleep(2000)
    const f2 = await viewer.evaluate(() => document.querySelector(".dc-tile video").getVideoPlaybackQuality().totalVideoFrames)
    ok(f2 - f1 > 20, `quadros contínuos pelo TURN (~${Math.round((f2 - f1) / 2)} fps)`)
    ok(/session|allocation|ALLOCATE/i.test(turnLog), "coturn registrou a alocação (credencial temporária aceita)")
    await host.getByRole("button", { name: "Encerrar sala" }).click()
    await viewer.getByText("encerrada").waitFor({ timeout: 10000 })
    ok(true, "encerramento pelo TURN avisado ao espectador")
  } finally {
    await browser.close(); await vite.close(); await srv.close(); turn.kill()
  }
}
main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1) })
