// Aba Mídia do notch: a mesma do painel Carbono do Widgy (capa que gira e reage ao som, onda de progresso,
// aleatório/repetir, letra rolando e escolha do player). Portada do src/shell/Dashboard.tsx do Widgy.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react"
import { appLabel, fmtTime, mediaCommand, useMedia, useMediaPosition } from "@/shared/hooks"
import { useCoverArt } from "@/shared/coverArt"
import { lineAt, useLyrics } from "@/shared/lyrics"
import { bass, liveSpectrum, rafLoop, spectrum, useSpectrum } from "@/shared/spectrum"
import { patch, useSection } from "@/shared/state"
import type { MediaSession } from "@/shared/types"

export const PLAYERS = [
  { id: "", label: "Automático" }, { id: "spotify", label: "Spotify" }, { id: "youtube", label: "YouTube Music" }, { id: "deezer", label: "Deezer" },
  { id: "applemusic", label: "Apple Music" }, { id: "amazon", label: "Amazon Music" }, { id: "tidal", label: "TIDAL" }, { id: "chrome", label: "Chrome" }, { id: "msedge", label: "Edge" },
] as const
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ")
const REPEAT_LABEL = ["Repetir: desligado", "Repetir: esta música", "Repetir: a lista"] as const

/** música do notch: a sessão escolhida + capa (do Windows ou reserva do iTunes/Deezer) + posição exata */
export function useNotchMedia() {
  const filter = useSection("notch")?.mediaSource ?? ""
  const { session } = useMedia(filter)
  const art = useCoverArt(session)
  const pos = useMediaPosition(session, 250)
  const m = session ? { ...session, art } : null
  const cmd = (c: Parameters<typeof mediaCommand>[0], a?: number | boolean) => { if (session) void mediaCommand(c, session.app, a) }
  return { m, pos, cmd }
}

