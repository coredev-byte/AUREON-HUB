// Lógica das salas da sinalização (sem rede: os testes chamam direto).
// Protocolo 2: sala no estilo "canal de voz". Várias pessoas na mesma sala, e qualquer uma pode transmitir a
// própria tela; quem assiste escolhe qual tela ver (uma ou várias). O servidor só repassa mensagens de
// conexão (ofertas/respostas SDP e candidatos ICE) entre membros aceitos. Vídeo e áudio nunca passam por aqui.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const PROTOCOL = 2
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" // base32 de Crockford (sem I, L, O, U)
/** convite curto: 4 caracteres da sala + 4 do segredo, mostrado como "ABCD-EFGH" */
export const ROOM_LEN = 4
export const SECRET_LEN = 4

export function randomCode(n) {
  const bytes = randomBytes(n)
  let s = ""
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] & 31]
  return s
}
/** "abcd efgh" / "abcd-efgh" -> "ABCDEFGH" (O vira 0; I e L viram 1) */
export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1")
}
export const formatCode = (room, secret) => room + "-" + secret
const sha = (s) => createHash("sha256").update(s).digest()
const id = () => randomBytes(12).toString("base64url")
const sameKey = (a, b) => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export const DEFAULTS = {
  /** pessoas além de quem criou a sala */
  maxViewers: 8,
  roomTtlMs: 8 * 3600e3,
  codeTtlMs: 2 * 3600e3,
  hostGraceMs: 45e3,
  viewerGraceMs: 30e3,
  ipFailLimit: 8,
  ipFailWindowMs: 10 * 60e3,
  roomFailLimit: 30,
  stun: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"],
  turnUrls: [],
  turnSecret: "",
  turnUser: "",
  turnPass: "",
  turnTtlS: 6 * 3600,
}

