// Posição da música para as letras: usa o instante em que o Windows mediu a posição (LastUpdatedTime).
import test from "node:test"
import assert from "node:assert/strict"
import { livePosition } from "../src/shared/mediaTime.ts"

const base = { app: "Spotify.exe", title: "x", artist: "y", album: "", art: null, primary: true, at: 0 }
test("tocando: soma o tempo desde o instante informado pelo Windows (não desde a leitura)", () => {
  const now = 1_000_000
  // o Windows mediu 30 s há 2,4 s; a leitura chegou há só 0,2 s (antes isso dava 2,2 s de atraso)
  const s = { ...base, playing: true, pos: 30, dur: 200, upd: now - 2400, at: now - 200 }
  assert.equal(livePosition(s, now), 32.4)
})
test("player sem o instante: usa a hora da leitura", () => {
  const now = 1_000_000
  assert.equal(livePosition({ ...base, playing: true, pos: 10, dur: 100, upd: 0, at: now - 1000 }, now), 11)
})
test("pausado: posição parada; nunca passa da duração; instante absurdo é ignorado", () => {
  const now = 1_000_000
  assert.equal(livePosition({ ...base, playing: false, pos: 10, dur: 100, upd: now - 5000, at: now }, now), 10)
  assert.equal(livePosition({ ...base, playing: true, pos: 99, dur: 100, upd: now - 5000, at: now }, now), 100)
  assert.equal(livePosition({ ...base, playing: true, pos: 10, dur: 100, upd: now + 60_000, at: now - 1000 }, now), 11)
})
