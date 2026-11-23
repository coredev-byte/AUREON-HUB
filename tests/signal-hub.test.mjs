// Salas do servidor de sinalização (protocolo 2): convite curto, aprovação, várias pessoas transmitindo na
// mesma sala, força bruta, validade, queda e retorno, troca de dono.
import test from "node:test"
import assert from "node:assert/strict"
import { Hub, normalizeCode, turnCredentials, formatCode, PROTOCOL } from "../server/hub.mjs"
import { createHmac } from "node:crypto"

function setup(opts = {}) {
  let t = 1_000_000
  const hub = new Hub({ now: () => t, ...opts })
  const inbox = new Map()
  const client = (id, ip = "1.1.1." + (inbox.size + 1)) => { inbox.set(id, []); hub.connect(id, (m) => inbox.get(id).push(m), ip); return id }
  const last = (id, type) => [...inbox.get(id)].reverse().find((m) => !type || m.t === type)
  const all = (id, type) => inbox.get(id).filter((m) => m.t === type)
  return { hub, client, last, all, inbox, tick: (ms) => { t += ms } }
}
/** sala com dono "h" e membros aceitos (ids dados) */
function room(names = ["v"], opts = {}) {
  const s = setup(opts)
  s.client("h"); s.hub.handle("h", { t: "create", name: "Gabriel" })
  const created = s.last("h", "created")
  const peers = { h: created.peer }
  for (const n of names) {
    s.client(n); s.hub.handle(n, { t: "join", code: created.code, name: n.toUpperCase() })
    s.hub.handle("h", { t: "admit", peer: s.last("h", "request").peer, ok: true })
    peers[n] = s.last(n, "joined").peer
  }
  return { ...s, code: created.code, created, peers }
}

test("código curto: 8 caracteres, formato XXXX-XXXX e normalização", () => {
  assert.equal(formatCode("ABCD", "EFGH"), "ABCD-EFGH")
  assert.equal(normalizeCode("abcd efgh"), "ABCDEFGH")
  assert.equal(normalizeCode("ab1o-il00"), "AB10110" + "0")
})

test("criar sala devolve código curto, chave de retomada, ICE e protocolo 2", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", name: "PC do Gabriel" })
  const m = last("h", "created")
  assert.match(m.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  assert.equal(m.protocol, PROTOCOL)
  assert.equal(m.owner, m.peer)
  assert.ok(m.key.length >= 20)
  assert.ok(Array.isArray(m.ice) && m.ice[0].urls.length)
  assert.deepEqual(m.members.map((x) => x.name), ["PC do Gabriel"])
  hub.close()
})

test("entrar exige aprovação do dono; quem espera não fala com ninguém", () => {
  const { hub, client, last, created } = room([])
  client("v"); hub.handle("v", { t: "join", code: created.code, name: "Amigo" })
  assert.equal(last("v").t, "waiting")
  const req = last("h", "request")
  assert.equal(req.name, "Amigo")
  hub.handle("v", { t: "signal", to: created.peer, data: { x: 1 } })
  assert.equal(last("v").code, "not-allowed")
  hub.handle("h", { t: "admit", peer: req.peer, ok: true })
  const j = last("v", "joined")
  assert.equal(j.owner, created.peer)
  assert.deepEqual(j.members.map((x) => x.name).sort(), ["Amigo", "Gabriel"])
  assert.equal(last("h", "member").name, "Amigo")
  hub.handle("v", { t: "signal", to: created.peer, data: { sdp: "x" } })
  assert.deepEqual(last("h", "signal"), { t: "signal", from: req.peer, data: { sdp: "x" } })
  hub.close()
})

test("várias pessoas transmitindo na mesma sala: todos veem quem está ao vivo e qualquer membro fala com qualquer membro", () => {
  const { hub, last, all, peers } = room(["a", "b"])
  hub.handle("a", { t: "live", on: true, label: "Tela 1", audio: true })
  hub.handle("b", { t: "live", on: true, label: "Valorant" })
  for (const who of ["h", "a", "b"]) assert.equal(all(who, "member-live").length, 2, who + " viu as duas transmissões")
  assert.deepEqual(last("h", "member-live"), { t: "member-live", peer: peers.b, live: { label: "Valorant", audio: false, since: 1_000_000 } })
  // A assiste B: sinal direto entre dois convidados (sem passar pelo dono)
  hub.handle("a", { t: "signal", to: peers.b, data: { kind: "watch" } })
  assert.deepEqual(last("b", "signal"), { t: "signal", from: peers.a, data: { kind: "watch" } })
  hub.handle("a", { t: "live", on: false })
  assert.equal(last("b", "member-live").live, null)
  hub.close()
})

