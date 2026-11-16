"use strict"
// Papel de parede do Windows, para o "vidro" dos widgets.
// Uma janela transparente não enxerga o que está atrás dela (o backdrop-filter do navegador só desfoca o
// conteúdo da própria janela). Por isso o app lê a imagem do papel de parede, reduz para uma miniatura
// leve e os widgets desenham essa miniatura desfocada, alinhada com a tela, por trás de si.
// Papel de parede animado (Wallpaper Engine, Lively): a imagem salva não corresponde ao que aparece na tela,
// então o vidro fica só translúcido (sem fingir um desfoque errado).
const fs = require("node:fs")
const path = require("node:path")
const { execFile } = require("node:child_process")

const LIVE_APPS = ["wallpaper32.exe", "wallpaper64.exe", "lively.exe", "livelywpf.exe", "livelywallpaper.exe"]
const STYLE = { 0: "center", 2: "stretch", 6: "fit", 10: "fill", 22: "span" }
const THUMB_W = 960

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: 5000, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? "" : String(out)))
})

/** valor de uma chave do registro (texto) ou "" */
function regValue(out, name) {
  const m = new RegExp("^\\s*" + name + "\\s+REG_\\w+\\s+(.*)$", "mi").exec(out)
  return m ? m[1].trim() : ""
}

/** estilo do Windows (WallpaperStyle + TileWallpaper) para o nome usado no app */
function styleOf(style, tile) {
  if (String(tile) === "1") return "tile"
  return STYLE[Number(style)] ?? "fill"
}

/** "R G B" do registro para #rrggbb */
function rgbHex(s) {
  const p = String(s || "").trim().split(/\s+/).map(Number)
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return "#" + p.map((n) => n.toString(16).padStart(2, "0")).join("")
}

function createWallpaper({ nativeImage, broadcast, platform = process.platform, env = process.env }) {
  let cache = null
  let sig = ""
  let timer = null

  async function liveRunning() {
    const out = (await run("tasklist", ["/FO", "CSV", "/NH"])).toLowerCase()
    return LIVE_APPS.some((n) => out.includes('"' + n + '"'))
  }

  async function read() {
    // teste automatizado (Linux): imagem indicada por variável de ambiente
    if (platform !== "win32") {
      const f = env.AUREON_TEST_WALLPAPER
      if (!f) return { kind: "none", reason: "Disponível só no Windows." }
      return fromFile(f, "fill", null, fs.statSync(f).mtimeMs)
    }
    const desk = await run("reg", ["query", "HKCU\\Control Panel\\Desktop"])
    const colors = await run("reg", ["query", "HKCU\\Control Panel\\Colors", "/v", "Background"])
    const style = styleOf(regValue(desk, "WallpaperStyle"), regValue(desk, "TileWallpaper"))
    const color = rgbHex(regValue(colors, "Background"))
    const wp = regValue(desk, "WallPaper")
    if (await liveRunning()) return { kind: "none", reason: "Papel de parede animado em uso." }
    // o Windows guarda uma cópia já convertida do papel de parede atual (inclusive em apresentação de slides)
    const transcoded = path.join(env.APPDATA || "", "Microsoft", "Windows", "Themes", "TranscodedWallpaper")
    for (const f of [transcoded, wp]) {
      try {
        if (!f) continue
        const st = fs.statSync(f)
        if (st.isFile() && st.size > 0) return fromFile(f, style, color, st.mtimeMs)
      } catch { /* tenta o próximo */ }
    }
    return color ? { kind: "color", color, sig: "c" + color } : { kind: "none", reason: "Papel de parede não encontrado." }
  }

  function fromFile(file, style, color, mtime) {
    const s = `${file}|${mtime}|${style}|${color}`
    if (cache && cache.sig === s) return cache
    // createFromBuffer reconhece JPEG/PNG pelo conteúdo (o arquivo do Windows não tem extensão)
    const img = nativeImage.createFromBuffer(fs.readFileSync(file))
    if (img.isEmpty()) return color ? { kind: "color", color, sig: "c" + color } : { kind: "none", reason: "Formato do papel de parede não suportado." }
    const { width, height } = img.getSize()
    const small = width > THUMB_W ? img.resize({ width: THUMB_W, quality: "good" }) : img
    const url = "data:image/jpeg;base64," + small.toJPEG(82).toString("base64")
    return { kind: "image", url, style, width, height, color, sig: s }
  }

  async function refresh() {
    let next
    try { next = await read() } catch (e) { next = { kind: "none", reason: String(e?.message || e) } }
    const s = next.sig ?? next.kind + (next.reason || "")
    cache = next
    if (s !== sig) { sig = s; broadcast("wallpaper:changed", next) }
    return next
  }

  return {
    get: async () => cache ?? refresh(),
    refresh,
    /** confere de tempos em tempos (troca de papel de parede, apresentação de slides) */
    start(ms = 60000) { if (!timer) { timer = setInterval(() => void refresh(), ms); timer.unref?.() } },
    stop() { clearInterval(timer); timer = null },
  }
}

module.exports = { createWallpaper, styleOf, rgbHex, regValue }
