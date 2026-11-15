"use strict"
// Estado persistente do Aureon Hub (processo principal é a única fonte da verdade).
// Cada janela lê com "store:get" e recebe "store:changed" quando algo muda; só as chaves conhecidas são aceitas.
const fs = require("node:fs")
const path = require("node:path")
const defaults = require("./defaults.cjs")

const MAX_BYTES = 2 * 1024 * 1024

function createStore(dir, file = "aureon-state.json") {
  const target = path.join(dir, file)
  let state = defaults.fresh()
  try {
    const raw = fs.readFileSync(target, "utf8")
    state = defaults.migrate(JSON.parse(raw))
  } catch { /* primeiro uso ou arquivo corrompido: começa do padrão */ }
  const listeners = new Set()
  let timer = null

  const flush = () => {
    clearTimeout(timer); timer = null
    try {
      fs.mkdirSync(dir, { recursive: true })
      const tmp = target + ".tmp"
      fs.writeFileSync(tmp, JSON.stringify(state))
      fs.renameSync(tmp, target)
    } catch (e) { console.warn("Aureon: falha ao salvar estado", e.message) }
  }
  const schedule = () => { if (!timer) timer = setTimeout(flush, 400) }

  return {
    get: () => state,
    /** aplica um patch em uma seção conhecida ("settings", "notch", "widgets", "share", "profiles") */
    patch(section, value) {
      if (!defaults.SECTIONS.includes(section)) throw new Error("Seção desconhecida: " + section)
      const next = defaults.sanitize(section, { ...state[section], ...value })
      if (JSON.stringify(next).length > MAX_BYTES) throw new Error("Estado grande demais")
      state = { ...state, [section]: next }
      schedule()
      for (const l of listeners) l(section, next)
      return next
    },
    /** troca uma seção inteira (usado por layouts/perfis) */
    replace(section, value) {
      if (!defaults.SECTIONS.includes(section)) throw new Error("Seção desconhecida: " + section)
      const next = defaults.sanitize(section, value)
      if (JSON.stringify(next).length > MAX_BYTES) throw new Error("Estado grande demais")
      state = { ...state, [section]: next }
      schedule()
      for (const l of listeners) l(section, next)
      return next
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    flush,
    file: target,
  }
}

module.exports = { createStore }
