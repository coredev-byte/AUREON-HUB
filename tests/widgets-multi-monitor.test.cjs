"use strict"
const test = require("node:test")
const assert = require("node:assert/strict")
const { closestDisplay, placementForCursor, createWidgetDrag } = require("../electron/widgets/drag.cjs")

const screens = [
  { id: 11, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1.25 },
  { id: 22, bounds: { x: 1920, y: -160, width: 1280, height: 1024 }, workArea: { x: 1920, y: -160, width: 1280, height: 984 }, scaleFactor: 1 },
  { id: 33, bounds: { x: -1600, y: 0, width: 1600, height: 900 }, workArea: { x: -1600, y: 0, width: 1600, height: 860 }, scaleFactor: 1.5 },
]
const widget = { id: "w-test", type: "clock", display: "11", x: 100, y: 80, w: 280, h: 140, enabled: true, locked: false }
const grab = { x: 40, y: 30 }

test("direita: ao soltar no segundo monitor, converte coordenadas globais para a workArea do destino", () => {
  const d = placementForCursor(screens, { x: 2021, y: 55 }, widget, grab)
  assert.deepEqual(d, { display: "22", x: 64, y: 184, w: 280, h: 140 })
})
test("esquerda: monitores com origem X negativa funcionam, sem assumir o principal em (0,0)", () => {
  const d = placementForCursor(screens, { x: -1400, y: 120 }, widget, grab)
  assert.deepEqual(d, { display: "33", x: 160, y: 88, w: 280, h: 140 })
})
test("monitores acima e workArea deslocada (taskbar superior) respeitam coordenadas DIP", () => {
  const up = [{ id: 5, bounds: { x: 0, y: -1200, width: 1920, height: 1200 }, workArea: { x: 0, y: -1160, width: 1920, height: 1160 }, scaleFactor: 2 }]
  const d = placementForCursor(up, { x: 175, y: -980 }, widget, grab)
  assert.deepEqual(d, { display: "5", x: 136, y: 152, w: 280, h: 140 })
})
test("bordas e barra de tarefas ficam dentro da área útil, sem sumir com widget", () => {
  const d = placementForCursor(screens, { x: 3199, y: 850 }, widget, grab)
  assert.equal(d.display, "22")
  assert.equal(d.x, 1000)
  assert.ok(d.y >= 0 && d.y + d.h <= 984)
  assert.equal(closestDisplay(screens, { x: 3300, y: 850 }).id, 22)
})
test("widget maior que a área do monitor de destino é reduzido para caber", () => {
  const d = placementForCursor([{ id: 2, bounds: { x: 200, y: 50, width: 240, height: 180 }, workArea: { x: 200, y: 50, width: 240, height: 150 } }], { x: 230, y: 60 }, { w: 400, h: 300 }, grab)
  assert.deepEqual(d, { display: "2", x: 0, y: 0, w: 240, h: 150 })
})
test("soltar transfere display, posição e dimensões em uma única escrita persistente", () => {
  let cursor = { x: 160, y: 110 }
  let state = { widgets: { editMode: true, activeProfile: "padrao" }, profiles: { items: [{ id: "padrao", widgets: [widget] }] } }
  const previews = []
  let saves = 0
  const controller = createWidgetDrag({
    screen: { getAllDisplays: () => screens, getPrimaryDisplay: () => screens[0], getCursorScreenPoint: () => cursor },
    getState: () => state,
    saveProfiles: (profiles) => { saves++; state = { ...state, profiles } },
    sendPreview: (value) => previews.push(value),
  })
  assert.equal(controller.start("11", "w-test", grab), true)
  cursor = { x: 2050, y: 130 }
  const result = controller.finish()
  assert.equal(result.display, "22")
  assert.equal(saves, 1)
  assert.equal(state.profiles.items[0].widgets.length, 1)
  assert.equal(state.profiles.items[0].widgets[0].display, "22")
  assert.equal(state.profiles.items[0].widgets[0].x, 88)
  assert.equal(previews.at(-1), null)
  assert.equal(controller.isDragging(), false)
})
test("clique sem mover, widgets travados e modo de edição desativado não alteram dados", () => {
  let state = { widgets: { editMode: true, activeProfile: "padrao" }, profiles: { items: [{ id: "padrao", widgets: [widget] }] } }
  let saveCount = 0
  const controller = createWidgetDrag({
    screen: { getAllDisplays: () => screens, getPrimaryDisplay: () => screens[0], getCursorScreenPoint: () => ({ x: 160, y: 110 }) },
    getState: () => state, saveProfiles: () => { saveCount++ }, sendPreview: () => {},
  })
  assert.equal(controller.start("11", "w-test", grab), true)
  assert.equal(controller.finish(), false)
  assert.equal(saveCount, 0)
  state.profiles.items[0].widgets[0] = { ...widget, locked: true }
  assert.equal(controller.start("11", "w-test", grab), false)
  state.widgets.editMode = false
  assert.equal(controller.start("11", "w-test", grab), false)
})
