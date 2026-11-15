// Salas do servidor de sinalização: criação, convite, aprovação, força bruta, validade, queda e retorno.
import test from "node:test"
import assert from "node:assert/strict"
import { Hub, normalizeCode, turnCredentials, formatCode } from "../server/hub.mjs"
import { createHmac } from "node:crypto"

function setup(opts = {}) {
  let t = 1_000_000
  const hub = new Hub({ now: () => t, ...opts })
  const inbox = new Map()
  const client = (id, ip = "1.1.1.1") => { inbox.set(id, []); hub.connect(id, (m) => inbox.get(id).push(m), ip); return id }
  const last = (id, type) => [...inbox.get(id)].reverse().find((m) => !type || m.t === type)
  return { hub, client, last, inbox, tick: (ms) => { t += ms } }
}

test("código: 16 caracteres, formato XXXX-XXXX-XXXX-XXXX e normalização", () => {
  assert.equal(formatCode("ABCDEFGH", "JKMNPQRS"), "ABCD-EFGH-JKMN-PQRS")
  assert.equal(normalizeCode("abcd efgh-ijkl-oooo"), "ABCDEFGH1JK10000")
})

test("criar sala devolve código, chave de retomada e ICE", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", name: "PC do Gabriel" })
  const m = last("h", "created")
  assert.match(m.code, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
  assert.ok(m.hostKey.length >= 30)
  assert.ok(Array.isArray(m.ice) && m.ice[0].urls.length)
  hub.close()
})

test("entrar exige aprovação do anfitrião por padrão", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create" })
  const { code, peer: host } = last("h", "created")
  client("v", "2.2.2.2"); hub.handle("v", { t: "join", code, name: "Amigo" })
  assert.equal(last("v").t, "waiting")
  const req = last("h", "request")
  assert.equal(req.name, "Amigo")
  // ainda não pode sinalizar
  hub.handle("v", { t: "signal", to: host, data: { x: 1 } })
  assert.equal(last("v").code, "not-allowed")
  hub.handle("h", { t: "admit", peer: req.peer, ok: true })
  const j = last("v", "joined")
  assert.equal(j.host, host)
  assert.equal(last("h").t, "peer")
  hub.handle("v", { t: "signal", to: host, data: { sdp: "x" } })
  assert.deepEqual(last("h", "signal"), { t: "signal", from: req.peer, data: { sdp: "x" } })
  hub.close()
})

test("recusar e expulsar", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create" })
  const { code } = last("h", "created")
  client("v"); hub.handle("v", { t: "join", code })
  hub.handle("h", { t: "admit", peer: last("h", "request").peer, ok: false })
  assert.equal(last("v").code, "denied")
  client("w"); hub.handle("w", { t: "join", code })
  const p = last("h", "request").peer
  hub.handle("h", { t: "admit", peer: p, ok: true })
  hub.handle("h", { t: "kick", peer: p })
  assert.deepEqual(last("w"), { t: "ended", reason: "kicked" })
  hub.close()
})

test("espectador não sinaliza outro espectador", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", approval: false })
  const { code } = last("h", "created")
  client("a"); hub.handle("a", { t: "join", code })
  client("b"); hub.handle("b", { t: "join", code })
  const pb = last("b", "joined").peer
  hub.handle("a", { t: "signal", to: pb, data: 1 })
  assert.equal(last("a").code, "not-allowed")
  hub.close()
})

test("código errado: bloqueio por IP e trava da sala", () => {
  const { hub, client, last } = setup({ ipFailLimit: 3, roomFailLimit: 5 })
  client("h"); hub.handle("h", { t: "create" })
  const { code } = last("h", "created")
  const wrong = code.slice(0, 10) + "ZZZZ-ZZZZ".slice(0, code.length - 10)
  client("x", "9.9.9.9")
  for (let i = 0; i < 3; i++) hub.handle("x", { t: "join", code: wrong })
  hub.handle("x", { t: "join", code })
  assert.equal(last("x").code, "rate", "IP bloqueado mesmo com o código certo")
  // vários IPs errando: a sala trava e o anfitrião é avisado
  for (let i = 0; i < 5; i++) { client("y" + i, "8.8.8." + i); hub.handle("y" + i, { t: "join", code: wrong }) }
  assert.deepEqual(last("h", "alert"), { t: "alert", code: "brute" })
  client("ok", "7.7.7.7"); hub.handle("ok", { t: "join", code })
  assert.equal(last("ok").code, "locked")
  // girar o código destrava e invalida o antigo
  hub.handle("h", { t: "rotate" })
  const fresh = last("h", "code").code
  client("ok2", "6.6.6.6"); hub.handle("ok2", { t: "join", code })
  assert.equal(last("ok2").code, "bad-code")
  client("ok3", "5.5.5.5"); hub.handle("ok3", { t: "join", code: fresh })
  assert.equal(last("ok3").t, "waiting")
  hub.close()
})

