"use strict"
// Central de avisos do próprio Aureon (transmissão, pedidos de entrada, mídia, avisos do app).
// O Windows não deixa um app comum ler as notificações de outros apps; isto é só o que o Aureon gera.
let seq = 0
const KINDS = ["info", "media", "share", "request", "alert", "game"]

function clean(n) {
  const s = (v, m) => (typeof v === "string" ? v.slice(0, m) : "")
  const actions = Array.isArray(n?.actions) ? n.actions.slice(0, 2).map((a) => ({ id: s(a?.id, 40), label: s(a?.label, 24) })).filter((a) => a.id && a.label) : []
  return {
    kind: KINDS.includes(n?.kind) ? n.kind : "info",
    title: s(n?.title, 80) || "Aureon",
    body: s(n?.body, 200),
    image: typeof n?.image === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(n.image) && n.image.length < 400000 ? n.image : "",
    actions,
    /** quem trata as ações ("main" = janela principal) */
    target: n?.target === "main" ? "main" : "",
    ref: s(n?.ref, 80),
    sticky: !!n?.sticky,
  }
}

function createNotifications({ broadcast }) {
  let list = []
  return {
    push(raw) {
      const n = { id: "n" + (++seq) + "-" + Date.now().toString(36), at: Date.now(), read: false, ...clean(raw) }
      list = [n, ...list].slice(0, 60)
      broadcast("notify:new", n)
      broadcast("notify:list", list)
      return n
    },
    dismiss(id) { list = list.filter((n) => n.id !== id); broadcast("notify:list", list) },
    /** remove avisos de um assunto (ex.: pedido de entrada já respondido) */
    dismissRef(ref) { if (!ref) return; const before = list.length; list = list.filter((n) => n.ref !== ref); if (list.length !== before) broadcast("notify:list", list) },
    markRead() { list = list.map((n) => ({ ...n, read: true })); broadcast("notify:list", list) },
    clear() { list = []; broadcast("notify:list", list) },
    find: (id) => list.find((n) => n.id === id) ?? null,
    list: () => list,
  }
}

module.exports = { createNotifications, clean }
