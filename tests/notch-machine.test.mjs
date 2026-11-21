// Máquina de estados do Notch: sem piscar, sem abrir sem querer, avisos na ordem certa.
import test from "node:test"
import assert from "node:assert/strict"
import { initial, reduce, sizeOf, base, COLLAPSE_MS, PINNED_COLLAPSE_MS, NOTICE_MS } from "../src/notch/machine.ts"

const N = (o = {}) => ({ id: "n" + Math.random(), at: 0, read: false, kind: "info", title: "Oi", body: "", image: "", actions: [], target: "", ref: "", sticky: false, ...o })
const run = (s, ...events) => events.reduce(reduce, s)

test("repouso depende do contexto: transmissão > música > discreto", () => {
  assert.equal(base({ ...initial().ctx, sharing: true, mediaPlaying: true }), "sharing")
  assert.equal(base({ ...initial().ctx, mediaPlaying: true }), "media")
  assert.equal(base({ ...initial().ctx, mediaPlaying: true, showMedia: false }), "idle")
})

test("passar o mouse: hover, e só abre depois do tempo de espera", () => {
  let s = run(initial(), { type: "enter" })
  assert.equal(s.mode, "hover")
  assert.equal(s.timer.event, "hover-timeout")
  assert.ok(s.timer.ms >= 140)
  s = reduce(s, { type: "hover-timeout" })
  assert.equal(s.mode, "expanded")
  assert.equal(s.pinned, false)
})

test("mouse só passando: sai antes do tempo e não abre (sem expansão involuntária)", () => {
  let s = run(initial(), { type: "enter" }, { type: "leave" })
  assert.equal(s.mode, "idle")
  // o temporizador antigo dispara atrasado: nada acontece
  s = reduce(s, { type: "hover-timeout" })
  assert.equal(s.mode, "idle")
})

test("abrir/fechar rápido várias vezes termina num estado coerente", () => {
  let s = initial()
  for (let i = 0; i < 50; i++) s = run(s, { type: "enter" }, { type: "hover-timeout" }, { type: "leave" }, { type: "enter" })
  // fecha na hora ao sair; voltando, recomeça pelo "hover" (abre de novo depois do tempo de espera)
  assert.equal(s.mode, "hover")
  s = run(s, { type: "hover-timeout" })
  assert.equal(s.mode, "expanded")
  s = run(s, { type: "leave" })
  assert.equal(s.mode, "idle")
})

test("fechar ao sair: na hora, aberto pelo mouse ou por clique", () => {
  assert.equal(COLLAPSE_MS, 0); assert.equal(PINNED_COLLAPSE_MS, 0)
  let s = run(initial(), { type: "enter" }, { type: "hover-timeout" }, { type: "leave" })
  assert.equal(s.mode, "idle"); assert.equal(s.timer, null)
  s = run(initial(), { type: "enter" }, { type: "click" }, { type: "leave" })
  assert.equal(s.mode, "idle"); assert.equal(s.pinned, false)
  // um "collapse" atrasado não reabre nem fecha nada depois que o mouse voltou
  s = run(initial(), { type: "enter" }, { type: "click" }, { type: "collapse" })
  assert.equal(s.mode, "expanded")
})

test("aviso aparece e some sozinho; com o mouse em cima ele fica", () => {
  let s = reduce(initial(), { type: "notify", notice: N() })
  assert.equal(s.mode, "notification")
  assert.equal(s.timer.ms, NOTICE_MS)
  s = reduce(s, { type: "enter" })
  assert.equal(s.timer, null)
  s = reduce(s, { type: "notice-done" })
  assert.equal(s.mode, "notification", "não some com o mouse em cima")
  s = run(s, { type: "leave" }, { type: "notice-done" })
  assert.equal(s.mode, "idle")
})

test("pedido para assistir fica até ser respondido e fura a fila", () => {
  let s = reduce(initial(), { type: "notify", notice: N({ title: "a" }) })
  s = reduce(s, { type: "notify", notice: N({ title: "b" }) })
  s = reduce(s, { type: "notify", notice: N({ kind: "request", title: "pedido", actions: [{ id: "accept", label: "Aceitar" }] }) })
  assert.deepEqual(s.queue.map((n) => n.title), ["pedido", "b"])
  s = reduce(s, { type: "notice-done" })
  assert.equal(s.notice.title, "pedido")
  assert.equal(s.timer, null, "pedido não some sozinho")
  s = reduce(s, { type: "dismiss" })
  assert.equal(s.notice.title, "b")
})

test("aviso chegando com o painel aberto espera na fila", () => {
  let s = run(initial(), { type: "toggle" }, { type: "notify", notice: N({ title: "x" }) })
  assert.equal(s.mode, "expanded")
  assert.equal(s.queue.length, 1)
  s = reduce(s, { type: "toggle" })
  assert.equal(s.mode, "notification")
})

test("avisos silenciados não aparecem, mas pedidos e alertas sim", () => {
  let s = initial({ notifications: false })
  s = reduce(s, { type: "notify", notice: N() })
  assert.equal(s.mode, "idle")
  s = reduce(s, { type: "notify", notice: N({ kind: "alert" }) })
  assert.equal(s.mode, "alert")
})

test("tela cheia: ignora mouse e avisos, mostra só o indicador", () => {
  let s = run(initial(), { type: "enter" }, { type: "hover-timeout" })
  s = reduce(s, { type: "ctx", ctx: { fullscreen: true, sharing: true } })
  assert.equal(s.mode, "sharing")
  s = run(s, { type: "enter" }, { type: "click" }, { type: "notify", notice: N() })
  assert.equal(s.mode, "sharing")
  assert.equal(sizeOf("sharing", { idleClock: true, fullscreen: true }).h, 24)
})

test("transmissão começando muda o repouso sem interromper o painel aberto", () => {
  let s = run(initial(), { type: "toggle" }, { type: "ctx", ctx: { sharing: true } })
  assert.equal(s.mode, "expanded")
  s = reduce(s, { type: "toggle" })
  assert.equal(s.mode, "sharing")
})

test("depois de responder um aviso com o mouse em cima, fica em hover (não abre sozinho)", () => {
  let s = run(initial(), { type: "notify", notice: N({ actions: [{ id: "a", label: "A" }] }) }, { type: "enter" }, { type: "dismiss" })
  assert.equal(s.mode, "hover")
  assert.equal(s.timer, null)
})

test("clique num espaço vazio do painel aberto não fecha (só fixa aberto)", () => {
  let s = run(initial(), { type: "enter" }, { type: "hover-timeout" }, { type: "click" })
  assert.equal(s.mode, "expanded")
  assert.equal(s.pinned, true)
  s = run(s, { type: "leave" }, { type: "collapse" })
  assert.equal(s.mode, "idle")
})