test("quem entra depois recebe a lista com as transmissões em andamento", () => {
  const { hub, client, last, code, peers } = room(["a"])
  hub.handle("a", { t: "live", on: true, label: "Tela inteira" })
  client("c"); hub.handle("c", { t: "join", code, name: "C" })
  hub.handle("h", { t: "admit", peer: last("h", "request").peer, ok: true })
  const j = last("c", "joined")
  const a = j.members.find((m) => m.peer === peers.a)
  assert.equal(a.live.label, "Tela inteira")
  hub.close()
})

test("recusar e expulsar (só o dono)", () => {
  const { hub, client, last, code, peers } = room(["v"])
  client("w"); hub.handle("w", { t: "join", code })
  hub.handle("h", { t: "admit", peer: last("h", "request").peer, ok: false })
  assert.equal(last("w").code, "denied")
  // convidado não expulsa ninguém
  hub.handle("v", { t: "kick", peer: peers.h })
  assert.equal(hub.rooms.size, 1)
  hub.handle("h", { t: "kick", peer: peers.v })
  assert.equal(last("v").reason, "kicked")
  assert.equal(last("h", "member-left").peer, peers.v)
  hub.close()
})

test("código errado: limite por IP e sala trancada depois de muitas tentativas", () => {
  const { hub, client, last, code } = room([], { ipFailLimit: 3, roomFailLimit: 5 })
  const wrong = code.slice(0, 5) + (code[5] === "Z" ? "Y" : "Z") + code.slice(6)
  client("x", "6.6.6.6")
  for (let i = 0; i < 3; i++) hub.handle("x", { t: "join", code: wrong })
  hub.handle("x", { t: "join", code })
  assert.equal(last("x").code, "rate", "IP bloqueado mesmo com o código certo")
  for (let i = 0; i < 5; i++) { client("y" + i, "7.7.7." + i); hub.handle("y" + i, { t: "join", code: wrong }) }
  assert.equal(last("h", "alert").code, "brute")
  client("z", "8.8.8.8"); hub.handle("z", { t: "join", code })
  assert.equal(last("z").code, "locked")
  hub.handle("h", { t: "rotate" })
  const fresh = last("h", "code").code
  assert.notEqual(fresh, code)
  client("z2", "8.8.8.9"); hub.handle("z2", { t: "join", code: fresh })
  assert.equal(last("z2").t, "waiting")
  hub.close()
})

test("convite vence para novas entradas", () => {
  const { hub, client, last, code, tick } = room([])
  tick(2 * 3600e3 + 1)
  client("v"); hub.handle("v", { t: "join", code })
  assert.equal(last("v").code, "expired")
  hub.close()
})

test("sala cheia", () => {
  const { hub, client, last, code } = room(["a"], { maxViewers: 1 })
  client("b"); hub.handle("b", { t: "join", code })
  assert.equal(last("b").code, "full")
  hub.close()
})

test("queda: retoma com a chave; avisa os outros; chave errada é recusada", () => {
  const { hub, client, last, created, peers } = room(["v"])
  hub.disconnect("v")
  assert.equal(last("h", "member-away").peer, peers.v)
  client("v2"); hub.handle("v2", { t: "resume", room: created.room, peer: peers.v, key: "x".repeat(24) })
  assert.equal(last("v2").code, "bad-key")
  const key = last("v", "joined").key
  client("v3"); hub.handle("v3", { t: "resume", room: created.room, peer: peers.v, key })
  assert.equal(last("v3").t, "resumed")
  assert.equal(last("h", "member-back").peer, peers.v)
  hub.handle("v3", { t: "signal", to: peers.h, data: 1 })
  assert.equal(last("h", "signal").from, peers.v)
  hub.close()
})

test("dono sai: a sala passa para quem entrou primeiro, com os pedidos pendentes", () => {
  const { hub, client, last, code, peers } = room(["a", "b"])
  client("c"); hub.handle("c", { t: "join", code, name: "C" })
  hub.handle("h", { t: "leave" })
  assert.equal(last("a", "owner").peer, peers.a)
  assert.equal(last("a", "request").name, "C")
  hub.handle("a", { t: "admit", peer: last("a", "request").peer, ok: true })
  assert.equal(last("c").t, "joined")
  hub.close()
})

test("dono cai e não volta: passa a sala; último a sair fecha a sala", () => {
  const { hub, last, peers, tick } = room(["a"])
  hub.disconnect("h")
  tick(46e3)
  // temporizador real: chama direto o que ele chamaria
  const r = [...hub.rooms.values()][0]
  hub.dropMember(r, peers.h, "lost")
  assert.equal(last("a", "owner").peer, peers.a)
  hub.handle("a", { t: "leave" })
  assert.equal(hub.rooms.size, 0)
  hub.close()
})

