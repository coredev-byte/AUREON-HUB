// Servidor de sinalização do Aureon Hub (WebSocket). Uso: node server/index.mjs
// Variáveis de ambiente: veja server/README.md.
import http from "node:http"
import { randomBytes } from "node:crypto"
import { WebSocketServer } from "ws"
import { Hub } from "./hub.mjs"

export const VERSION = "1.0.0"
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean)

export function configFromEnv(env = process.env) {
  return {
    port: Number(env.PORT) || 8787,
    host: env.HOST || "0.0.0.0",
    trustProxy: env.TRUST_PROXY === "1",
    maxPerIp: Number(env.MAX_CONN_PER_IP) || 30,
    hub: {
      maxViewers: Number(env.MAX_VIEWERS) || 8,
      roomTtlMs: (Number(env.ROOM_TTL_MIN) || 480) * 60e3,
      codeTtlMs: (Number(env.CODE_TTL_MIN) || 120) * 60e3,
      stun: env.STUN_URLS ? list(env.STUN_URLS) : undefined,
      turnUrls: list(env.TURN_URLS),
      turnSecret: env.TURN_SECRET || "",
      turnUser: env.TURN_USERNAME || "",
      turnPass: env.TURN_CREDENTIAL || "",
      turnTtlS: Number(env.TURN_TTL_S) || 6 * 3600,
    },
  }
}

export function startServer(cfg = configFromEnv()) {
  const hubOpts = Object.fromEntries(Object.entries(cfg.hub).filter(([, v]) => v !== undefined))
  const hub = new Hub(hubOpts)
  const perIp = new Map()

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" })
      return res.end(JSON.stringify({ service: "aureon-signal", version: VERSION, turn: cfg.hub.turnUrls.length > 0, ...hub.stats() }))
    }
    res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024, perMessageDeflate: false })

  wss.on("connection", (ws, req) => {
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || ""
    const n = (perIp.get(ip) ?? 0) + 1
    if (n > cfg.maxPerIp) { ws.close(1013, "muitas conexões"); return }
    perIp.set(ip, n)
    const cid = randomBytes(9).toString("base64url")
    hub.connect(cid, (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)) }, ip)
    // limite de mensagens (balde de fichas): 120 de rajada, 60 por segundo
    let tokens = 120, last = Date.now(), alive = true
    ws.on("pong", () => { alive = true })
    const beat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; try { ws.ping() } catch {} }, 20000)
    ws.on("message", (raw, isBinary) => {
      const now = Date.now()
      tokens = Math.min(120, tokens + ((now - last) / 1000) * 60); last = now
      if (--tokens < 0) { ws.close(1008, "mensagens demais"); return }
      if (isBinary) return
      let msg
      try { msg = JSON.parse(raw.toString("utf8")) } catch { return }
      try { hub.handle(cid, msg) } catch (e) { console.error("erro ao tratar mensagem", e) }
    })
    ws.on("close", () => {
      clearInterval(beat)
      perIp.set(ip, (perIp.get(ip) ?? 1) - 1)
      if (perIp.get(ip) <= 0) perIp.delete(ip)
      hub.disconnect(cid)
    })
    ws.on("error", () => {})
  })

  return new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      const addr = server.address()
      resolve({
        port: typeof addr === "object" ? addr.port : cfg.port, hub,
        /** só para testes: derruba todas as conexões (simula queda de rede) */
        dropAll: () => { for (const c of wss.clients) c.terminate() },
        close: () => new Promise((r) => { hub.close(); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()) }),
      })
    })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = configFromEnv()
  startServer(cfg).then(({ port }) => {
    console.log(`aureon-signal ${VERSION} ouvindo na porta ${port} (TURN: ${cfg.hub.turnUrls.length ? "sim" : "não"})`)
  })
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(0))
}
