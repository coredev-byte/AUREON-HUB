"use strict"
// Papel de parede do Windows, para o "vidro" dos widgets.
// Uma janela transparente não enxerga o que está atrás dela (o backdrop-filter do navegador só desfoca o
// conteúdo da própria janela). Por isso o app lê a imagem do papel de parede, reduz para uma miniatura
// leve e os widgets desenham essa miniatura desfocada, alinhada com a tela, por trás de si.
// Papel de parede animado: a imagem salva do Windows não corresponde ao que aparece na tela.
// Com o Wallpaper Engine, o app usa a imagem de prévia do papel de parede em uso (do config.json dele);
// é uma foto parada, mas desfocada dá as cores certas. Com o Lively, o vidro fica só translúcido.
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

/** caminhos dos papéis de parede escolhidos no config.json do Wallpaper Engine ("file" dentro de "selectedwallpapers") */
function weSelectedFiles(config) {
  const out = []
  const walk = (o, sel) => {
    if (!o || typeof o !== "object") return
    for (const [k, v] of Object.entries(o)) {
      const inSel = sel || k === "selectedwallpapers"
      if (typeof v === "string") { if (inSel && k === "file" && v) out.push(v) }
      else walk(v, inSel)
    }
  }
  walk(config, false)
  return out
}

/** imagem de prévia de um projeto do Wallpaper Engine (campo "preview" do project.json, ou preview.* na pasta) */
function wePreview(dir) {
  const tries = []
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"))
    if (typeof pj.preview === "string" && pj.preview) tries.push(path.join(dir, pj.preview))
  } catch { /* sem project.json: tenta os nomes comuns */ }
  for (const n of ["preview.jpg", "preview.jpeg", "preview.png", "preview.gif"]) tries.push(path.join(dir, n))
  for (const f of tries) { try { if (fs.statSync(f).isFile()) return f } catch { /* próximo */ } }
  return null
}

/** procura, nas pastas possíveis do Wallpaper Engine, a prévia do papel de parede em uso (primeiro monitor) */
function findWallpaperEngine(dirs) {
  for (const d of dirs) {
    let cfg
    try { cfg = JSON.parse(fs.readFileSync(path.join(d, "config.json"), "utf8")) } catch { continue }
    for (const f of weSelectedFiles(cfg)) {
      const prev = wePreview(path.dirname(f.replace(/[\\/]+$/, "")))
      if (prev) return prev
    }
  }
  return null
}

/** largura e altura de um GIF (o nativeImage não abre GIF; a janela do widget converte para imagem parada) */
function gifSize(buf) {
  if (buf.length < 10 || buf.toString("ascii", 0, 4) !== "GIF8") return null
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
}

function createWallpaper({ nativeImage, broadcast, platform = process.platform, env = process.env }) {
  let cache = null
  let sig = ""
  let timer = null
  let weDirsCache = null

  async function liveRunning() {
    const out = (await run("tasklist", ["/FO", "CSV", "/NH"])).toLowerCase()
    return LIVE_APPS.find((n) => out.includes('"' + n + '"')) ?? null
  }

  /** pastas onde o Wallpaper Engine pode estar: a do programa rodando, a da Steam e as bibliotecas da Steam */
  async function weDirs() {
    const dirs = []
    const exe = (await run("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      "(Get-Process wallpaper64,wallpaper32 -ErrorAction SilentlyContinue | Select-Object -First 1).Path"])).trim()
    if (exe) dirs.push(path.dirname(exe))
    const steam = regValue(await run("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]), "SteamPath")
    const libs = steam ? [steam] : []
    try {
      const vdf = fs.readFileSync(path.join(steam, "steamapps", "libraryfolders.vdf"), "utf8")
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, "\\"))
    } catch { /* sem Steam */ }
    for (const l of libs) dirs.push(path.join(l, "steamapps", "common", "wallpaper_engine"))
    return [...new Set(dirs)]
  }

  async function read() {
    // teste automatizado (Linux): imagem indicada por variável de ambiente
    if (platform !== "win32") {
      const f = env.AUREON_TEST_WALLPAPER
      if (!f) return { kind: "none", reason: "Disponível só no Windows" }
      return fromFile(f, "fill", null, fs.statSync(f).mtimeMs)
    }
    const desk = await run("reg", ["query", "HKCU\\Control Panel\\Desktop"])
    const colors = await run("reg", ["query", "HKCU\\Control Panel\\Colors", "/v", "Background"])
    const style = styleOf(regValue(desk, "WallpaperStyle"), regValue(desk, "TileWallpaper"))
    const color = rgbHex(regValue(colors, "Background"))
    const wp = regValue(desk, "WallPaper")
    const live = await liveRunning()
    if (live) {
      if (live.startsWith("wallpaper")) {
        // as pastas só são procuradas de novo se a prévia sumir (evita abrir o PowerShell a cada minuto)
        if (!weDirsCache) weDirsCache = await weDirs()
        const prev = findWallpaperEngine(weDirsCache)
        if (!prev) weDirsCache = null
        if (prev) {
          const r = fromFile(prev, "fill", color, fs.statSync(prev).mtimeMs, "wallpaper-engine")
          if (r.kind === "image") return r
        }
        return { kind: "none", reason: "Wallpaper Engine em uso e a prévia do papel de parede não foi encontrada" }
      }
      return { kind: "none", reason: "Papel de parede animado (Lively) em uso" }
    }
    // o Windows guarda uma cópia já convertida do papel de parede atual (inclusive em apresentação de slides)
    const transcoded = path.join(env.APPDATA || "", "Microsoft", "Windows", "Themes", "TranscodedWallpaper")
    for (const f of [transcoded, wp]) {
      try {
        if (!f) continue
        const st = fs.statSync(f)
        if (st.isFile() && st.size > 0) return fromFile(f, style, color, st.mtimeMs)
      } catch { /* tenta o próximo */ }
    }
    return color ? { kind: "color", color, sig: "c" + color } : { kind: "none", reason: "Papel de parede não encontrado" }
  }

  function fromFile(file, style, color, mtime, source = "windows") {
    const s = `${file}|${mtime}|${style}|${color}`
    if (cache && cache.sig === s) return cache
    const buf = fs.readFileSync(file)
    const gif = gifSize(buf)
    if (gif) {
      if (buf.length > 12 * 1024 * 1024) return { kind: "none", reason: "Prévia do papel de parede grande demais" }
      return { kind: "image", url: "data:image/gif;base64," + buf.toString("base64"), style, ...gif, color, source, sig: s }
    }
    // createFromBuffer reconhece JPEG/PNG pelo conteúdo (o arquivo do Windows não tem extensão)
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return color ? { kind: "color", color, sig: "c" + color } : { kind: "none", reason: "Formato do papel de parede não suportado" }
    const { width, height } = img.getSize()
    const small = width > THUMB_W ? img.resize({ width: THUMB_W, quality: "good" }) : img
    const url = "data:image/jpeg;base64," + small.toJPEG(82).toString("base64")
    return { kind: "image", url, style, width, height, color, source, sig: s }
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

module.exports = { createWallpaper, styleOf, rgbHex, regValue, weSelectedFiles, wePreview, findWallpaperEngine, gifSize }
