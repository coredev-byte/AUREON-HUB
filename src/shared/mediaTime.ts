import type { MediaSession } from "./types"

/**
 * Posição real da música agora (s). O Windows informa a posição junto com o instante em que ela foi medida
 * (LastUpdatedTime): somar o tempo desde ESSE instante é bem mais preciso que contar desde a leitura (que
 * acontece a cada ~1 s e chegava atrasada). Players que não informam o instante usam a leitura.
 */
export function livePosition(s: Pick<MediaSession, "playing" | "pos" | "dur" | "upd" | "at">, now = Date.now()) {
  if (!s.playing) return s.pos
  const upd = s.upd ?? 0
  const base = upd > 0 && upd <= now + 2000 && now - upd < 6 * 3600e3 ? upd : s.at
  return Math.max(0, Math.min(s.dur || Infinity, s.pos + (now - base) / 1000))
}
