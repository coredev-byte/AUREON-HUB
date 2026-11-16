// Pausa das animações dos widgets portados: tela cheia no monitor ou janela escondida.
import { on } from "@/shared/bridge"
let paused = false
on("widgets:paused", (v: boolean) => { paused = !!v })
export const perfPaused = () => paused || document.hidden
export const perfVisualFps = () => 60
