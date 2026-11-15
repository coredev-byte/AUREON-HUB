// Perfis e layouts de widgets: adicionar, duplicar, remover, mover e salvar como novo perfil.
// Tudo passa pelo processo principal (que valida e salva); as janelas recebem a mudança por evento.
import { getSection, replace, patch } from "@/shared/state"
import type { Profile, WidgetInstance, WidgetType } from "@/shared/types"
import { CATALOG, clampRect, defaultConfig, newId, placeNew } from "./catalog"

export function activeProfile(): Profile | null {
  const p = getSection("profiles"), w = getSection("widgets")
  if (!p || !w) return null
  return p.items.find((x) => x.id === w.activeProfile) ?? p.items[0] ?? null
}

function writeProfile(id: string, fn: (p: Profile) => Profile) {
  const all = getSection("profiles")
  if (!all) return
  void replace("profiles", { items: all.items.map((p) => (p.id === id ? fn(p) : p)) })
}
const editActive = (fn: (list: WidgetInstance[]) => WidgetInstance[]) => {
  const p = activeProfile()
  if (p) writeProfile(p.id, (x) => ({ ...x, widgets: fn(x.widgets) }))
}

export function addWidget(type: WidgetType, display: string, area: { width: number; height: number }) {
  const p = activeProfile()
  if (!p) return
  const def = CATALOG[type]
  const pos = placeNew(p.widgets.filter((w) => w.display === display), def.size, area)
  const w: WidgetInstance = { id: newId(), type, display, ...pos, w: def.size.w, h: def.size.h, opacity: 1, locked: false, enabled: true, font: "inter", color: "", config: defaultConfig(type) }
  editActive((list) => [...list, w])
  return w
}
export function updateWidget(id: string, change: Partial<WidgetInstance>) {
  editActive((list) => list.map((w) => (w.id === id ? { ...w, ...change, config: change.config ? { ...w.config, ...change.config } : w.config } : w)))
}
export function moveWidget(id: string, rect: { x: number; y: number; w: number; h: number }, area: { width: number; height: number }) {
  const p = activeProfile()
  const w = p?.widgets.find((x) => x.id === id)
  if (!w) return
  updateWidget(id, clampRect(rect, area, CATALOG[w.type].min))
}
export function removeWidget(id: string) { editActive((list) => list.filter((w) => w.id !== id)) }
export function duplicateWidget(id: string) {
  const p = activeProfile()
  const w = p?.widgets.find((x) => x.id === id)
  if (!w) return
  editActive((list) => [...list, { ...w, id: newId(), x: w.x + 24, y: w.y + 24, config: { ...w.config } }])
}

export function createProfile(name: string, copyFrom?: string) {
  const all = getSection("profiles")
  if (!all) return
  const base = copyFrom ? all.items.find((p) => p.id === copyFrom) : null
  const id = "p-" + Date.now().toString(36)
  const widgets = base ? base.widgets.map((w) => ({ ...w, id: newId(), config: { ...w.config } })) : []
  void replace("profiles", { items: [...all.items, { id, name: name.trim().slice(0, 40) || "Perfil", widgets }] })
  void patch("widgets", { activeProfile: id })
  return id
}
export function renameProfile(id: string, name: string) { writeProfile(id, (p) => ({ ...p, name: name.trim().slice(0, 40) || p.name })) }
export function deleteProfile(id: string) {
  const all = getSection("profiles")
  if (!all || all.items.length <= 1) return
  const items = all.items.filter((p) => p.id !== id)
  void replace("profiles", { items })
  if (getSection("widgets")?.activeProfile === id) void patch("widgets", { activeProfile: items[0].id })
}