test("código vence: ninguém novo entra depois do prazo", () => {
  const { hub, client, last, tick } = setup({ codeTtlMs: 1000 })
  client("h"); hub.handle("h", { t: "create" })
  const { code } = last("h", "created")
  tick(1500)
  client("v"); hub.handle("v", { t: "join", code })
  assert.equal(last("v").code, "expired")
  hub.close()
})

test("anfitrião cai e volta com a chave; sem a chave não assume", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", approval: false })
  const { code, hostKey, room, peer } = last("h", "created")
  client("v"); hub.handle("v", { t: "join", code })
  hub.disconnect("h")
  assert.equal(last("v").t, "host-away")
  client("evil", "3.3.3.3"); hub.handle("evil", { t: "resume", room, role: "host", key: "x".repeat(32) })
  assert.equal(last("evil").code, "bad-key")
  client("h2"); hub.handle("h2", { t: "resume", room, role: "host", key: hostKey })
  const r = last("h2", "resumed")
  assert.equal(r.peer, peer)
  assert.equal(r.viewers.length, 1)
  assert.equal(last("v").t, "host-back")
  hub.close()
})

test("espectador cai e volta com o token; passado o prazo sai da sala", async () => {
  const { hub, client, last } = setup({ viewerGraceMs: 30 })
  client("h"); hub.handle("h", { t: "create", approval: false })
  const { code, room } = last("h", "created")
  client("v"); hub.handle("v", { t: "join", code })
  const j = last("v", "joined")
  hub.disconnect("v")
  client("v2"); hub.handle("v2", { t: "resume", room, role: "viewer", peer: j.peer, key: j.resume })
  assert.equal(last("v2", "resumed").peer, j.peer)
  hub.disconnect("v2")
  await new Promise((r) => setTimeout(r, 60))
  assert.deepEqual(last("h", "peer-left"), { t: "peer-left", peer: j.peer })
  hub.close()
})

test("anfitrião encerra: todos recebem ended e a sala some", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", approval: false })
  const { code } = last("h", "created")
  client("v"); hub.handle("v", { t: "join", code })
  client("v2"); hub.handle("v2", { t: "join", code })
  hub.handle("v", { t: "end" }) // espectador não pode encerrar
  assert.equal(hub.rooms.size, 1)
  hub.handle("h", { t: "end" })
  assert.equal(last("v").reason, "host-ended")
  assert.equal(hub.rooms.size, 0)
  hub.close()
})

test("limite de espectadores", () => {
  const { hub, client, last } = setup({ maxViewers: 1 })
  client("h"); hub.handle("h", { t: "create", approval: false })
  const { code } = last("h", "created")
  client("a"); hub.handle("a", { t: "join", code })
  client("b"); hub.handle("b", { t: "join", code })
  assert.equal(last("b").code, "full")
  hub.close()
})

test("credenciais TURN temporárias no formato do coturn", () => {
  const c = turnCredentials("segredo", "peer1", 3600, 1_700_000_000_000)
  assert.equal(c.username, "1700003600:peer1")
  assert.equal(c.credential, createHmac("sha1", "segredo").update(c.username).digest("base64"))
  const { hub, client, last } = setup({ turnUrls: ["turn:t.example.com:3478"], turnSecret: "s" })
  client("h"); hub.handle("h", { t: "create" })
  const ice = last("h", "created").ice
  assert.equal(ice[1].urls[0], "turn:t.example.com:3478")
  assert.match(ice[1].username, /^\d+:/)
  hub.close()
})
