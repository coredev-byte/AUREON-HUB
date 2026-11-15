import test from "node:test"
import assert from "node:assert/strict"
import { placeNew, clampRect } from "../src/widgets/catalog.ts"

test("widget novo vai para um espaço livre, sem sobrepor", () => {
  const area = { width: 1600, height: 900 }
  const list = []
  for (let i = 0; i < 8; i++) {
    const p = placeNew(list, { w: 280, h: 140 }, area)
    for (const e of list) assert.ok(p.x >= e.x + e.w || p.x + 280 <= e.x || p.y >= e.y + e.h || p.y + 140 <= e.y, "sobrepôs")
    list.push({ ...p, w: 280, h: 140 })
  }
})
test("widget nunca some da tela ao mover", () => {
  const r = clampRect({ x: 5000, y: -300, w: 10, h: 10 }, { width: 1920, height: 1040 }, { w: 140, h: 80 })
  assert.ok(r.x <= 1920 - 40 && r.y === 0 && r.w === 140 && r.h === 80)
})
