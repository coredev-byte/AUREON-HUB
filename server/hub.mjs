// Lógica das salas da sinalização (sem rede: os testes chamam direto).
// O servidor só troca mensagens de conexão (ofertas/respostas SDP e candidatos ICE) entre quem transmite e
// quem foi aceito. Vídeo e áudio nunca passam por aqui.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" // base32 de Crockford (sem I, L, O, U)

export function randomCode(n) {
  const bytes = randomBytes(n)
  let s = ""
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] & 31]
  return s
}
/** "abcd efgh-ijkm..." -> "ABCDEFGH..." (O vira 0; I e L viram 1) */
export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1")
}
export const formatCode = (room, secret) => (room + secret).match(/.{4}/g).join("-")
const sha = (s) => createHash("sha256").update(s).digest()
const id = () => randomBytes(12).toString("base64url")

export const DEFAULTS = {
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

export class Hub {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts }
    this.now = opts.now ?? (() => Date.now())
    this.rooms = new Map() // roomId -> room
    this.clients = new Map() // clientId -> { send, ip, peer, room, role, name }
    this.peers = new Map() // peerId -> clientId
    this.fails = new Map() // ip -> [timestamps]
    this.timers = new Set()
  }

  /* ---------- infraestrutura ---------- */
  connect(clientId, send, ip = "") { this.clients.set(clientId, { send, ip, peer: null, room: null, role: null, name: "" }) }
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

  /* ---------- mensagens ---------- */
  handle(clientId, msg) {
    const c = this.clients.get(clientId)
    if (!c || !msg || typeof msg.t !== "string") return
    const err = (code, extra = {}) => c.send({ t: "error", code, ...extra, re: msg.t })
    switch (msg.t) {
      case "ping": return c.send({ t: "pong", at: this.now() })
      case "create": return this.create(clientId, c, msg, err)
      case "join": return this.join(clientId, c, msg, err)
      case "resume": return this.resume(clientId, c, msg, err)
      case "admit": return this.admit(c, msg)
      case "signal": return this.signal(c, msg, err)
      case "kick": return this.kick(c, msg)
      case "rotate": return this.rotate(c, err)
      case "set": return this.set(c, msg)
      case "leave": return this.leave(clientId, "left")
      case "end": return this.end(c.room, "host-ended", c)
      default: return err("unknown")
    }
  }

  create(clientId, c, msg, err) {
    if (c.room) return err("busy")
    let roomId
    do roomId = randomCode(8); while (this.rooms.has(roomId))
    const secret = randomCode(8), hostKey = randomBytes(24).toString("base64url"), peer = id()
    const now = this.now()
    const room = {
      id: roomId, secretHash: sha(secret), codeExpires: now + this.o.codeTtlMs, expires: now + this.o.roomTtlMs,
      hostKey: sha(hostKey), host: peer, hostAway: null, approval: msg.approval !== false, locked: false, fails: 0,
      maxViewers: Math.min(this.o.maxViewers, Math.max(1, Number(msg.maxViewers) || this.o.maxViewers)),
      viewers: new Map(), // peer -> { name, admitted, resume, away }
      name: String(msg.name || "").slice(0, 40),
    }
    room.ttl = this.later(this.o.roomTtlMs, () => this.end(roomId, "expired"))
    this.rooms.set(roomId, room)
    Object.assign(c, { peer, room: roomId, role: "host", name: room.name })
    this.peers.set(peer, clientId)
    c.send({ t: "created", room: roomId, code: formatCode(roomId, secret), hostKey, peer, ice: this.ice(peer), codeExpires: room.codeExpires, expires: room.expires, maxViewers: room.maxViewers })
  }

  join(clientId, c, msg, err) {
    if (c.room) return err("busy")
    if (this.blocked(c.ip)) return err("rate")
    const code = normalizeCode(msg.code)
    if (!/^[0-9A-Z]{16}$/.test(code)) { this.fail(c.ip); return err("bad-code") }
    const room = this.rooms.get(code.slice(0, 8))
    const ok = room && timingSafeEqual(room.secretHash, sha(code.slice(8)))
    if (!ok) {
      this.fail(c.ip)
      if (room && ++room.fails >= this.o.roomFailLimit && !room.locked) { room.locked = true; this.sendPeer(room.host, { t: "alert", code: "brute" }) }
      return err("bad-code")
    }
    if (this.now() > room.codeExpires) return err("expired")
    if (room.locked) return err("locked")
    if ([...room.viewers.values()].filter((v) => v.admitted).length >= room.maxViewers) return err("full")
    const peer = id()
    const name = String(msg.name || "Convidado").slice(0, 40)
    room.viewers.set(peer, { name, admitted: false, resume: randomBytes(18).toString("base64url"), away: null })
    Object.assign(c, { peer, room: room.id, role: "viewer", name })
    this.peers.set(peer, clientId)
    if (room.approval) {
      c.send({ t: "waiting", room: room.id })
      this.sendPeer(room.host, { t: "request", peer, name })
    } else this.admitPeer(room, peer)
  }

  admitPeer(room, peer) {
    const v = room.viewers.get(peer)
    if (!v) return
    v.admitted = true
    this.sendPeer(peer, { t: "joined", room: room.id, peer, host: room.host, ice: this.ice(peer), resume: v.resume, hostAway: !!room.hostAway, name: room.name })
    this.sendPeer(room.host, { t: "peer", peer, name: v.name })
  }

  admit(c, msg) {
    const room = this.rooms.get(c.room)
    if (!room || c.role !== "host") return
    const v = room.viewers.get(msg.peer)
    if (!v || v.admitted) return
    if (msg.ok) {
      if ([...room.viewers.values()].filter((x) => x.admitted).length >= room.maxViewers) return this.reject(room, msg.peer, "full")
      this.admitPeer(room, msg.peer)
    } else this.reject(room, msg.peer, "denied")
  }

  reject(room, peer, code) {
    room.viewers.delete(peer)
    this.sendPeer(peer, { t: "error", code, re: "join" })
    const cid = this.peers.get(peer)
    const vc = this.clients.get(cid)
    if (vc) Object.assign(vc, { peer: null, room: null, role: null })
    this.peers.delete(peer)
  }

  signal(c, msg, err) {
    const room = this.rooms.get(c.room)
    if (!room || typeof msg.to !== "string") return err("no-room")
    // só anfitrião <-> espectador aceito; espectadores não falam entre si
    const toHost = msg.to === room.host
    const fromHost = c.role === "host" && c.peer === room.host
    const viewer = room.viewers.get(fromHost ? msg.to : c.peer)
    if (!viewer?.admitted || !(fromHost ? !toHost : toHost)) return err("not-allowed")
    if (JSON.stringify(msg.data ?? null).length > 60000) return err("too-big")
    this.sendPeer(msg.to, { t: "signal", from: c.peer, data: msg.data })
  }

  kick(c, msg) {
    const room = this.rooms.get(c.room)
    if (!room || c.role !== "host" || !room.viewers.has(msg.peer)) return
    this.sendPeer(msg.peer, { t: "ended", reason: "kicked" })
    this.dropViewer(room, msg.peer)
  }

  rotate(c, err) {
    const room = this.rooms.get(c.room)
    if (!room || c.role !== "host") return err("not-allowed")
    const secret = randomCode(8)
    room.secretHash = sha(secret); room.codeExpires = this.now() + this.o.codeTtlMs; room.locked = false; room.fails = 0
    c.send({ t: "code", code: formatCode(room.id, secret), codeExpires: room.codeExpires })
  }

  set(c, msg) {
    const room = this.rooms.get(c.room)
    if (!room || c.role !== "host") return
    if (typeof msg.approval === "boolean") room.approval = msg.approval
    if (typeof msg.locked === "boolean") room.locked = msg.locked
    c.send({ t: "settings", approval: room.approval, locked: room.locked })
  }

  /** volta depois de uma queda (mesmo id de peer: as conexões WebRTC continuam valendo) */
  resume(clientId, c, msg, err) {
    if (this.blocked(c.ip)) return err("rate")
    const room = this.rooms.get(String(msg.room || ""))
    if (!room) return err("no-room")
    if (msg.role === "host") {
      if (typeof msg.key !== "string" || !timingSafeEqual(room.hostKey, sha(msg.key))) { this.fail(c.ip); return err("bad-key") }
      const old = this.peers.get(room.host)
      if (old && old !== clientId) { const oc = this.clients.get(old); if (oc) Object.assign(oc, { peer: null, room: null, role: null }) }
      this.cancel(room.hostAway); room.hostAway = null
      Object.assign(c, { peer: room.host, room: room.id, role: "host", name: room.name })
      this.peers.set(room.host, clientId)
      const viewers = [...room.viewers].filter(([, v]) => v.admitted).map(([peer, v]) => ({ peer, name: v.name }))
      const requests = [...room.viewers].filter(([, v]) => !v.admitted).map(([peer, v]) => ({ peer, name: v.name }))
      c.send({ t: "resumed", role: "host", peer: room.host, ice: this.ice(room.host), viewers, requests })
      for (const [peer, v] of room.viewers) if (v.admitted) this.sendPeer(peer, { t: "host-back" })
      return
    }
    const peer = String(msg.peer || "")
    const v = room.viewers.get(peer)
    if (!v || typeof msg.key !== "string" || msg.key.length !== v.resume.length || !timingSafeEqual(Buffer.from(msg.key), Buffer.from(v.resume))) { this.fail(c.ip); return err("bad-key") }
    this.cancel(v.away); v.away = null
    Object.assign(c, { peer, room: room.id, role: "viewer", name: v.name })
    this.peers.set(peer, clientId)
    c.send({ t: "resumed", role: "viewer", peer, host: room.host, ice: this.ice(peer), admitted: v.admitted, hostAway: !!room.hostAway })
  }

  /** a conexão caiu: espera um pouco antes de tirar a pessoa da sala */
  disconnect(clientId) {
    const c = this.clients.get(clientId)
    this.clients.delete(clientId)
    if (!c?.room || this.peers.get(c.peer) !== clientId) return
    this.peers.delete(c.peer)
    const room = this.rooms.get(c.room)
    if (!room) return
    if (c.role === "host") {
      for (const [peer, v] of room.viewers) if (v.admitted) this.sendPeer(peer, { t: "host-away" })
      room.hostAway = this.later(this.o.hostGraceMs, () => this.end(room.id, "host-lost"))
    } else {
      const v = room.viewers.get(c.peer)
      if (!v) return
      if (!v.admitted) return this.dropViewer(room, c.peer)
      v.away = this.later(this.o.viewerGraceMs, () => this.dropViewer(room, c.peer))
    }
  }

  leave(clientId) {
    const c = this.clients.get(clientId)
    if (!c?.room) return
    const room = this.rooms.get(c.room)
    if (c.role === "host") return this.end(c.room, "host-ended", c)
    if (room) this.dropViewer(room, c.peer)
  }

  dropViewer(room, peer) {
    const v = room.viewers.get(peer)
    if (!v) return
    this.cancel(v.away)
    room.viewers.delete(peer)
    this.sendPeer(room.host, v.admitted ? { t: "peer-left", peer } : { t: "request-cancel", peer })
    const cid = this.peers.get(peer)
    const vc = this.clients.get(cid)
    if (vc) Object.assign(vc, { peer: null, room: null, role: null })
    this.peers.delete(peer)
  }

  end(roomId, reason, by = null) {
    const room = this.rooms.get(roomId)
    if (!room) return
    if (by && by.peer !== room.host) return
    this.cancel(room.ttl); this.cancel(room.hostAway)
    for (const [peer, v] of room.viewers) {
      this.cancel(v.away)
      this.sendPeer(peer, { t: "ended", reason })
      const vc = this.clients.get(this.peers.get(peer)); if (vc) Object.assign(vc, { peer: null, room: null, role: null })
      this.peers.delete(peer)
    }
    const hc = this.clients.get(this.peers.get(room.host))
    if (hc) { hc.send({ t: "ended", reason }); Object.assign(hc, { peer: null, room: null, role: null }) }
    this.peers.delete(room.host)
    this.rooms.delete(roomId)
  }
}
