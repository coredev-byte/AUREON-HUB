"use strict"
// Transferência de widgets entre as janelas transparentes de cada monitor.
// As coordenadas de screen.getCursorScreenPoint(), bounds e workArea são todas DIP
// (não pixels físicos): isso evita deslocamentos com escala 125%/150% e monitores à esquerda/acima.

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const finite = (n) => typeof n === "number" && Number.isFinite(n)
const inBounds = (p, b) => p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height

function closestDisplay(displays, point) {
  if (!displays.length || !finite(point?.x) || !finite(point?.y)) return null
  const inside = displays.find((d) => inBounds(point, d.bounds))
  if (inside) return inside
  // Frestas entre monitores e bordas externas: escolhe o retângulo mais próximo em DIP.
  return displays.reduce((best, d) => {
    const b = d.bounds
    const dx = Math.max(b.x - point.x, 0, point.x - (b.x + b.width))
    const dy = Math.max(b.y - point.y, 0, point.y - (b.y + b.height))
    const dist = dx * dx + dy * dy
    return !best || dist < best.dist ? { display: d, dist } : best
  }, null)?.display ?? null
}

function placementForCursor(displays, point, widget, grab) {
  const display = closestDisplay(displays, point)
  if (!display) return null
  const area = display.workArea
  const w = Math.min(widget.w, area.width)
  const h = Math.min(widget.h, area.height)
  const snap = (n) => Math.round(n / 8) * 8
  return {
    display: String(display.id),
    x: clamp(snap(point.x - area.x - grab.x), 0, Math.max(0, area.width - w)),
    y: clamp(snap(point.y - area.y - grab.y), 0, Math.max(0, area.height - h)),
    w, h,
  }
}

function createWidgetDrag({ screen, getState, saveProfiles, sendPreview, intervalMs = 40 }) {
  let active = null
  let ticker = null
  let expiry = null
  let previous = ""

  function stop() {
    if (ticker) clearInterval(ticker)
    if (expiry) clearTimeout(expiry)
    ticker = null; expiry = null; active = null; previous = ""
    sendPreview(null)
  }

  function preview() {
    if (!active) return
    if (!getState().widgets.editMode) { stop(); return }
    const point = screen.getCursorScreenPoint()
    const rect = placementForCursor(screen.getAllDisplays(), point, active.widget, active.grab)
    if (!rect) return
    const payload = {
      id: active.widget.id, type: active.widget.type,
      source: active.source, target: rect.display, rect,
    }
    const json = JSON.stringify(payload)
    if (json !== previous) { previous = json; sendPreview(payload) }
  }

  function start(sourceId, widgetId, grab) {
    const state = getState()
    if (!state.widgets?.editMode || active) return false
    if (typeof widgetId !== "string" || !finite(grab?.x) || !finite(grab?.y)) return false
    const displays = screen.getAllDisplays()
    const source = displays.find((d) => String(d.id) === String(sourceId))
    if (!source) return false
    const profile = state.profiles.items.find((p) => p.id === state.widgets.activeProfile) ?? state.profiles.items[0]
    const widget = profile?.widgets.find((w) => w.id === widgetId)
    if (!widget || !widget.enabled || widget.locked) return false
    // Widget de monitor desconectado pode reaparecer na tela principal, como no Layer.
    const orphan = !displays.some((d) => String(d.id) === widget.display)
    const primary = String(screen.getPrimaryDisplay().id) === String(sourceId)
    if (widget.display !== String(sourceId) && !(orphan && primary)) return false
    if (grab.x < -2 || grab.y < -2 || grab.x > widget.w + 2 || grab.y > widget.h + 2) return false
    active = { source: String(sourceId), widget: { ...widget }, grab, startPoint: screen.getCursorScreenPoint(), profileId: profile.id }
    ticker = setInterval(preview, intervalMs)
    expiry = setTimeout(stop, 30000) // segurança se o mouse for solto na barra de tarefas
    ticker.unref?.(); expiry.unref?.()
    preview()
    return true
  }

  function finish() {
    if (!active) return false
    const s = active
    const point = screen.getCursorScreenPoint()
    const next = placementForCursor(screen.getAllDisplays(), point, s.widget, s.grab)
    stop()
    if (!next || !getState().widgets.editMode) return false
    if (Math.hypot(point.x - s.startPoint.x, point.y - s.startPoint.y) < 4) return false
    const state = getState()
    const profile = state.profiles.items.find((p) => p.id === s.profileId)
    const widget = profile?.widgets.find((w) => w.id === s.widget.id)
    if (!widget || widget.locked) return false
    // Um único replace é enviado a todas as camadas: sem widget duplicado nem sumiço temporário.
    const items = state.profiles.items.map((p) => p.id !== s.profileId ? p : {
      ...p, widgets: p.widgets.map((w) => w.id === s.widget.id ? { ...w, ...next } : w),
    })
    saveProfiles({ items })
    return { id: widget.id, ...next }
  }

  return { start, finish, cancel: stop, isDragging: () => !!active }
}

module.exports = { closestDisplay, placementForCursor, createWidgetDrag }
