// Cálculo puro (sem DOM), separado para os testes.
export type WallpaperStyle = "fill" | "fit" | "stretch" | "center" | "tile" | "span"

/**
 * Retângulo da imagem do papel de parede na tela (px do CSS), como o Windows a desenha em cada estilo.
 * "span" (uma imagem para todos os monitores) é aproximado como "fill" em cada monitor.
 */
export function placement(style: WallpaperStyle, img: { width: number; height: number }, screen: { width: number; height: number }, scale = 1) {
  const W = screen.width, H = screen.height
  const iw = img.width / scale, ih = img.height / scale
  if (style === "stretch") return { x: 0, y: 0, w: W, h: H, repeat: false }
  if (style === "center") return { x: (W - iw) / 2, y: (H - ih) / 2, w: iw, h: ih, repeat: false }
  if (style === "tile") return { x: 0, y: 0, w: iw, h: ih, repeat: true }
  const k = style === "fit" ? Math.min(W / img.width, H / img.height) : Math.max(W / img.width, H / img.height)
  const w = img.width * k, h = img.height * k
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, repeat: false }
}