export function CarbonoMediaTab() {
  const { m, pos, cmd } = useNotchMedia()
  // aleatório/repetir mudam na hora; o Windows confirma no próximo envio
  const [ov, setOv] = useState<{ shuffle?: boolean; repeat?: 0 | 1 | 2; at: number } | null>(null)
  const fresh = ov && performance.now() - ov.at < 2500 ? ov : null
  const shuffle = fresh?.shuffle ?? !!m?.shuffle
  const repeat = (fresh?.repeat ?? m?.repeat ?? 0) as 0 | 1 | 2
  const noCtl = "O player não permite isso pelo Windows"
  return (
    <div className="sh grid h-[252px] gap-3" style={{ gridTemplateColumns: "236px minmax(0,1fr) 262px" }}>
      <div className="flex items-center justify-center">
        <ReactiveCover art={m?.art} playing={!!m?.playing} size={214} />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={(m?.title ?? "") + (m?.artist ?? "")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="min-w-0">
            <div className="truncate text-[22px] font-semibold tracking-[-.01em]">{m?.title ?? "Nada tocando"}</div>
            <div className="truncate text-[13px]" style={{ color: "var(--sh-muted)" }}>{m?.artist || "Abra o Spotify ou outro player"}</div>
            {m?.album && m.album !== m.title && <div className="truncate text-[12px]" style={{ color: "var(--sh-dim)" }}>{m.album}</div>}
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex items-center gap-3 text-[11px] tabular-nums" style={{ color: "var(--sh-muted)" }}>
          <span className="w-8 text-right">{fmtTime(pos)}</span>
          <WaveProgress value={m?.dur ? pos / m.dur : 0} playing={!!m?.playing} onSeek={m?.canSeek && m.dur ? (p) => cmd("seek", p * m.dur) : undefined} />
          <span className="w-8">{fmtTime(m?.dur ?? 0)}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <button type="button" className="sh-btn relative size-10" aria-label="Ordem aleatória" aria-pressed={shuffle}
            title={m?.canShuffle ? (shuffle ? "Ordem aleatória: ligada" : "Ordem aleatória: desligada") : noCtl}
            disabled={!m?.canShuffle} style={{ color: shuffle ? "var(--sh-accent)" : undefined, opacity: m?.canShuffle ? 1 : 0.35 }}
            onClick={() => { setOv({ ...fresh, shuffle: !shuffle, at: performance.now() }); cmd("shuffle", !shuffle) }}>
            <Shuffle size={16} />{shuffle && <span className="absolute bottom-1 size-1 rounded-full" style={{ background: "var(--sh-accent)" }} />}
          </button>
          <button type="button" className="sh-btn size-10" aria-label="Anterior" disabled={!m || m.canPrev === false} onClick={() => cmd("prev")}><SkipBack size={17} fill="currentColor" /></button>
          <PlayButton playing={!!m?.playing} disabled={!m} onClick={() => cmd("toggle")} />
          <button type="button" className="sh-btn size-10" aria-label="Próxima" disabled={!m || m.canNext === false} onClick={() => cmd("next")}><SkipForward size={17} fill="currentColor" /></button>
          <button type="button" className="sh-btn relative size-10" aria-label={REPEAT_LABEL[repeat]} aria-pressed={repeat !== 0}
            title={m?.canRepeat ? REPEAT_LABEL[repeat] : noCtl}
            disabled={!m?.canRepeat} style={{ color: repeat ? "var(--sh-accent)" : undefined, opacity: m?.canRepeat ? 1 : 0.35 }}
            onClick={() => { const next = (repeat === 0 ? 2 : repeat === 2 ? 1 : 0) as 0 | 1 | 2; setOv({ ...fresh, repeat: next, at: performance.now() }); cmd("repeat", next) }}>
            {repeat === 1 ? <Repeat1 size={16} /> : <Repeat size={16} />}{repeat !== 0 && <span className="absolute bottom-1 size-1 rounded-full" style={{ background: "var(--sh-accent)" }} />}
          </button>
        </div>
      </div>
      <div className="sh-card flex min-h-0 flex-col">
        <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[12px] font-semibold"><Music2 size={13} /> Letra</div>
        <LyricsPane m={m} pos={pos} />
        <PlayerChip m={m} />
      </div>
    </div>
  )
}

/** botão de tocar/pausar: pílula larga tocando, círculo pausado */
export function PlayButton({ playing, disabled, onClick, small }: { playing: boolean; disabled?: boolean; onClick: () => void; small?: boolean }) {
  const h = small ? 32 : 48
  return (
    <motion.button type="button" aria-label={playing ? "Pausar" : "Tocar"} disabled={disabled} onClick={onClick}
      animate={{ width: playing ? h * 1.4 : h, borderRadius: playing ? h * 0.34 : h / 2 }} whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center justify-center disabled:opacity-40" style={{ height: h, background: "var(--sh-fg)", color: "var(--sh-on-fg, #141414)" }}>
      {playing ? <Pause size={small ? 14 : 18} fill="currentColor" /> : <Play size={small ? 14 : 18} fill="currentColor" className="translate-x-px" />}
    </motion.button>
  )
}

/** letra que acompanha a música: a linha que toca fica no meio; sem tempo marcado, rola pelo progresso */
function LyricsPane({ m, pos }: { m: (MediaSession & { art: string | null }) | null; pos: number }) {
  const lyrics = useLyrics(m?.title, m?.artist, m?.dur, !!m)
  const lines = lyrics && lyrics.synced?.length ? lyrics.synced : null
  const plain = lyrics && !lines && lyrics.plain ? lyrics.plain.split(/\r?\n/) : null
  const cur = lines ? lineAt(lines, pos + 0.15) : -1
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)
  const progress = m?.dur ? Math.min(1, Math.max(0, pos / m.dur)) : 0
  useLayoutEffect(() => {
    const b = box.current, l = list.current
    if (!b || !l) return
    if (lines) {
      const el = l.querySelector<HTMLElement>(`[data-l="${Math.max(0, cur)}"]`)
      if (el) setY(b.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2))
    } else if (plain) setY(-Math.max(0, l.scrollHeight - b.clientHeight) * progress)
    else setY(0)
  }, [cur, lines, plain, progress])
  useEffect(() => { setY(0) }, [m?.title])
  const msg = (t: string) => <p className="px-4 pt-6 text-[12px]" style={{ color: "var(--sh-dim)" }}>{t}</p>
  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(transparent, #000 22%, #000 78%, transparent)" }}>
      {!m ? msg("A letra aparece aqui quando uma música tocar.")
        : lyrics === null ? msg("Procurando a letra…")
        : lyrics === false || (!lines && !plain) ? msg("Letra não encontrada para esta música.")
        : (
          <motion.div ref={list} className="px-4" animate={{ y }} transition={{ type: "spring", stiffness: 90, damping: 20, mass: 0.8 }}>
            {lines ? lines.map((l, i) => {
              const d = Math.abs(i - cur)
              return (
                <p key={i} data-l={i} className="origin-left cursor-pointer py-1 text-[12.5px] leading-snug transition-[color,opacity,transform] duration-300"
                  onClick={() => m?.canSeek && void mediaCommand("seek", m.app, l.t)}
                  style={{ color: i === cur ? "var(--sh-fg)" : "var(--sh-muted)", fontWeight: i === cur ? 600 : 400, opacity: i === cur ? 1 : Math.max(0.25, 0.75 - d * 0.14), transform: i === cur ? "scale(1.04)" : "none" }}>
                  {l.text || "♪"}
                </p>
              )
            }) : plain!.map((t, i) => <p key={i} className="py-0.5 text-[12px] leading-snug" style={{ color: "var(--sh-muted)" }}>{t || " "}</p>)}
          </motion.div>
        )}
    </div>
  )
}

