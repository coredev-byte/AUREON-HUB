import test from "node:test"
import assert from "node:assert/strict"
import { adapt, grade, initialSend, worst, PROFILES } from "../src/share/quality.ts"

const good = { fps: 30, width: 1920, height: 1080, kbps: 4000, limit: "none", rttMs: 40, lossPct: 0 }
test("perfis pedidos: 720p30, 1080p30, 1080p60 e automático", () => {
  assert.deepEqual([PROFILES.eco.height, PROFILES.eco.fps], [720, 30])
  assert.deepEqual([PROFILES.balanced.height, PROFILES.balanced.fps], [1080, 30])
  assert.deepEqual([PROFILES.quality.height, PROFILES.quality.fps], [1080, 60])
  assert.equal(PROFILES.auto.label, "Automático")
})
test("rede congestionada: reduz taxa e, se preciso, resolução", () => {
  let st = initialSend(PROFILES.auto)
  for (let i = 0; i < 6; i++) st = adapt(st, { ...good, limit: "bandwidth" }, PROFILES.auto)
  assert.ok(st.params.maxKbps < 1200)
  assert.ok(st.params.scale > 1)
  assert.ok(st.params.maxKbps >= 400, "nunca abaixo do mínimo")
})
test("processador no limite: reduz quadros", () => {
  const st = adapt(initialSend(PROFILES.quality), { ...good, limit: "cpu" }, PROFILES.quality)
  assert.equal(st.params.fps, 30)
})
test("rede boa por um tempo: sobe até o teto do perfil e volta resolução", () => {
  let st = { params: { maxKbps: 800, scale: 1.5, fps: 24 }, good: 0 }
  for (let i = 0; i < 90; i++) st = adapt(st, good, PROFILES.balanced)
  assert.equal(st.params.maxKbps, PROFILES.balanced.maxKbps)
  assert.equal(st.params.scale, 1)
  assert.equal(st.params.fps, 30)
})
test("perda e atraso altos também contam como congestionamento", () => {
  const a = adapt(initialSend(PROFILES.auto), { ...good, lossPct: 9 }, PROFILES.auto)
  const b = adapt(initialSend(PROFILES.auto), { ...good, rttMs: 500 }, PROFILES.auto)
  assert.ok(a.params.maxKbps < PROFILES.auto.startKbps && b.params.maxKbps < PROFILES.auto.startKbps)
})
test("nota da conexão", () => {
  assert.equal(grade(good), "good")
  assert.equal(grade({ ...good, rttMs: 250 }), "fair")
  assert.equal(grade({ ...good, lossPct: 12 }), "poor")
  assert.equal(worst(["good", "poor", "fair"]), "poor")
})

test("resolução escolhida: tamanho da captura, taxa proporcional e teto", async () => {
  const { withResolution, PROFILES: P } = await import("../src/share/quality.ts")
  assert.equal(withResolution(P.auto, "auto"), P.auto, "automática não mexe no perfil")
  const r720 = withResolution(P.balanced, "720"), r1440 = withResolution(P.quality, "1440"), r4k = withResolution(P.quality, "2160")
  assert.equal(r720.height, 720); assert.equal(r720.fixedRes, true)
  assert.ok(r720.width >= 1280 && r720.width / r720.height > 2, "caixa larga: telas ultrawide não são cortadas")
  assert.ok(r720.maxKbps < P.balanced.maxKbps, "720p pede menos taxa que 1080p")
  assert.ok(r1440.maxKbps > P.quality.maxKbps, "1440p pede mais taxa")
  assert.ok(r4k.maxKbps <= 30000 && r4k.maxKbps > r1440.maxKbps, "4K com teto de 30 Mbit/s")
  assert.equal(withResolution(P.eco, "native").height, 4320, "original da tela: sem limite prático")
})

test("resolução fixa: rede ruim reduz quadros por segundo, nunca a imagem", async () => {
  const { withResolution, initialSend, adapt, PROFILES: P } = await import("../src/share/quality.ts")
  const p = withResolution(P.quality, "1080")
  let st = initialSend(p)
  for (let i = 0; i < 12; i++) st = adapt(st, { fps: 60, width: 1920, height: 1080, kbps: 900, limit: "bandwidth" }, p)
  assert.equal(st.params.scale, 1, "resolução mantida")
  assert.ok(st.params.fps < 60, "quadros reduzidos")
  // sem resolução fixa, a mesma rede reduz a imagem
  let free = initialSend(P.quality)
  for (let i = 0; i < 12; i++) free = adapt(free, { fps: 60, width: 1920, height: 1080, kbps: 900, limit: "bandwidth" }, P.quality)
  assert.ok(free.params.scale > 1)
})