/** credenciais TURN temporárias no formato "REST API" do coturn (use-auth-secret) */
export function turnCredentials(secret, peer, ttlS, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + ttlS}:${peer}`
  const credential = createHmac("sha1", secret).update(username).digest("base64")
  return { username, credential }
}

const cleanLive = (m) => (m && typeof m === "object" ? { label: String(m.label || "Tela").slice(0, 60), audio: !!m.audio, since: Number(m.since) || 0 } : null)

export class Hub {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts }
    this.now = opts.now ?? (() => Date.now())
    this.rooms = new Map() // roomId -> room
    this.clients = new Map() // clientId -> { send, ip, peer, room }
    this.peers = new Map() // peerId -> clientId
    this.fails = new Map() // ip -> [timestamps]
    this.timers = new Set()
  }

  /* ---------- infraestrutura ---------- */
  connect(clientId, send, ip = "") { this.clients.set(clientId, { send, ip, peer: null, room: null }) }
  later(ms, fn) { const t = setTimeout(() => { this.timers.delete(t); fn() }, ms); t.unref?.(); this.timers.add(t); return t }
  cancel(t) { if (t) { clearTimeout(t); this.timers.delete(t) } }
  close() { for (const t of this.timers) clearTimeout(t); this.timers.clear() }
  sendPeer(peer, msg) { const c = this.clients.get(this.peers.get(peer)); if (c) c.send(msg) }
  ice(peer) {
    const servers = this.o.stun.length ? [{ urls: this.o.stun }] : []
    if (this.o.turnUrls.length) {
      if (this.o.turnSecret) servers.push({ urls: this.o.turnUrls, ...turnCredentials(this.o.turnSecret, peer, this.o.turnTtlS, this.now()) })
      else if (this.o.turnUser) servers.push({ urls: this.o.turnUrls, username: this.o.turnUser, credential: this.o.turnPass })
    }
    // TURN de serviço (Cloudflare/Metered): credenciais temporárias já buscadas pelo servidor
    if (typeof this.o.extraIce === "function") servers.push(...this.o.extraIce())
    return servers
  }
  stats() { return { rooms: this.rooms.size, clients: this.clients.size } }

  /** tentativas erradas por IP (força bruta) */
  blocked(ip) {
    const now = this.now()
    const list = (this.fails.get(ip) ?? []).filter((t) => now - t < this.o.ipFailWindowMs)
    this.fails.set(ip, list)
    return list.length >= this.o.ipFailLimit
  }
  fail(ip) { const l = this.fails.get(ip) ?? []; l.push(this.now()); this.fails.set(ip, l) }

  /* ---------- sala ---------- */
  admitted(room) { return [...room.members].filter(([, m]) => m.admitted) }
  memberList(room) { return this.admitted(room).map(([peer, m]) => ({ peer, name: m.name, live: m.live, away: !!m.away, owner: peer === room.owner })) }
  /** envia para todos os membros aceitos (menos `except`) */
  broadcast(room, msg, except = null) { for (const [peer] of this.admitted(room)) if (peer !== except) this.sendPeer(peer, msg) }
  requestsOf(room) { return [...room.members].filter(([, m]) => !m.admitted).map(([peer, m]) => ({ peer, name: m.name })) }
  isOwner(c) { const room = this.rooms.get(c.room); return room && room.owner === c.peer ? room : null }

  /* ---------- mensagens ---------- */
  handle(clientId, msg) {
    const c = this.clients.get(clientId)
    if (!c || !msg || typeof msg.t !== "string") return
    const err = (code, extra = {}) => c.send({ t: "error", code, ...extra, re: msg.t })
    switch (msg.t) {
      case "ping": return c.send({ t: "pong", at: this.now(), protocol: PROTOCOL })
      case "create": return this.create(clientId, c, msg, err)
      case "join": return this.join(clientId, c, msg, err)
      case "resume": return this.resume(clientId, c, msg, err)
      case "admit": return this.admit(c, msg)
      case "signal": return this.signal(c, msg, err)
      case "live": return this.live(c, msg)
      case "kick": return this.kick(c, msg)
      case "rotate": return this.rotate(c, err)
      case "set": return this.set(c, msg)
      case "leave": return this.leave(clientId)
      case "end": return this.end(c.room, "host-ended", c)
      default: return err("unknown")
    }
  }

  create(clientId, c, msg, err) {
    if (c.room) return err("busy")
    let roomId
    do roomId = randomCode(ROOM_LEN); while (this.rooms.has(roomId))
    const secret = randomCode(SECRET_LEN), peer = id(), key = randomBytes(18).toString("base64url")
    const now = this.now()
    const name = String(msg.name || "").slice(0, 40) || "Anfitrião"
    const room = {
      id: roomId, secretHash: sha(secret), codeExpires: now + this.o.codeTtlMs, expires: now + this.o.roomTtlMs,
      owner: peer, approval: msg.approval !== false, locked: false, fails: 0, name,
      maxMembers: 1 + Math.min(this.o.maxViewers, Math.max(1, Number(msg.maxViewers) || this.o.maxViewers)),
      members: new Map(), // peer -> { name, admitted, key, away, live, at }
    }
    room.members.set(peer, { name, admitted: true, key, away: null, live: null, at: now })
    room.ttl = this.later(this.o.roomTtlMs, () => this.end(roomId, "expired"))
    this.rooms.set(roomId, room)
    Object.assign(c, { peer, room: roomId })
    this.peers.set(peer, clientId)
    c.send({
      t: "created", protocol: PROTOCOL, room: roomId, code: formatCode(roomId, secret), peer, key, ice: this.ice(peer), owner: peer,
      codeExpires: room.codeExpires, expires: room.expires, maxMembers: room.maxMembers, members: this.memberList(room), approval: room.approval, locked: false, name,
    })
  }

  join(clientId, c, msg, err) {
    if (c.room) return err("busy")
    if (this.blocked(c.ip)) return err("rate")
    const code = normalizeCode(msg.code)
    if (!new RegExp(`^[0-9A-Z]{${ROOM_LEN + SECRET_LEN}}$`).test(code)) { this.fail(c.ip); return err("bad-code") }
    const room = this.rooms.get(code.slice(0, ROOM_LEN))
    const ok = room && timingSafeEqual(room.secretHash, sha(code.slice(ROOM_LEN)))
    if (!ok) {
      this.fail(c.ip)
      if (room && ++room.fails >= this.o.roomFailLimit && !room.locked) { room.locked = true; this.sendPeer(room.owner, { t: "alert", code: "brute" }) }
      return err("bad-code")
    }
    if (this.now() > room.codeExpires) return err("expired")
    if (room.locked) return err("locked")
    if (this.admitted(room).length >= room.maxMembers) return err("full")
    const peer = id()
    const name = String(msg.name || "Convidado").slice(0, 40)
    room.members.set(peer, { name, admitted: false, key: randomBytes(18).toString("base64url"), away: null, live: null, at: this.now() })
    Object.assign(c, { peer, room: room.id })
    this.peers.set(peer, clientId)
    if (room.approval) {
      c.send({ t: "waiting", room: room.id })
      this.sendPeer(room.owner, { t: "request", peer, name })
    } else this.admitPeer(room, peer)
  }

  admitPeer(room, peer) {
    const m = room.members.get(peer)
    if (!m) return
    m.admitted = true
    m.at = this.now()
    this.sendPeer(peer, {
      t: "joined", protocol: PROTOCOL, room: room.id, peer, key: m.key, ice: this.ice(peer), owner: room.owner, name: room.name,
      members: this.memberList(room), approval: room.approval, locked: room.locked,
    })
    this.broadcast(room, { t: "member", peer, name: m.name, live: null, owner: false }, peer)
  }

  admit(c, msg) {
    const room = this.isOwner(c)
    if (!room) return
    const m = room.members.get(msg.peer)
    if (!m || m.admitted) return
    if (msg.ok) {
      if (this.admitted(room).length >= room.maxMembers) return this.reject(room, msg.peer, "full")
      this.admitPeer(room, msg.peer)
    } else this.reject(room, msg.peer, "denied")
  }

  reject(room, peer, code) {
    room.members.delete(peer)
    this.sendPeer(peer, { t: "error", code, re: "join" })
    this.detach(peer)
  }

  /** desliga o cliente da sala (sem fechar o WebSocket) */
  detach(peer) {
    const vc = this.clients.get(this.peers.get(peer))
    if (vc) Object.assign(vc, { peer: null, room: null })
    this.peers.delete(peer)
  }

  signal(c, msg, err) {
    const room = this.rooms.get(c.room)
    if (!room || typeof msg.to !== "string") return err("no-room")
    // só entre membros aceitos (quem ainda espera aprovação não fala com ninguém)
    const from = room.members.get(c.peer), to = room.members.get(msg.to)
    if (!from?.admitted || !to?.admitted || msg.to === c.peer) return err("not-allowed")
    if (JSON.stringify(msg.data ?? null).length > 60000) return err("too-big")
    this.sendPeer(msg.to, { t: "signal", from: c.peer, data: msg.data })
  }

  /** começou/parou de transmitir a própria tela (todos veem na lista da sala) */
  live(c, msg) {
    const room = this.rooms.get(c.room)
    const m = room?.members.get(c.peer)
    if (!m?.admitted) return
    m.live = msg.on ? cleanLive({ ...msg, since: this.now() }) : null
    this.broadcast(room, { t: "member-live", peer: c.peer, live: m.live })
  }

  kick(c, msg) {
    const room = this.isOwner(c)
    if (!room || msg.peer === room.owner || !room.members.has(msg.peer)) return
    this.sendPeer(msg.peer, { t: "ended", reason: "kicked" })
    this.dropMember(room, msg.peer)
  }

  rotate(c, err) {
    const room = this.isOwner(c)
    if (!room) return err("not-allowed")
    const secret = randomCode(SECRET_LEN)
    room.secretHash = sha(secret); room.codeExpires = this.now() + this.o.codeTtlMs; room.locked = false; room.fails = 0
    c.send({ t: "code", code: formatCode(room.id, secret), codeExpires: room.codeExpires })
    this.broadcast(room, { t: "settings", approval: room.approval, locked: room.locked })
  }

  set(c, msg) {
    const room = this.isOwner(c)
    if (!room) return
    if (typeof msg.approval === "boolean") room.approval = msg.approval
    if (typeof msg.locked === "boolean") room.locked = msg.locked
    this.broadcast(room, { t: "settings", approval: room.approval, locked: room.locked })
  }

  /** volta depois de uma queda (mesmo id de peer: as conexões WebRTC continuam valendo) */
  resume(clientId, c, msg, err) {
    if (this.blocked(c.ip)) return err("rate")
    const room = this.rooms.get(String(msg.room || ""))
    if (!room) return err("no-room")
    const peer = String(msg.peer || "")
    const m = room.members.get(peer)
    if (!m || !sameKey(msg.key, m.key)) { this.fail(c.ip); return err("bad-key") }
    const old = this.peers.get(peer)
    if (old && old !== clientId) { const oc = this.clients.get(old); if (oc) Object.assign(oc, { peer: null, room: null }) }
    this.cancel(m.away); m.away = null
    Object.assign(c, { peer, room: room.id })
    this.peers.set(peer, clientId)
    const owner = room.owner === peer
    c.send({
      t: "resumed", room: room.id, peer, ice: this.ice(peer), admitted: m.admitted, owner: room.owner, members: this.memberList(room),
      requests: owner ? this.requestsOf(room) : [], approval: room.approval, locked: room.locked,
    })
    if (m.admitted) this.broadcast(room, { t: "member-back", peer }, peer)
  }

  /** a conexão caiu: espera um pouco antes de tirar a pessoa da sala */
  disconnect(clientId) {
    const c = this.clients.get(clientId)
    this.clients.delete(clientId)
    if (!c?.room || this.peers.get(c.peer) !== clientId) return
    this.peers.delete(c.peer)
    const room = this.rooms.get(c.room)
    const m = room?.members.get(c.peer)
    if (!m) return
    if (!m.admitted) return this.dropMember(room, c.peer)
    this.broadcast(room, { t: "member-away", peer: c.peer }, c.peer)
    m.away = this.later(room.owner === c.peer ? this.o.hostGraceMs : this.o.viewerGraceMs, () => this.dropMember(room, c.peer, "lost"))
  }

  leave(clientId) {
    const c = this.clients.get(clientId)
    if (!c?.room) return
    const room = this.rooms.get(c.room)
    if (room) this.dropMember(room, c.peer)
  }

  /** tira alguém da sala; se era o dono, passa a sala para quem entrou primeiro (ou fecha, se ficou vazia) */
  dropMember(room, peer, why = "left") {
    const m = room.members.get(peer)
    if (!m) return
    this.cancel(m.away)
    room.members.delete(peer)
    this.detach(peer)
    if (!m.admitted) { this.sendPeer(room.owner, { t: "request-cancel", peer }); return }
    this.broadcast(room, { t: "member-left", peer, reason: why })
    if (room.owner !== peer) return
    const next = this.admitted(room).sort((a, b) => a[1].at - b[1].at)[0]
    if (!next) return this.end(room.id, why === "lost" ? "host-lost" : "host-ended")
    room.owner = next[0]
    this.broadcast(room, { t: "owner", peer: room.owner })
    // pedidos que estavam esperando passam para o novo dono
    for (const r of this.requestsOf(room)) this.sendPeer(room.owner, { t: "request", ...r })
  }

  end(roomId, reason, by = null) {
    const room = this.rooms.get(roomId)
    if (!room) return
    if (by && by.peer !== room.owner) return
    this.cancel(room.ttl)
    for (const [peer, m] of room.members) {
      this.cancel(m.away)
      this.sendPeer(peer, { t: "ended", reason })
      this.detach(peer)
    }
    this.rooms.delete(roomId)
  }
}