/** de qual player o notch mostra a música */
function PlayerChip({ m }: { m: MediaSession | null }) {
  const player = useSection("notch")?.mediaSource ?? ""
  const [open, setOpen] = useState(false)
  const label = m ? appLabel(m.app) : PLAYERS.find((p) => p.id === player)?.label ?? "Automático"
  return (
    <div className="relative mx-3 mb-3 mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Escolher o player"
        className="flex w-full items-center justify-center gap-2 rounded-full py-1.5 text-[11px] transition-colors hover:brightness-125" style={{ background: "var(--sh-2)", color: "var(--sh-muted)" }}>
        <span className="size-1.5 rounded-full" style={{ background: m?.playing ? "var(--sh-accent)" : "var(--sh-dim)" }} />
        {label}{player ? " · fixo" : ""}
        <ChevronDown size={12} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }}
            className="absolute inset-x-0 bottom-full z-10 mb-1.5 max-h-[200px] overflow-auto rounded-2xl p-1" style={{ background: "var(--sh-3)", boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
            {PLAYERS.map((p) => (
              <button key={p.id} type="button" onClick={() => { void patch("notch", { mediaSource: p.id }); setOpen(false) }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-[12px] hover:bg-white/5" style={{ color: "var(--sh-fg)" }}>
                {p.label}{player === p.id && <Check size={12} style={{ color: "var(--sh-accent)" }} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** contorno de "flor recortada" (círculo com ondas suaves) para a capa */
function scallop(d: number, waves = 9, depth = 0.045) {
  const r = d / 2
  let p = ""
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2
    const rr = r * (1 - depth + depth * Math.cos(waves * a))
    p += (i ? "L" : "M") + (r + Math.cos(a) * rr).toFixed(1) + " " + (r + Math.sin(a) * rr).toFixed(1)
  }
  return p + "Z"
}

/** capa com uma coroa que segue o espectro do som do PC e pulsa com o grave (sem som capturado, ritmo suave) */
export function ReactiveCover({ art, playing, size }: { art?: string | null; playing: boolean; size: number }) {
  useSpectrum(playing)
  const path = useRef<SVGPathElement>(null)
  const cover = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const N = 72
  const r0 = size * 0.36
  const clip = useMemo(() => `path("${scallop(r0 * 2)}")`, [r0])
  useEffect(() => {
    let energy = playing ? 1 : 0
    const t0 = performance.now()
    let last = 0
    const draw = () => {
      const now = performance.now()
      if (now - last < 30) return
      last = now
      energy += ((playing ? 1 : 0) - energy) * 0.15
      const live = liveSpectrum()
      const t = (now - t0) / 1000
      let d = ""
      for (let i = 0; i < N; i++) {
        const half = i < N / 2 ? i : N - 1 - i
        const a = (i / N) * Math.PI * 2 + Math.PI / 2
        const v = live
          ? spectrum.bands[Math.min(47, 2 + Math.round((half / (N / 2)) * 34))]
          : Math.max(0, 0.5 + 0.5 * Math.sin(i * 0.9 + t * 3.1) * Math.sin(i * 0.37 - t * 1.7) + 0.25 * Math.sin(i * 2.3 + t * 5.3)) * 0.6
        const len = 2 + v * size * 0.12 * energy
        const x1 = size / 2 + Math.cos(a) * (r0 + 5), y1 = size / 2 + Math.sin(a) * (r0 + 5)
        const x2 = size / 2 + Math.cos(a) * (r0 + 5 + len), y2 = size / 2 + Math.sin(a) * (r0 + 5 + len)
        d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
      }
      path.current?.setAttribute("d", d)
      const b = live ? bass() : 0.35 + 0.25 * Math.sin(t * 4.2)
      if (cover.current) cover.current.style.transform = `scale(${(0.96 + 0.04 * energy + 0.045 * b * energy).toFixed(4)})`
      if (glow.current) glow.current.style.opacity = (0.15 + 0.5 * b * energy).toFixed(3)
    }
    draw()
    if (!playing) { let frames = 40; return rafLoop(() => { if (frames-- > 0) draw() }) }
    return rafLoop(draw)
  }, [playing, size, r0])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div ref={glow} aria-hidden className="absolute rounded-full blur-2xl" style={{ inset: size / 2 - r0, background: "var(--sh-accent)", opacity: 0.15, willChange: "opacity" }} />
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        <path ref={path} stroke="var(--sh-accent)" strokeWidth={2.2} strokeLinecap="round" opacity={0.9} />
      </svg>
      <div ref={cover} className="absolute will-change-transform" style={{ inset: size / 2 - r0 }}>
        <div className="relative h-full w-full overflow-hidden" style={{ clipPath: clip, background: "var(--sh-2)", animation: "vinyl-spin 30s linear infinite", animationPlayState: playing ? "running" : "paused" }}>
          <AnimatePresence initial={false}>
            {art ? <motion.img key={art} src={art} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />
              : <motion.span key="none" className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Music2 size={size * 0.14} style={{ color: "var(--sh-dim)" }} />
                </motion.span>}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** progresso em onda enquanto toca (reta quando pausa; mais alta com a música forte); clique para pular */
export function WaveProgress({ value, playing, onSeek }: { value: number; playing: boolean; onSeek?: (p: number) => void }) {
  const path = useRef<SVGPathElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const v = Math.max(0, Math.min(1, value))
  useEffect(() => {
    let amp = playing ? 3 : 0
    let last = 0
    const draw = (now: number) => {
      if (now && now - last < 30) return
      last = now
      const target = !playing ? 0 : liveSpectrum() ? 1.5 + spectrum.level * 3 : 3
      amp += (target - amp) * 0.2
      const end = Math.max(0, v * w - 6)
      let d = "M0 8"
      for (let x = 2; x <= end; x += 2) d += `L${x} ${(8 + Math.sin(x / 7 - now / 260) * amp).toFixed(2)}`
      path.current?.setAttribute("d", d)
    }
    if (!playing) { draw(0); return }
    return rafLoop(() => draw(performance.now()))
  }, [playing, v, w])
  return (
    <div ref={box} className={cx("relative h-4 flex-1", onSeek && "cursor-pointer")} role="slider" aria-label="Posição na música" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}
      onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width) }}>
      <svg width={w} height={16} className="absolute inset-0 overflow-visible" aria-hidden>
        <line x1={v * w + 6} y1={8} x2={w} y2={8} stroke="var(--sh-3)" strokeWidth={3} strokeLinecap="round" />
        <path ref={path} fill="none" stroke="var(--sh-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={v * w - 1.5} y={2} width={3} height={12} rx={1.5} fill="var(--sh-fg)" />
      </svg>
    </div>
  )
}
