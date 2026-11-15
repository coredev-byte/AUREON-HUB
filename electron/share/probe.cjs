"use strict"
// Teste do servidor de sinalização configurado: pede /health por HTTPS (o mesmo host do wss://) e traduz o erro.

function errorKind(msg) {
  const m = String(msg || "")
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(m)) return "dns"
  if (/ERR_CERT_DATE_INVALID/i.test(m)) return "clock"
  if (/ERR_CERT|ERR_SSL|CERT_|SSL_/i.test(m)) return "cert"
  if (/ERR_PROXY|ERR_TUNNEL/i.test(m)) return "proxy"
  if (/ERR_INTERNET_DISCONNECTED|ENETUNREACH|ERR_ADDRESS_UNREACHABLE/i.test(m)) return "offline"
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(m)) return "refused"
  if (/ERR_CONNECTION_RESET|ECONNRESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/i.test(m)) return "reset"
  if (/TIMED_OUT|ETIMEDOUT|abort/i.test(m)) return "timeout"
  return "other"
}

/** wss://host/ws -> https://host/health (ws:// -> http://, só para testes locais) */
function healthUrl(signalUrl) {
  const u = new URL(signalUrl)
  if (!/^wss?:$/.test(u.protocol)) throw new Error("Use um endereço wss://")
  u.protocol = u.protocol === "wss:" ? "https:" : "http:"
  u.pathname = "/health"; u.search = ""; u.hash = ""
  return u.toString()
}

async function probeSignal(fetchImpl, signalUrl, timeoutMs = 8000) {
  let url
  try { url = healthUrl(signalUrl) } catch (e) { return { ok: false, kind: "config", error: e.message, ms: 0 } }
  const t0 = Date.now()
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, cache: "no-store" })
    const ms = Date.now() - t0
    if (!r.ok) return { ok: false, kind: r.status >= 500 ? "server" : "blocked", error: "HTTP " + r.status, ms }
    const j = await r.json().catch(() => null)
    if (!j || j.service !== "aureon-signal") return { ok: false, kind: "wrong", error: "Não é um servidor Aureon", ms }
    const date = r.headers.get("date")
    return { ok: true, ms, version: j.version, turn: !!j.turn, rooms: j.rooms, clockSkewMs: date ? Date.now() - Date.parse(date) : null }
  } catch (e) {
    const error = String(e?.message || e).slice(0, 160)
    return { ok: false, kind: errorKind(error), error, ms: Date.now() - t0 }
  } finally { clearTimeout(t) }
}

module.exports = { probeSignal, healthUrl, errorKind }
