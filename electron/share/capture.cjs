"use strict"
// Captura de tela com consentimento: a página só recebe a tela/janela que o usuário ESCOLHEU no seletor do
// Aureon nos últimos 15 segundos. Sem escolha, o pedido de captura é negado (nada de captura silenciosa).
const { desktopCapturer, session } = require("electron")

const PENDING_MS = 15000

function createCapture() {
  let pending = null // { sourceId, audio, expires }

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const p = pending
    pending = null
    if (!p || Date.now() > p.expires) return callback({})
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } })
      const src = sources.find((s) => s.id === p.sourceId)
      if (!src) return callback({})
      const res = { video: src }
      // áudio do sistema: só no Windows (loopback do Chromium). Captura o som do PC inteiro, não só da janela.
      if (p.audio && request.audioRequested && process.platform === "win32") res.audio = "loopback"
      callback(res)
    } catch { callback({}) }
  }, { useSystemPicker: false })

  return {
    async sources() {
      const list = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true })
      return list
        .filter((s) => !/^(Aureon Hub|aureon-notch|aureon-widgets)$/i.test(s.name))
        .map((s) => ({
          id: s.id, name: s.name, kind: s.id.startsWith("screen:") ? "screen" : "window", displayId: s.display_id || "",
          thumb: s.thumbnail.isEmpty() ? "" : s.thumbnail.toDataURL(), icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : "",
        }))
    },
    /** o usuário clicou numa fonte: libera UMA captura dela pelos próximos segundos */
    select(sourceId, audio) {
      if (typeof sourceId !== "string" || !/^(screen|window):[\w:.-]+$/.test(sourceId)) throw new Error("Fonte inválida")
      pending = { sourceId, audio: !!audio, expires: Date.now() + PENDING_MS }
      return { ok: true, audioSupported: process.platform === "win32" }
    },
  }
}

module.exports = { createCapture }
