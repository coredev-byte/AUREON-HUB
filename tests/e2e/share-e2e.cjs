// Sala de transmissão de ponta a ponta com o servidor de sinalização REAL e navegadores isolados
// (contextos separados = "PCs" sem nada em comum além do servidor).
// Cenário estilo Discord: Ana cria a sala; Bia e Caio entram; Ana e Bia transmitem AO MESMO TEMPO;
// Caio assiste as duas telas juntas. Queda do servidor, troca de tela, troca de dono e encerramento.
// Limite honesto: todos rodam na mesma máquina, então a mídia vai por candidatos locais (sem NAT de verdade).
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
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
      await ctx.addInitScript(({ signal, name }) => {
        localStorage.setItem("aureon-browser-state", JSON.stringify({
          settings: { accent: "#0B7BFA", surface: "#0E0E10", font: "inter", radius: 14, reduceMotion: true, launchAtLogin: false, signalUrl: signal, city: null, units: "c", hotkey: "", hotkeyOn: false, onboarded: true },
          share: { quality: "auto", audio: false, approval: true, preferHardware: true, name },
        }))
        window.__pcs = []
        const RPC = window.RTCPeerConnection
        window.RTCPeerConnection = function (...a) { const pc = new RPC(...a); window.__pcs.push(pc); return pc }
        window.RTCPeerConnection.prototype = RPC.prototype
        Object.assign(window.RTCPeerConnection, RPC)
        window.__streams = []
        // imitação da captura de som por programa do Windows (sem o Discord): tom de 440 Hz em PCM 16 bits
        window.__sysAudioChunks = 0
        window.__aureonTestSysAudio = (push) => {
          let ph = 0
          const t = setInterval(() => {
            const n = 960, a = new Int16Array(n * 2)
            for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(ph) * 12000); a[2 * i] = v; a[2 * i + 1] = v; ph += (2 * Math.PI * 440) / 48000 }
            window.__sysAudioChunks++
            push(a.buffer)
          }, 20)
          return { excluded: "discord", stop: () => clearInterval(t) }
        }
        // fonte de teste: canvas animado com cor por "tela" (0 vermelho, 1 azul, 2 verde) + tom de áudio
        window.__screen = 0
        window.__aureonTestCapture = async (o) => {
          const c = document.createElement("canvas"); c.width = 1280; c.height = 720
          const g = c.getContext("2d")
          const color = ["#ff3000", "#0050ff", "#00c040"][window.__screen]
          let n = 0
          const draw = () => { g.fillStyle = color; g.fillRect(0, 0, 1280, 720); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText(String(n++), 80, 400) }
          draw(); const t = setInterval(draw, 33)
          const s = c.captureStream(30)
          if (o.audio) { const ac = new AudioContext(); const os = ac.createOscillator(); const d = ac.createMediaStreamDestination(); os.connect(d); os.start(); s.addTrack(d.stream.getAudioTracks()[0]) }
          s.getVideoTracks()[0].addEventListener("ended", () => clearInterval(t))
          window.__streams.push(s)
          return s
        }
      }, { signal, name })
      const p = await ctx.newPage()
      p.on("pageerror", (e) => console.log(`[${name}] erro:`, e.message))
      await p.goto(base + "index.html")
      await p.getByRole("button", { name: "Transmissão", exact: true }).first().click()
      return p
    }
    const tile = (p, who) => p.locator(`[aria-label="Tela de ${who}"] video`)
    const colorOf = (p, who) => tile(p, who).evaluate((v) => { const c = document.createElement("canvas"); c.width = 16; c.height = 16; const g = c.getContext("2d"); g.drawImage(v, 0, 0, 16, 16); const d = g.getImageData(1, 1, 1, 1).data; return [d[0], d[1], d[2]] })
    const framesOf = (p, who) => tile(p, who).evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames)
    const playing = (p, who) => p.waitForFunction((w) => { const v = document.querySelector(`[aria-label="Tela de ${w}"] video`); return v && v.videoWidth > 0 && v.currentTime > 0.3 }, who, { timeout: 20000 })
    const share = async (p, audio = false, mode = "all") => {
      await p.getByRole("button", { name: "Transmitir minha tela" }).first().click()
      if (audio) await p.getByRole("switch", { name: "Som do PC" }).click()
      if (audio) {
        await p.getByRole("combobox", { name: "Qual som" }).click()
        await p.getByRole("option", { name: mode === "no-discord" ? "Tudo menos o Discord" : "Tudo do PC" }).click()
      }
      await p.getByRole("button", { name: /Tela inteira/ }).first().click()
      await p.getByRole("button", { name: "Começar a transmitir" }).click()
      await p.getByRole("button", { name: "Parar", exact: true }).waitFor({ timeout: 10000 })
    }
    const enter = async (p, room, pw, owner, name) => {
      await p.getByLabel("Nome da sala", { exact: true }).fill(room)
      await p.getByLabel("Senha da sala", { exact: true }).fill(pw)
      await p.getByRole("button", { name: "Entrar", exact: true }).click()
      await owner.getByText(name).first().waitFor({ timeout: 10000 })
      await owner.getByRole("button", { name: "Aceitar" }).first().click()
      await p.getByText("Na sala (").waitFor({ timeout: 10000 })
    }

    const ana = await open("Ana"), bia = await open("Bia"), caio = await open("Caio"), intruso = await open("Intruso")

    // 1) criar sala com nome e senha escolhidos
    const ROOM = "jogatina-" + Date.now().toString(36).slice(-4), PW = "pipoca123"
    await ana.getByLabel("Nome da nova sala").fill("Jogatina " + ROOM.slice(9))
    await ana.getByLabel("Senha da nova sala").fill(PW)
    await ana.getByRole("button", { name: "Criar sala" }).click()
    await ana.getByLabel("Nome da sala", { exact: true }).waitFor({ timeout: 15000 })
    const shown = (await ana.getByLabel("Nome da sala", { exact: true }).innerText()).trim()
    ok(shown === ROOM, "sala criada com o nome escolhido: " + shown)

    // 2) senha errada e entrada recusada
    await intruso.getByLabel("Nome da sala", { exact: true }).fill(ROOM)
    await intruso.getByLabel("Senha da sala", { exact: true }).fill("pipoca124")
    await intruso.getByRole("button", { name: "Entrar", exact: true }).click()
    await intruso.getByText("Sala ou senha incorreta").waitFor({ timeout: 10000 })
    ok(true, "senha errada recusada pelo servidor")
    await intruso.getByLabel("Nome da sala", { exact: true }).fill(ROOM.toUpperCase())
    await intruso.getByLabel("Senha da sala", { exact: true }).fill(PW)
    await intruso.getByRole("button", { name: "Entrar", exact: true }).click()
    await intruso.getByText("Esperando aprovação").waitFor({ timeout: 10000 })
    await ana.getByText("Intruso").first().waitFor({ timeout: 10000 })
    await ana.getByRole("button", { name: "Recusar" }).first().click()
    await intruso.getByText("recusou sua entrada").waitFor({ timeout: 10000 })
    ok(true, "dono recusou o pedido (o nome da sala vale com maiúsculas também)")

    // 3) Bia e Caio entram
    await enter(bia, ROOM, PW, ana, "Bia")
    await enter(caio, ROOM, PW, ana, "Caio")
    await ana.getByText("Na sala (3)").waitFor({ timeout: 10000 })
    ok(true, "três pessoas na mesma sala")

    // 4) Ana transmite com som; Bia assiste
    const t0 = Date.now()
    await share(ana, true, "no-discord")
    await bia.getByRole("button", { name: "Assistir", exact: true }).first().click()
    await playing(bia, "Ana")
    results.firstFrameMs = Date.now() - t0
    const a1 = await tile(bia, "Ana").evaluate((v) => ({ w: v.videoWidth, audio: v.srcObject.getAudioTracks().length }))
    ok(a1.w > 0, `Bia recebe a tela da Ana (${a1.w} px de largura, primeiro quadro ${results.firstFrameMs} ms depois de começar)`)
    ok(a1.audio === 1, "som do PC da Ana chega")
    await ana.getByText("Som sem o Discord").waitFor({ timeout: 5000 })
    // o som recebido tem conteúdo de verdade (o tom de teste), não só uma trilha muda
    const rms = await tile(bia, "Ana").evaluate(async (v) => {
      const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(v.srcObject); const an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an)
      const buf = new Float32Array(2048); let best = 0
      for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 100)); an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; best = Math.max(best, Math.sqrt(s / buf.length)) }
      await ctx.close(); return best
    })
    ok(rms > 0.05, `"Tudo menos o Discord": o som do PC (pela captura por programa) chega a quem assiste (nível ${rms.toFixed(3)})`)
    const cA = await colorOf(bia, "Ana")
    ok(cA[0] > 180 && cA[2] < 90, "imagem certa (vermelho): " + cA)
    // tela cheia: entra pelo botão e SAI pelo botão fixo "Sair da tela cheia" (e também por Esc)
    const tileBox = bia.getByLabel("Tela de Ana")
    await tileBox.hover()
    await tileBox.getByRole("button", { name: "Tela cheia", exact: true }).click()
    await bia.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 })
    await bia.getByRole("button", { name: "Sair da tela cheia" }).first().click()
    await bia.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 })
    await tileBox.hover()
    await tileBox.getByRole("button", { name: "Tela cheia", exact: true }).click()
    await bia.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 })
    await bia.keyboard.press("Escape")
    const escOut = await bia.waitForFunction(() => !document.fullscreenElement, null, { timeout: 3000 }).then(() => true, () => false)
    if (!escOut) await bia.evaluate(() => document.exitFullscreen()) // navegador sem janela pode não repassar o Esc
    await bia.waitForTimeout(300)
    ok(!(await bia.evaluate(() => !!document.fullscreenElement)) && await bia.getByRole("button", { name: "Sair da tela cheia" }).count() === 0,
      "tela cheia entra e sai pelo botão" + (escOut ? " e pelo Esc" : ""))

    // 5) Bia transmite AO MESMO TEMPO (outra tela, azul); Caio assiste as duas
    await bia.evaluate(() => { window.__screen = 1 })
    await share(bia)
    await caio.getByRole("button", { name: "Assistir", exact: true }).first().click()
    await caio.getByRole("button", { name: "Assistir", exact: true }).first().click()
    await playing(caio, "Ana"); await playing(caio, "Bia")
    const [ca, cb] = [await colorOf(caio, "Ana"), await colorOf(caio, "Bia")]
    ok(ca[0] > 180 && cb[2] > 180, `Caio assiste as duas telas juntas na mesma sala (Ana ${ca} · Bia ${cb})`)
    const f1 = await framesOf(caio, "Bia"); await sleep(2000); const f2 = await framesOf(caio, "Bia")
    results.fpsViewer = Math.round((f2 - f1) / 2)
    ok(f2 - f1 > 20, `quadros contínuos (~${results.fpsViewer} fps)`)
    await ana.getByText("2 assistindo").waitFor({ timeout: 10000 })
    ok(true, "Ana vê que 2 pessoas assistem a tela dela")

    // 6) estatísticas e troca de tela sem derrubar ninguém
    await sleep(2500)
    ok(/Mbit\/s/.test(await ana.locator(".dc-live-info").first().innerText()), "estatísticas de envio aparecem")
    await ana.evaluate(() => { window.__screen = 2 })
    await ana.getByRole("button", { name: "Trocar tela" }).click()
    await ana.getByRole("button", { name: /Tela inteira/ }).first().click()
    await sleep(2500)
    const cg = await colorOf(caio, "Ana")
    ok(cg[1] > 150 && cg[0] < 90, "troca de tela da Ana chegou sem reconectar (verde): " + cg)
    ok(await ana.evaluate(() => window.__streams[0].getTracks().every((t) => t.readyState === "ended")), "trilhas da tela antiga paradas")

    // 7) qualidade
    await ana.getByRole("button", { name: "Qualidade da transmissão" }).click()
    await ana.getByRole("group", { name: "Qualidade" }).getByRole("button", { name: "Econômico" }).click()
    const f3 = await framesOf(caio, "Ana"); await sleep(1500); const f4 = await framesOf(caio, "Ana")
    ok(f4 - f3 > 10, "trocar a qualidade não interrompe o vídeo")

    // 8) queda do servidor: mídia continua e todos retomam a sala
    srv.dropAll()
    await sleep(500)
    const f5 = await framesOf(caio, "Bia"); await sleep(1500); const f6 = await framesOf(caio, "Bia")
    ok(f6 - f5 > 10, "vídeo continua durante a queda do servidor (vai direto entre os PCs)")
    for (const p of [ana, bia, caio]) await p.waitForFunction(() => !document.body.innerText.includes("Reconectando ao servidor"), null, { timeout: 20000 })
    await sleep(1000)
    ok(srv.hub.rooms.size === 1 && srv.hub.clients.size >= 3, "os três retomaram a sala após a queda")

    // 9) Caio para de assistir a Bia; Ana para de transmitir
    await caio.getByRole("button", { name: "Parar de assistir Bia" }).first().click()
    await bia.getByText("0 assistindo").waitFor({ timeout: 10000 })
    ok(true, "Bia vê que ninguém mais assiste")
    await ana.getByRole("button", { name: "Parar", exact: true }).click()
    await caio.getByText("Ana parou de transmitir").waitFor({ timeout: 10000 })
    ok(true, "quem assistia a Ana foi avisado que ela parou")
    ok(await ana.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).every((t) => t.readyState === "ended")), "nenhuma trilha da Ana continua capturando")
    const c1 = await ana.evaluate(() => window.__sysAudioChunks); await sleep(300); const c2 = await ana.evaluate(() => window.__sysAudioChunks)
    ok(c1 === c2, "captura do som sem o Discord parou junto")

    // 10) dona sai: a sala passa para a Bia, que continua transmitindo
    await ana.getByRole("button", { name: "Sair da sala" }).click()
    await bia.getByRole("button", { name: "Encerrar sala" }).waitFor({ timeout: 10000 })
    ok(true, "Ana saiu e a Bia passou a cuidar da sala")
    ok(await ana.evaluate(() => window.__pcs.every((pc) => pc.signalingState === "closed")), "conexões da Ana fechadas ao sair")
    await caio.getByRole("button", { name: "Assistir", exact: true }).first().click()
    await playing(caio, "Bia")
    ok(true, "a transmissão da Bia segue na sala depois da troca de dono")

    // 11) Bia encerra para todos
    await bia.getByRole("button", { name: "Encerrar sala" }).click()
    await caio.getByText("A sala foi encerrada").waitFor({ timeout: 10000 })
    ok(true, "Caio avisado do encerramento")
    for (const [n, p] of [["Bia", bia], ["Caio", caio]]) {
      const left = await p.evaluate(() => ({ tracks: window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== "ended").length, pcs: window.__pcs.filter((pc) => pc.signalingState !== "closed").length }))
      ok(left.tracks === 0 && left.pcs === 0, `nada sobrando com ${n} (trilhas vivas: ${left.tracks}, conexões abertas: ${left.pcs})`)
    }
    await sleep(300)
    ok(srv.hub.rooms.size === 0, "sala removida do servidor")
    console.log("RESULTADOS", JSON.stringify(results))
  } finally {
    await browser.close(); await vite.close(); await srv.close()
  }
}
main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1) })
