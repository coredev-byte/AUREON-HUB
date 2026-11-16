import test from "node:test"
import assert from "node:assert/strict"
import { normalize, fetchCloudflare, fetchMetered, providerFromEnv, createTurnCache } from "../server/turn-providers.mjs"
import { Hub } from "../server/hub.mjs"

const cfBody = { iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] }

test("Cloudflare: POST com Bearer e ttl, porta 53 removida", async () => {
  let req
  const fake = async (url, init) => { req = { url, init }; return { ok: true, status: 201, json: async () => cfBody } }
  const s = await fetchCloudflare(fake, "KEY", "TOKEN")
  assert.equal(req.url, "https://rtc.live.cloudflare.com/v1/turn/keys/KEY/credentials/generate-ice-servers")
  assert.equal(req.init.method, "POST")
  assert.equal(req.init.headers.Authorization, "Bearer TOKEN")
  assert.equal(JSON.parse(req.init.body).ttl, 86400)
  assert.equal(s[1].username, "u")
  assert.ok(!s[1].urls.some((u) => u.includes(":53")))
})
test("Metered: GET com apiKey, lista solta", async () => {
  let url
  const fake = async (u) => { url = u; return { ok: true, json: async () => [{ urls: "stun:stun.relay.metered.ca:80" }, { urls: "turn:global.relay.metered.ca:80", username: "a", credential: "b" }] } }
  const s = await fetchMetered(fake, "aureon", "K")
  assert.equal(url, "https://aureon.metered.live/api/v1/turn/credentials?apiKey=K")
  assert.deepEqual(s[1], { urls: ["turn:global.relay.metered.ca:80"], username: "a", credential: "b" })
})
test("provedor escolhido pelas variáveis", () => {
  assert.equal(providerFromEnv({ CF_TURN_KEY_ID: "a", CF_TURN_API_TOKEN: "b" }).name, "cloudflare")
  assert.equal(providerFromEnv({ METERED_APP: "a", METERED_API_KEY: "b" }).name, "metered")
  assert.equal(providerFromEnv({}), null)
})
test("cache entra no ICE das salas; erro não derruba", async () => {
  const cache = createTurnCache({ name: "cloudflare", refreshMs: 1e9, get: async () => normalize(cfBody.iceServers) }, { warn() {} })
  await cache.refresh()
  const hub = new Hub({ extraIce: cache.get })
  const ice = hub.ice("p")
  assert.ok(ice.some((s) => s.username === "u"))
  assert.equal(cache.status().ok, true)
  const bad = createTurnCache({ name: "metered", refreshMs: 1e9, get: async () => { throw new Error("401") } }, { warn() {} })
  await bad.refresh()
  assert.equal(bad.status().ok, false)
  assert.match(bad.status().error, /401/)
  cache.stop(); bad.stop(); hub.close()
})
test("normalize ignora lixo", () => {
  assert.deepEqual(normalize(null), [])
  assert.deepEqual(normalize([{ urls: 5 }]), [])
})
