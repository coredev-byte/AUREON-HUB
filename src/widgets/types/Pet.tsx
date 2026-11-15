import { useEffect, useRef } from "react"
import { frame, GH, GW, SPECIES, isSpecies, type Pose } from "../pet/sprites"
import { cfg, type WidgetProps } from "../catalog"

/**
 * Pet em pixel art (desenhos reaproveitados do Widgy). Vive dentro do widget: anda, senta, dorme e pula
 * quando você clica. ~12 quadros por segundo com quadros em cache; parado (dormindo) quando pausado.
 */
export default function Pet({ w, paused }: WidgetProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const species = isSpecies(cfg(w, "species", "cat")) ? (cfg(w, "species", "cat") as keyof typeof SPECIES) : "cat"
  const coat = Object.keys(SPECIES[species].coats)[0]
  const st = useRef({ x: 20, dir: 1, mode: "walk" as "walk" | "sit" | "sleep" | "jump", t: 0, phase: 0, until: 0, jump: 0 })

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext("2d")!
    const scale = Math.max(2, Math.floor(Math.min(w.h / GH, w.w / (GW * 2.2))))
    c.width = w.w; c.height = w.h
    ctx.imageSmoothingEnabled = false
    const s = st.current
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      let pose: Pose
      if (s.mode === "sleep") pose = { k: "sleep", breath: Math.round((Math.sin(s.t * 1.5) + 1) * 1.5) / 3, tail: 0 }
      else if (s.mode === "sit") pose = { k: "sit", tail: Math.round(Math.sin(s.t * 2) * 2) / 2, eyes: (s.t * 10) % 40 < 1.5 ? "blink" : "open" }
      else if (s.mode === "jump") pose = { k: "jump", tail: 0.5 }
      else pose = { k: "stand", phase: Math.round(s.phase * 8) / 8 % 1, move: 1, tail: Math.round(Math.sin(s.t * 3) * 2) / 2, eyes: "open" }
      const img = frame(pose, coat, species)
      const dw = GW * scale, dh = GH * scale
      const y = c.height - dh - 6 - (s.mode === "jump" ? Math.sin(Math.min(1, s.jump) * Math.PI) * dh * 0.35 : 0)
      ctx.save()
      if (s.dir < 0) { ctx.translate(s.x + dw, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, y, dw, dh) }
      else ctx.drawImage(img, s.x, y, dw, dh)
      ctx.restore()
    }
    if (paused) { s.mode = "sleep"; draw(); return }
    if (s.mode === "sleep") { s.mode = "sit"; s.until = s.t + 2 }
    const dt = 1 / 12
    const id = setInterval(() => {
      s.t += dt
      const dw = GW * scale
      if (s.mode === "walk") {
        s.phase += dt * 1.6
        s.x += s.dir * 22 * dt * (scale / 3)
        if (s.x < 4) { s.x = 4; s.dir = 1 }
        if (s.x > c.width - dw - 4) { s.x = c.width - dw - 4; s.dir = -1 }
        if (s.t > s.until) { s.mode = Math.random() < 0.7 ? "sit" : "walk"; s.until = s.t + 3 + Math.random() * 5; if (Math.random() < 0.3) s.dir *= -1 }
      } else if (s.mode === "sit") {
        if (s.t > s.until) { const r = Math.random(); s.mode = r < 0.55 ? "walk" : "sleep"; s.until = s.t + (s.mode === "sleep" ? 10 + Math.random() * 10 : 4 + Math.random() * 6) }
      } else if (s.mode === "sleep") {
        if (s.t > s.until) { s.mode = "sit"; s.until = s.t + 3 }
      } else if (s.mode === "jump") {
        s.jump += dt * 2.2
        if (s.jump >= 1) { s.mode = "sit"; s.until = s.t + 2 }
      }
      draw()
    }, 1000 / 12)
    draw()
    return () => clearInterval(id)
  }, [w.w, w.h, paused, species, coat])

  const poke = () => { const s = st.current; if (s.mode !== "jump") { s.mode = "jump"; s.jump = 0 } }
  return (
    <div style={{ position: "absolute", inset: 0 }} onClick={poke} title="Clique para brincar">
      <canvas ref={ref} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} aria-label={SPECIES[species].label} />
      {cfg(w, "name", false) && <div className="tiny muted" style={{ position: "absolute", left: 10, top: 8 }}>{SPECIES[species].name}</div>}
    </div>
  )
}
