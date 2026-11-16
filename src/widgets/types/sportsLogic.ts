// Regras puras dos widgets de esportes (sem React/DOM: testadas em tests/sports-aureon.test.mjs).
import type { FavTeam, SportMatch, SportTeam } from "../widgy/compat/bridge"

export interface Match extends SportMatch { minute?: number; period?: number; clock?: string }
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
export const isFav = (t: SportTeam, favs: FavTeam[]) => favs.some((f) => (f.id && t.id ? f.id === t.id : norm(f.name) === norm(t.name) || (!!t.short && norm(f.name) === norm(t.short))))

/** "Hoje · 21:30", "Amanhã · 16:00", "sáb 22/11 · 16:00" */
export function when(ts: number, now = Date.now()) {
  if (!(ts > 86400e3)) return "Data a definir"
  const d = new Date(ts), t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(d) - day(new Date(now))) / 86400e3)
  if (diff === 0) return "Hoje · " + t
  if (diff === 1) return "Amanhã · " + t
  if (diff === -1) return "Ontem · " + t
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "") + " · " + t
}
/** texto do tempo de jogo e fração (0–1) para a barra */
export function liveInfo(m: Match): { text: string; frac: number | null } {
  if (m.detail === "Intervalo") return { text: "Intervalo", frac: 0.5 }
  if (m.league && /^(nba|wnba)/.test(m.league) || m.id.startsWith("bk-")) return { text: m.period ? `${m.period}º quarto${m.clock ? " · " + m.clock : ""}` : m.detail, frac: m.period ? Math.min(1, (m.period - 1) / 4 + 0.125) : null }
  if (m.minute) {
    const half = m.period === 2 || m.minute > 45 ? "2º tempo" : "1º tempo"
    return { text: `${half} · ${m.clock || m.minute + "'"}`, frac: Math.min(1, m.minute / 90) }
  }
  return { text: m.detail || "Ao vivo", frac: null }
}

/** a partida para o destaque: favorito ao vivo > qualquer ao vivo > próximo favorito > próximo > último resultado */
export function featured(list: Match[], favs: FavTeam[]): Match | null {
  const fav = (m: Match) => isFav(m.a, favs) || isFav(m.b, favs)
  // times "a definir" ou sem horário só entram se não houver nada melhor
  const known = (m: Match) => m.start > 86400e3 && ![m.a.name, m.b.name].some((n) => !n || /^(a definir|tbd)$/i.test(n))
  const live = list.filter((m) => m.state === "live")
  const up = list.filter((m) => m.state === "upcoming").sort((a, b) => a.start - b.start)
  const next = [...up.filter(known), ...up.filter((m) => !known(m))]
  return live.find(fav) ?? live[0] ?? next.find(fav) ?? next[0] ?? [...list].filter((m) => m.state === "done").sort((a, b) => b.start - a.start)[0] ?? null
}

