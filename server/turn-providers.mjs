// Credenciais TURN de serviços prontos (sem precisar de VPS própria):
//  - Cloudflare Realtime TURN: CF_TURN_KEY_ID + CF_TURN_API_TOKEN
//  - Metered: METERED_APP (ex.: "aureon" de aureon.metered.live) + METERED_API_KEY
// O servidor busca as credenciais (temporárias), guarda em memória e renova antes de vencer.
// As chaves ficam só no servidor; os apps recebem apenas credenciais de curta duração.

const CF_TTL_S = 24 * 3600

/** normaliza para [{ urls: string[], username?, credential? }] e tira portas que travam navegadores (53) */
export function normalize(list) {
  const arr = Array.isArray(list) ? list : list ? [list] : []
  return arr
    .map((s) => ({ ...s, urls: [s?.urls].flat().filter((u) => typeof u === "string" && !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length)
    .map((s) => (s.username ? { urls: s.urls, username: String(s.username), credential: String(s.credential ?? "") } : { urls: s.urls }))
}

export async function fetchCloudflare(fetchImpl, keyId, token) {
  const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: CF_TTL_S }),
  })
  if (!r.ok) throw new Error(`Cloudflare TURN respondeu ${r.status}`)
  const j = await r.json()
  return normalize(j.iceServers)
}

export async function fetchMetered(fetchImpl, app, apiKey) {
  const host = /\./.test(app) ? app : `${app}.metered.live`
  const r = await fetchImpl(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
  if (!r.ok) throw new Error(`Metered respondeu ${r.status}`)
  return normalize(await r.json())
}

/** escolhe o provedor pelas variáveis de ambiente (null = nenhum) */
export function providerFromEnv(env, fetchImpl = fetch) {
  if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) return { name: "cloudflare", get: () => fetchCloudflare(fetchImpl, env.CF_TURN_KEY_ID, env.CF_TURN_API_TOKEN), refreshMs: 6 * 3600e3 }
  if (env.METERED_APP && env.METERED_API_KEY) return { name: "metered", get: () => fetchMetered(fetchImpl, env.METERED_APP, env.METERED_API_KEY), refreshMs: 3 * 3600e3 }
  return null
}

/** mantém credenciais em memória; refresh em segundo plano, tenta de novo em 1 min se falhar */
export function createTurnCache(provider, log = console) {
  let servers = [], lastError = "", timer = null
  async function refresh() {
    clearTimeout(timer)
    try {
      servers = await provider.get()
      lastError = ""
      timer = setTimeout(refresh, provider.refreshMs)
    } catch (e) {
      lastError = String(e?.message || e)
      log.warn?.("TURN:", lastError)
      timer = setTimeout(refresh, 60e3)
    }
    timer.unref?.()
    return servers
  }
  return { refresh, get: () => servers, status: () => ({ provider: provider.name, ok: servers.some((s) => s.username), error: lastError }), stop: () => clearTimeout(timer) }
}
