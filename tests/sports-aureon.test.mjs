// Widgets no estilo Aureon: escolha da partida em destaque, tempo de jogo, datas, detalhe do vlr.gg e cenas do clima.
import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { featured, liveInfo, when } from "../src/widgets/types/sportsLogic.ts"
import { sceneOf } from "../src/widgets/types/weatherScene.ts"
const require = createRequire(import.meta.url)

const team = (name, extra = {}) => ({ name, short: name.slice(0, 3).toUpperCase(), ...extra })
const m = (id, state, start, a = "Flamengo", b = "Vasco", extra = {}) => ({ id, state, start, a: team(a), b: team(b), detail: "", event: "Brasileirão", link: "", ...extra })

test("destaque: favorito ao vivo > ao vivo > próximo favorito com times definidos > próximo > último", () => {
  const now = Date.now()
  const list = [m("1", "upcoming", now + 7200e3), m("2", "upcoming", now + 3600e3, "A definir", "TBD"), m("3", "done", now - 3600e3), m("4", "upcoming", now + 9000e3, "Corinthians", "Santos")]
  assert.equal(featured(list, []).id, "1", "times a definir ficam para trás")
  assert.equal(featured(list, [{ name: "Corinthians" }]).id, "4", "favorito primeiro")
  assert.equal(featured([...list, m("5", "live", now - 600e3, "Bahia", "Ceará")], [{ name: "Corinthians" }]).id, "5", "ao vivo vence")
  assert.equal(featured([m("3", "done", now - 3600e3)], []).id, "3")
  assert.equal(featured([], []), null)
})

test("tempo de jogo: futebol pelo minuto, intervalo e basquete pelo quarto", () => {
  assert.deepEqual(liveInfo(m("x", "live", 0, "A", "B", { minute: 72, period: 2, clock: "72'" })), { text: "2º tempo · 72'", frac: 0.8 })
  assert.equal(liveInfo(m("x", "live", 0, "A", "B", { minute: 30, period: 1, clock: "30'" })).text, "1º tempo · 30'")
  assert.deepEqual(liveInfo(m("x", "live", 0, "A", "B", { detail: "Intervalo" })), { text: "Intervalo", frac: 0.5 })
  assert.equal(liveInfo({ ...m("bk-1", "live", 0), period: 3, clock: "5:32", league: "nba" }).text, "3º quarto · 5:32")
})

test("datas: hoje, amanhã e sem horário", () => {
  const now = new Date(2026, 10, 16, 12, 0).getTime()
  assert.equal(when(new Date(2026, 10, 16, 21, 30).getTime(), now), "Hoje · 21:30")
  assert.equal(when(new Date(2026, 10, 17, 16, 0).getTime(), now), "Amanhã · 16:00")
  assert.equal(when(0, now), "Data a definir")
})

test("vlr.gg: escudos, mapas, placar por mapa e mapa em andamento", () => {
  const { parseVlrMatch } = require("../electron/integrations/widgy/sports.cjs")
  const game = (id, map, a, b, winA, winB) => `<div class="vm-stats-game " data-game-id="${id}"><div class="vm-stats-game-header"><div class="team"><div class="score ${winA ? "mod-win" : ""}" style="">${a} </div></div><div class="map"><div class="map-name"><span style="position: relative;">${map}<span class="picked">PICK</span></span></div><div class="map-duration">-</div></div><div class="team mod-right"><div class="score ${winB ? "mod-win" : ""}">${b}</div></div></div></div>`
  const html = `<a class="match-header-link mod-1"><img src="//owcdn.net/img/mibr.png" alt="MIBR team logo"></a><a class="match-header-link mod-2"><img src="/img/vlr/tmp/vlr.png" alt="LOUD team logo"></a>` +
    game(1, "Ascent", 13, 9, true, false) + game(2, "Haven", 7, 5, false, false) + game(3, "TBD", 0, 0, false, false)
  const r = parseVlrMatch(html)
  assert.equal(r.logos.a, "https://owcdn.net/img/mibr.png")
  assert.equal(r.logos.b, "", "logo genérico do vlr vira vazio (o widget mostra as iniciais)")
  assert.deepEqual(r.maps.map((x) => [x.name, x.a, x.b, x.done]), [["Ascent", 13, 9, true], ["Haven", 7, 5, false], ["", 0, 0, false]])
  assert.equal(r.current, 1, "mapa 2 (Haven) em andamento")
})

test("clima: cena e texto pelo código WMO, noite e vento", () => {
  assert.deepEqual(sceneOf(0, true), { scene: "sun", label: "Ensolarado" })
  assert.equal(sceneOf(0, false).scene, "night")
  assert.equal(sceneOf(2, true).scene, "partly")
  assert.equal(sceneOf(3, true).scene, "cloudy")
  assert.equal(sceneOf(45, true).label, "Neblina")
  assert.equal(sceneOf(61, true).label, "Chuva leve")
  assert.equal(sceneOf(95, true).scene, "storm")
  assert.equal(sceneOf(71, true).label, "Neve leve")
  assert.equal(sceneOf(1, true, 50).scene, "wind", "vento forte sem chuva vira 'Ventando'")
  assert.equal(sceneOf(63, true, 50).scene, "rain", "chuva tem prioridade sobre vento")
})

test("ESPN: 2º tempo não é confundido com intervalo", () => {
  const { parseEspn } = require("../electron/integrations/widgy/sports.cjs")
  const ev = (name, short, clock) => ({ events: [{ id: "1", date: "2026-11-21T12:00Z", status: { displayClock: clock, period: 2, type: { state: "in", name, shortDetail: short } },
    competitions: [{ competitors: [{ homeAway: "home", team: { abbreviation: "A", shortDisplayName: "A" }, score: "1" }, { homeAway: "away", team: { abbreviation: "B", shortDisplayName: "B" }, score: "0" }] }] }] })
  assert.equal(parseEspn(ev("STATUS_SECOND_HALF", "81'", "81'"), "x")[0].detail, "81'")
  assert.equal(parseEspn(ev("STATUS_FIRST_HALF", "30'", "30'"), "x")[0].detail, "30'")
  assert.equal(parseEspn(ev("STATUS_HALFTIME", "HT", "45'"), "x")[0].detail, "Intervalo")
})
