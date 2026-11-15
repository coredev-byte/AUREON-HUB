// Transmissão de ponta a ponta com o servidor de sinalização REAL e dois navegadores isolados
// (contextos separados = dois "PCs" sem nada em comum além do servidor).
// Limite honesto: os dois rodam na mesma máquina, então a mídia vai por candidatos locais (sem NAT de verdade).
const { chromium } = require("playwright")
const path = require("node:path")
const ROOT = path.resolve(__dirname, "../..")

const ok = (cond, msg) => { if (!cond) throw new Error("FALHOU: " + msg); console.log("ok -", msg) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { startServer } = await import(path.join(ROOT, "server/index.mjs"))
  const srv = await startServer({ port: 0, host: "127.0.0.1", trustProxy: false, maxPerIp: 50, hub: { turnUrls: [], stun: [] } })
  const vite = await (await import("vite")).createServer({ root: ROOT, server: { port: 5190, strictPort: false }, logLevel: "error" })
  await vite.listen()
  const base = vite.resolvedUrls.local[0]
  const signal = `ws://127.0.0.1:${srv.port}/ws`
  const proxy = process.env.HTTPS_PROXY
  const browser = await chromium.launch({ ...(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {}), args: ["--autoplay-policy=no-user-gesture-required"] })
  const results = {}
  try {
    const open = async (name) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await ctx.addInitScript(({ signal }) => {
        localStorage.setItem("aureon-browser-state", JSON.stringify({ settings: { accent: "#0B7BFA", surface: "#0E0E10", font: "inter", radius: 14, reduceMotion: true, launchAtLogin: false, signalUrl: signal, city: null, units: "c", hotkey: "", hotkeyOn: false, onboarded: true } }))
        // fonte de captura de teste: canvas animado (com cor por fonte) + tom de áudio
        window.__pcs = []
        const RPC = window.RTCPeerConnection
        window.RTCPeerConnection = function (...a) { const pc = new RPC(...a); window.__pcs.push(pc); return pc }
        window.RTCPeerConnection.prototype = RPC.prototype
        Object.assign(window.RTCPeerConnection, RPC)
        window.__streams = []
        window.__aureonTestCapture = async (o) => {
          const c = document.createElement("canvas"); c.width = 1280; c.height = 720
          const g = c.getContext("2d")
          const color = o.sourceId.includes("1") ? "#0050ff" : "#ff3000"
          let n = 0
          const draw = () => { g.fillStyle = color; g.fillRect(0, 0, 1280, 720); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText(String(n++), 80, 400) }
          draw(); const t = setInterval(draw, 33)
          const s = c.captureStream(30)
          if (o.audio) { const ac = new AudioContext(); const os = ac.createOscillator(); const d = ac.createMediaStreamDestination(); os.connect(d); os.start(); s.addTrack(d.stream.getAudioTracks()[0]) }
          s.getVideoTracks()[0].addEventListener("ended", () => clearInterval(t))
          window.__streams.push(s)
          return s
        }
      }, { signal })
      const p = await ctx.newPage()
      p.on("pageerror", (e) => console.log(`[${name}] erro:`, e.message))
      await p.goto(base + "index.html")
      await p.getByRole("button", { name: "Transmissão", exact: true }).first().click()
      return p
    }
    const host = await open("transmissor")
    const viewer = await open("espectador")
    const intruder = await open("intruso")

    // fontes de teste no navegador: duas "telas"
    for (const p of [host]) await p.evaluate(() => {})

    // 1) iniciar com áudio
    await host.getByRole("switch", { name: "Som do PC" }).click()
    await host.getByRole("button", { name: /Tela inteira/ }).click()
    await host.getByRole("button", { name: /Iniciar transmissão/ }).click()
    await host.getByText("AO VIVO").first().waitFor({ timeout: 15000 })
    const code = (await host.locator(".num").filter({ hasText: /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/ }).first().innerText()).trim()
    ok(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(code), "sala criada com convite " + code)

    // 2) código errado é recusado
    await intruder.getByRole("tab", { name: "Assistir" }).click()
    await intruder.getByLabel("Código do convite").fill(code.slice(0, -1) + (code.endsWith("Z") ? "Y" : "Z"))
    await intruder.getByRole("button", { name: "Entrar", exact: true }).click()
    await intruder.getByText("Convite inválido").waitFor({ timeout: 10000 })
    ok(true, "código errado recusado pelo servidor")

    // 3) entrada recusada pelo anfitrião
    await intruder.getByLabel("Código do convite").fill(code)
    await intruder.getByLabel("Seu nome").fill("Intruso")
    await intruder.getByRole("button", { name: "Entrar", exact: true }).click()
    await intruder.getByText("Esperando aprovação").waitFor({ timeout: 10000 })
    await host.getByText("Intruso").first().waitFor({ timeout: 10000 })
    await host.getByRole("button", { name: "Recusar" }).first().click()
    await intruder.getByText("recusou sua entrada").waitFor({ timeout: 10000 })
    ok(true, "anfitrião recusou o pedido e o intruso foi avisado")

    // 4) espectador aprovado recebe vídeo e áudio reais
    const t0 = Date.now()
    await viewer.getByRole("tab", { name: "Assistir" }).click()
    await viewer.getByLabel("Código do convite").fill(code)
    await viewer.getByLabel("Seu nome").fill("Amigo")
    await viewer.getByRole("button", { name: "Entrar", exact: true }).click()
    await host.getByText("Amigo").first().waitFor({ timeout: 10000 })
    await host.getByRole("button", { name: "Aceitar" }).first().click()
    await viewer.waitForFunction(() => { const v = document.querySelector("video"); return v && v.videoWidth > 0 && v.currentTime > 0.3 }, null, { timeout: 20000 })
    results.firstFrameMs = Date.now() - t0
    const vinfo = await viewer.evaluate(() => { const v = document.querySelector("video"); const s = v.srcObject; return { w: v.videoWidth, h: v.videoHeight, audio: s.getAudioTracks().length, video: s.getVideoTracks().length } })
    ok(vinfo.w > 0 && vinfo.video === 1, `vídeo recebido ${vinfo.w}x${vinfo.h} (primeiro quadro em ${results.firstFrameMs} ms após pedir para entrar, incluindo a aprovação)`)
    ok(vinfo.audio === 1, "áudio recebido")
    const color = async () => viewer.evaluate(() => { const v = document.querySelector("video"); const c = document.createElement("canvas"); c.width = 16; c.height = 16; const g = c.getContext("2d"); g.drawImage(v, 0, 0, 16, 16); const d = g.getImageData(1, 1, 1, 1).data; return [d[0], d[1], d[2]] })
    const frames = async () => viewer.evaluate(() => document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames)
    const f1 = await frames(); await sleep(2000); const f2 = await frames()
    results.fpsViewer = Math.round((f2 - f1) / 2)
    ok(f2 - f1 > 20, `quadros chegando continuamente (~${results.fpsViewer} fps no espectador)`)
    const c1 = await color()
    ok(c1[0] > 180 && c1[2] < 90, "imagem certa (vermelho da fonte 1): " + c1)

    // 5) estatísticas no transmissor
    await sleep(2500)
    const stats = await host.evaluate(() => [...document.querySelectorAll(".num")].map((e) => e.textContent).join(" | "))
    ok(/Mbit\/s/.test(stats), "estatísticas de envio aparecem no painel")

    // 6) trocar fonte sem derrubar o espectador
    await host.evaluate(() => {
      // a segunda "tela" de teste
      const orig = window.__aureonTestCapture
      window.__aureonTestCapture = (o) => orig({ ...o, sourceId: "screen:1:0" })
    })
    await host.getByRole("button", { name: "Trocar fonte" }).first().click()
    await host.getByRole("button", { name: /Tela inteira/ }).first().click()
    await sleep(2500)
    const c2 = await color()
    ok(c2[2] > 180 && c2[0] < 90, "troca de fonte chegou ao espectador sem reconectar (azul): " + c2)
    const oldEnded = await host.evaluate(() => window.__streams[0].getTracks().every((t) => t.readyState === "ended"))
    ok(oldEnded, "trilhas da fonte antiga foram paradas")

    // 7) qualidade
    await host.getByRole("group", { name: "Qualidade" }).getByRole("button", { name: "Econômico" }).click()
    const f3 = await frames(); await sleep(1500); const f4 = await frames()
    ok(f4 - f3 > 10, "trocar a qualidade não interrompe o vídeo")

    // 8) queda do servidor de sinalização: mídia continua e os dois retomam a sala
    srv.dropAll()
    await sleep(500)
    const f5 = await frames(); await sleep(1500); const f6 = await frames()
    ok(f6 - f5 > 10, "vídeo continua durante a queda do servidor (vai direto entre os PCs)")
    await host.waitForFunction(() => !document.body.innerText.includes("Reconectando ao servidor"), null, { timeout: 15000 })
    await sleep(1500)
    ok(srv.hub.rooms.size === 1 && srv.hub.clients.size >= 2, "transmissor e espectador retomaram a sala após a queda")

    // 9) espectador sai: transmissor vê 0
    await viewer.getByRole("button", { name: "Sair" }).click()
    await host.getByText("Assistindo (0)").waitFor({ timeout: 10000 })
    ok(true, "espectador saiu e o transmissor atualizou a lista")
    const vClosed = await viewer.evaluate(() => window.__pcs.every((pc) => pc.signalingState === "closed"))
    ok(vClosed, "conexões do espectador fechadas ao sair")

    // 10) entra de novo e o transmissor encerra
    await viewer.getByLabel("Código do convite").fill(code)
    await viewer.getByRole("button", { name: "Entrar", exact: true }).click()
    await host.getByRole("button", { name: "Aceitar" }).first().click()
    await viewer.waitForFunction(() => { const v = document.querySelector("video"); return v && v.videoWidth > 0 }, null, { timeout: 20000 })
    await host.getByRole("button", { name: "Encerrar" }).first().click()
    await viewer.getByText("encerrada por quem transmitia").waitFor({ timeout: 10000 })
    ok(true, "espectador avisado do encerramento")
    const left = await host.evaluate(() => ({ tracks: window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== "ended").length, pcs: window.__pcs.filter((pc) => pc.signalingState !== "closed").length }))
    ok(left.tracks === 0 && left.pcs === 0, `nenhuma trilha ou conexão sobrando no transmissor (trilhas vivas: ${left.tracks}, conexões abertas: ${left.pcs})`)
    const vleft = await viewer.evaluate(() => window.__pcs.filter((pc) => pc.signalingState !== "closed").length)
    ok(vleft === 0, "nenhuma conexão sobrando no espectador")
    await sleep(300)
    ok(srv.hub.rooms.size === 0, "sala removida do servidor")
    console.log("RESULTADOS", JSON.stringify(results))
  } finally {
    await browser.close(); await vite.close(); await srv.close()
  }
}
main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1) })
