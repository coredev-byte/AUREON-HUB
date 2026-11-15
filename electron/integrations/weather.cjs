"use strict"
// Clima real (Open-Meteo, sem chave). Uma busca compartilhada por notch e widgets, guardada por 15 min.
const CODES = {
  0: ["Céu limpo", "clear"], 1: ["Poucas nuvens", "clear"], 2: ["Parcialmente nublado", "cloudy"], 3: ["Nublado", "cloudy"],
  45: ["Neblina", "fog"], 48: ["Neblina", "fog"], 51: ["Garoa fraca", "rain"], 53: ["Garoa", "rain"], 55: ["Garoa forte", "rain"],
  56: ["Garoa congelante", "rain"], 57: ["Garoa congelante", "rain"], 61: ["Chuva fraca", "rain"], 63: ["Chuva", "rain"], 65: ["Chuva forte", "rain"],
  66: ["Chuva congelante", "rain"], 67: ["Chuva congelante", "rain"], 71: ["Neve fraca", "snow"], 73: ["Neve", "snow"], 75: ["Neve forte", "snow"],
  77: ["Grãos de neve", "snow"], 80: ["Pancadas fracas", "rain"], 81: ["Pancadas de chuva", "rain"], 82: ["Pancadas fortes", "rain"],
  85: ["Pancadas de neve", "snow"], 86: ["Pancadas de neve", "snow"], 95: ["Trovoadas", "storm"], 96: ["Trovoadas com granizo", "storm"], 99: ["Trovoadas com granizo", "storm"],
}
const describe = (code) => CODES[code] ?? ["—", "cloudy"]

/** transforma a resposta da Open-Meteo no formato usado pelo app */
function parseForecast(j, city) {
  const c = j?.current
  if (!c || typeof c.temperature_2m !== "number") throw new Error("Resposta sem dados atuais")
  const [label, kind] = describe(c.weather_code)
  const days = (j.daily?.time ?? []).slice(0, 5).map((t, i) => ({
    date: t, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max?.[i] ?? null,
    kind: describe(j.daily.weather_code[i])[1],
  }))
  return {
    city: city.name, temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m,
    code: c.weather_code, label, kind, isDay: c.is_day === 1, days, at: Date.now(),
  }
}

function createWeather({ fetch, broadcast, getCity }) {
  let cache = null, inflight = null, timer = null, subs = 0, lastError = ""
  async function refresh(force = false) {
    const city = getCity()
    if (!city) { lastError = "Escolha sua cidade em Configurações."; broadcast("weather:state", { error: lastError }); return null }
    const key = city.lat.toFixed(3) + "," + city.lon.toFixed(3)
    if (!force && cache && cache.key === key && Date.now() - cache.data.at < 15 * 60e3) return cache.data
    if (inflight) return inflight
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`
    inflight = (async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000)
        const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t))
        if (!r.ok) throw new Error("HTTP " + r.status)
        const data = parseForecast(await r.json(), city)
        cache = { key, data }; lastError = ""
        broadcast("weather:state", data)
        return data
      } catch (e) {
        lastError = "Sem dados do clima agora (" + (e.name === "AbortError" ? "tempo esgotado" : e.message) + ")."
        broadcast("weather:state", cache?.data ? { ...cache.data, stale: true, error: lastError } : { error: lastError })
        return cache?.data ?? null
      } finally { inflight = null }
    })()
    return inflight
  }
  async function search(q) {
    q = String(q || "").trim().slice(0, 80)
    if (q.length < 2) return []
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt&format=json`)
    if (!r.ok) throw new Error("HTTP " + r.status)
    const j = await r.json()
    return (j.results ?? []).map((x) => ({ name: [x.name, x.admin1, x.country_code].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }))
  }
  return {
    subscribe() {
      subs++
      if (!timer) timer = setInterval(() => refresh(), 15 * 60e3)
      void refresh()
      return cache?.data ?? (lastError ? { error: lastError } : null)
    },
    unsubscribe() { subs = Math.max(0, subs - 1); if (!subs) { clearInterval(timer); timer = null } },
    refresh: () => refresh(true),
    search,
    stop() { clearInterval(timer); timer = null },
  }
}

module.exports = { createWeather, parseForecast, describe }