test("encerrar para todos: só o dono", () => {
  const { hub, last } = room(["a"])
  hub.handle("a", { t: "end" })
  assert.equal(hub.rooms.size, 1)
  hub.handle("h", { t: "end" })
  assert.equal(last("a", "ended").reason, "host-ended")
  assert.equal(hub.rooms.size, 0)
  hub.close()
})

test("mensagem de sinal grande demais é recusada", () => {
  const { hub, last, peers } = room(["a"])
  hub.handle("a", { t: "signal", to: peers.h, data: "x".repeat(70000) })
  assert.equal(last("a").code, "too-big")
  hub.close()
})

test("TURN: credencial temporária no formato do coturn", () => {
  const c = turnCredentials("segredo", "peer1", 3600, 1_000_000_000)
  assert.equal(c.username, `${1_000_000 + 3600}:peer1`)
  assert.equal(c.credential, createHmac("sha1", "segredo").update(c.username).digest("base64"))
  const hub = new Hub({ turnUrls: ["turn:t.example:3478"], turnSecret: "s", stun: [] })
  const ice = hub.ice("p")
  assert.equal(ice[0].urls[0], "turn:t.example:3478")
  assert.ok(ice[0].username.endsWith(":p"))
})

/* ---------- salas com nome e senha ---------- */
import { normalizeRoomName, checkPassword, hashPassword } from "../server/hub.mjs"

test("nome da sala: sem acento, minúsculo, hífen; curto ou vazio é recusado", () => {
  assert.equal(normalizeRoomName("Sala do Gabriel!"), "sala-do-gabriel")
  assert.equal(normalizeRoomName("  Ação  Total  "), "acao-total")
  assert.equal(normalizeRoomName("ab"), "")
  assert.equal(normalizeRoomName("x".repeat(30)), "")
})

test("senha: guardada só como hash lento com sal; confere certo e errado", () => {
  const r = hashPassword("pipoca123")
  assert.ok(r.salt.length === 16 && r.hash.length === 32)
  assert.equal(checkPassword("pipoca123", r), true)
  assert.equal(checkPassword("pipoca124", r), false)
  assert.equal(checkPassword("pipoca123", null), false, "sala inexistente nunca confere")
})

test("criar com nome e senha, entrar com os dois; senha errada e nome repetido recusados", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", name: "Gabriel", room: "Jogatina", password: "segredo1" })
  const c = last("h", "created")
  assert.equal(c.roomName, "jogatina"); assert.equal(c.code, "")
  const room = hub.rooms.get(c.room)
  assert.ok(!JSON.stringify(room.pw).includes("segredo1"), "a senha não fica guardada em texto")
  client("x"); hub.handle("x", { t: "create", room: "jogatina", password: "outra123" })
  assert.equal(last("x").code, "name-taken")
  client("v"); hub.handle("v", { t: "join", room: "JOGATINA", password: "errada!", name: "V" })
  assert.equal(last("v").code, "bad-password")
  hub.handle("v", { t: "join", room: "jogatina", password: "segredo1", name: "V" })
  assert.equal(last("v").t, "waiting")
  hub.handle("h", { t: "admit", peer: last("h", "request").peer, ok: true })
  assert.equal(last("v", "joined").roomName, "jogatina")
  client("s"); hub.handle("s", { t: "create", room: "abc", password: "123" })
  assert.equal(last("s").code, "weak-password")
  hub.close()
})

test("dono troca a senha: a antiga deixa de valer", () => {
  const { hub, client, last } = setup()
  client("h"); hub.handle("h", { t: "create", room: "minha-sala", password: "antiga1" })
  hub.handle("h", { t: "set", password: "nova1234" })
  assert.equal(last("h", "password-set").t, "password-set")
  client("a"); hub.handle("a", { t: "join", room: "minha-sala", password: "antiga1" })
  assert.equal(last("a").code, "bad-password")
  client("b"); hub.handle("b", { t: "join", room: "minha-sala", password: "nova1234" })
  assert.equal(last("b").t, "waiting")
  hub.close()
})

test("força bruta na senha: IP bloqueado e sala trancada", () => {
  const { hub, client, last } = setup({ ipFailLimit: 3, roomFailLimit: 4 })
  client("h"); hub.handle("h", { t: "create", room: "alvo", password: "certa123" })
  client("x", "6.6.6.6")
  for (let i = 0; i < 3; i++) hub.handle("x", { t: "join", room: "alvo", password: "chute" + i })
  hub.handle("x", { t: "join", room: "alvo", password: "certa123" })
  assert.equal(last("x").code, "rate")
  for (let i = 0; i < 4; i++) { client("y" + i, "7.7.7." + i); hub.handle("y" + i, { t: "join", room: "alvo", password: "x" + i + "yyyy" }) }
  assert.equal(last("h", "alert").code, "brute")
  hub.close()
})
