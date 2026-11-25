// Vidro dos widgets: leitura do papel de parede (registro do Windows) e alinhamento da cópia desfocada com a tela.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { placement } from "../src/shared/wallpaperPlacement.ts"
const require = createRequire(import.meta.url)
const { createWallpaper, styleOf, rgbHex, regValue, weSelectedFiles, wePreview, findWallpaperEngine, gifSize } = require("../electron/integrations/wallpaper.cjs")

test("registro: lê WallPaper, estilo e cor de fundo", () => {
  const out = "\r\nHKEY_CURRENT_USER\\Control Panel\\Desktop\r\n    WallPaper    REG_SZ    C:\\Users\\a\\Pictures\\praia.jpg\r\n    WallpaperStyle    REG_SZ    10\r\n    TileWallpaper    REG_SZ    0\r\n"
  assert.equal(regValue(out, "WallPaper"), "C:\\Users\\a\\Pictures\\praia.jpg")
  assert.equal(styleOf(regValue(out, "WallpaperStyle"), regValue(out, "TileWallpaper")), "fill")
  assert.equal(styleOf("6", "0"), "fit")
  assert.equal(styleOf("2", "0"), "stretch")
  assert.equal(styleOf("0", "1"), "tile")
  assert.equal(styleOf("0", "0"), "center")
  assert.equal(styleOf("22", "0"), "span")
  assert.equal(styleOf("99", "0"), "fill")
  assert.equal(rgbHex("0 120 215"), "#0078d7")
  assert.equal(rgbHex("300 0 0"), null)
})

test("posição da imagem em cada estilo (tela 1920×1080)", () => {
  const scr = { width: 1920, height: 1080 }
  // preencher: cobre a tela, cortando o que sobra, centralizado
  assert.deepEqual(placement("fill", { width: 1000, height: 1000 }, scr), { x: 0, y: -420, w: 1920, h: 1920, repeat: false })
  // ajustar: cabe inteira, com faixas
  assert.deepEqual(placement("fit", { width: 1000, height: 1000 }, scr), { x: 420, y: 0, w: 1080, h: 1080, repeat: false })
  assert.deepEqual(placement("stretch", { width: 10, height: 10 }, scr), { x: 0, y: 0, w: 1920, h: 1080, repeat: false })
  // centralizar: tamanho real em pixels do monitor (escala 150% → menor em px do CSS)
  assert.deepEqual(placement("center", { width: 600, height: 300 }, scr, 1.5), { x: 760, y: 440, w: 400, h: 200, repeat: false })
  assert.equal(placement("tile", { width: 64, height: 64 }, scr).repeat, true)
})

test("fora do Windows não inventa papel de parede; com imagem de teste, gera miniatura e avisa mudança", async () => {
  const sent = []
  const fakeImg = (w, h) => ({ isEmpty: () => false, getSize: () => ({ width: w, height: h }), resize: ({ width }) => fakeImg(width, Math.round((h * width) / w)), toJPEG: () => Buffer.from("jpg") })
  const nativeImage = { createFromBuffer: () => fakeImg(3840, 2160) }
  const none = createWallpaper({ nativeImage, broadcast: () => {}, platform: "linux", env: {} })
  assert.equal((await none.get()).kind, "none")

  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wp-")), "wall")
  fs.writeFileSync(f, "x")
  const wp = createWallpaper({ nativeImage, broadcast: (ch, v) => sent.push([ch, v.kind]), platform: "linux", env: { AUREON_TEST_WALLPAPER: f } })
  const r = await wp.get()
  assert.equal(r.kind, "image")
  assert.equal(r.width, 3840)
  assert.match(r.url, /^data:image\/jpeg;base64,/)
  await wp.refresh()
  assert.deepEqual(sent, [["wallpaper:changed", "image"]], "sem mudança, não avisa de novo")
})

test("Wallpaper Engine: acha a prévia do papel de parede em uso pelo config.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "we-"))
  const install = path.join(root, "wallpaper_engine")
  const proj = path.join(root, "workshop", "content", "431960", "123")
  fs.mkdirSync(install, { recursive: true }); fs.mkdirSync(proj, { recursive: true })
  fs.writeFileSync(path.join(proj, "project.json"), JSON.stringify({ title: "Cidade", preview: "preview.gif", type: "scene" }))
  // GIF mínimo 640×360 (cabeçalho)
  const gif = Buffer.alloc(13); gif.write("GIF89a", 0, "ascii"); gif.writeUInt16LE(640, 6); gif.writeUInt16LE(360, 8)
  fs.writeFileSync(path.join(proj, "preview.gif"), gif)
  const cfg = { jogador: { general: { wallpaperconfig: { selectedwallpapers: { Monitor0: { file: proj.replace(/\\/g, "/") + "/scene.pkg", playlist: {} } } } }, browser: { file: "/nao/e/esse.json" } } }
  fs.writeFileSync(path.join(install, "config.json"), JSON.stringify(cfg))

  assert.deepEqual(weSelectedFiles(cfg), [proj.replace(/\\/g, "/") + "/scene.pkg"], "só os arquivos dentro de selectedwallpapers")
  assert.equal(wePreview(proj), path.join(proj, "preview.gif"))
  assert.equal(findWallpaperEngine([path.join(root, "nao-existe"), install]), path.join(proj, "preview.gif"))
  assert.deepEqual(gifSize(gif), { width: 640, height: 360 })
  assert.equal(gifSize(Buffer.from("\xff\xd8\xff\xe0jpeg")), null)
  // sem "preview" no project.json, usa preview.jpg da pasta
  const p2 = path.join(root, "p2"); fs.mkdirSync(p2); fs.writeFileSync(path.join(p2, "preview.jpg"), "x")
  assert.equal(wePreview(p2), path.join(p2, "preview.jpg"))
  assert.equal(findWallpaperEngine([path.join(root, "p2")]), null, "pasta sem config.json não conta")
})
