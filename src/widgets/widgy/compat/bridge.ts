// Ponte de compatibilidade: a mesma API que os widgets do Widgy usavam, apontando para o Aureon.
import { invoke, on } from "@/shared/bridge"

export interface SportTeam { id?: string; name: string; short: string; logo?: string; flag?: string; score?: string; win?: boolean }
export interface FavTeam { id?: string; name: string; short?: string; logo?: string; flag?: string; league?: string }
export interface TeamHit { id: string; name: string; short?: string; logo?: string; league?: string; inactive?: boolean }
export interface TeamGame {
  id: string; start: number; state: "live" | "upcoming" | "done"; result?: "W" | "L" | "D"
  us: { score?: string; win: boolean }
  opp: { name: string; short?: string; logo: string; flag?: string; score?: string; win: boolean }
  home?: boolean; league?: string; detail: string; event: string; eventLogo: string; link: string
}
export interface TeamCard {
  team: { id: string; name: string; full?: string; short: string; logo: string; logoDark?: string; logoData?: string; banner?: string; colors: string[]; link: string }
  live?: TeamGame; last?: TeamGame; next?: TeamGame; form: string[]; recent: TeamGame[]; at: number; stale?: boolean; error?: string
}
export interface SportMatch {
  id: string; start: number; state: "live" | "upcoming" | "done"; a: SportTeam; b: SportTeam
  detail: string; event: string; eventLogo?: string; league?: string; link: string
}
export interface ValAgentNow { id: string; locked: boolean; state: string; map?: string }
type Sport = "cs2" | "valorant" | "football"

export const bridge = {
  app: { openExternal: (url: string) => invoke("app:external", url) },
  /** texto de uma URL pública, buscado pelo processo principal (sem CORS, com limites de tamanho e tempo) */
  net: { text: (url: string) => invoke<string>("net:text", url) },
  sports: {
    get: (sport: Sport, opts?: { leagues?: string[]; teams?: { id?: string; league?: string }[] }) => invoke<SportMatch[]>("sports:get", sport, opts ?? {}),
    teams: (sport: Sport, opts?: { leagues?: string[] }) => invoke<FavTeam[]>("sports:teams", sport, opts ?? {}),
  },
  team: {
    search: (game: string, q: string, opts?: { leagues?: string[] }) => invoke<TeamHit[]>("team:search", game, q, opts),
    card: (game: string, t: TeamHit, opts?: { peek?: boolean }) => invoke<TeamCard | null>("team:card", game, t, opts),
  },
  games: {
    valorantAgent: () => invoke<ValAgentNow | null>("valorant:agent"),
    onValorantAgent: (cb: (a: ValAgentNow | null) => void) => on("valorant:agent", cb),
  },
}

export const friendlyError = (e: unknown) => {
  const m = String((e as any)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
  if (/ERR_(CONNECTION|INTERNET|NAME_NOT_RESOLVED|NETWORK|TIMED_OUT)|Failed to fetch/.test(m)) return "Sem conexão com a internet"
  return m
}
/** imagens da biblioteca do Aureon já são data: URLs */
export const mediaUrl = (file: string | null | undefined) => file || ""
