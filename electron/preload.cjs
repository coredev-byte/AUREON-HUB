"use strict"
// Ponte entre as páginas e o processo principal. Só canais conhecidos; nenhuma API do Node chega às páginas.
const { contextBridge, ipcRenderer } = require("electron")

const INVOKE = new Set([
  "store:get", "store:patch", "store:replace",
  "media:sub", "media:unsub", "media:cmd", "system:sub", "system:unsub",
  "weather:sub", "weather:unsub", "weather:refresh", "weather:search", "games:get", "fs:get",
  "share:sources", "share:select", "share:publish", "share:get", "share:command", "share:probe",
  "notify:push", "notify:list", "notify:dismiss", "notify:read", "notify:clear", "notify:action",
  "notch:interactive", "notch:menu", "widgets:interactive",
  "app:open", "app:info", "app:metrics", "app:external", "app:quit", "win:cmd",
  "update:get", "update:check", "update:download", "update:install",
  "net:text", "sports:get", "sports:teams", "team:search", "team:card", "valorant:agent",
])
const EVENTS = new Set([
  "store:changed", "media:state", "system:state", "weather:state", "games:state", "fs:state",
  "share:state", "share:command", "notify:new", "notify:list", "notch:toggle", "notch:fullscreen",
  "widgets:paused", "nav", "win:maximized", "displays:changed", "update:state", "valorant:agent",
])

contextBridge.exposeInMainWorld("aureon", {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error("Canal não permitido: " + channel))
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, fn) {
    if (!EVENTS.has(channel)) throw new Error("Evento não permitido: " + channel)
    const h = (_e, payload) => fn(payload)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  },
  platform: process.platform,
})
