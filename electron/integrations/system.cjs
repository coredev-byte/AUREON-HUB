"use strict"
// CPU e memória do PC + o consumo do próprio Aureon (todas as janelas). Só mede enquanto alguém assina.
const os = require("node:os")

function cpuTimes() {
  return os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.irq + t.idle } })
}
/** uso de CPU (0-100) entre duas leituras */
function cpuUsage(prev, now) {
  if (!prev || prev.length !== now.length) return 0
  let idle = 0, total = 0
  for (let i = 0; i < now.length; i++) { idle += now[i].idle - prev[i].idle; total += now[i].total - prev[i].total }
  return total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : 0
}

function createSystem({ broadcast, appMetrics }) {
  const subs = new Set()
  let timer = null, last = cpuTimes(), snap = null
  const sample = () => {
    const now = cpuTimes()
    const own = appMetrics ? appMetrics() : []
    snap = {
      cpu: cpuUsage(last, now), cores: now.length, cpuName: os.cpus()[0]?.model?.trim() ?? "",
      memTotal: os.totalmem(), memUsed: os.totalmem() - os.freemem(), uptime: os.uptime(),
      app: {
        // CPU já vem em % de um núcleo; memória em KB
        cpu: Math.round(own.reduce((a, p) => a + (p.cpu?.percentCPUUsage || 0), 0) * 10) / 10,
        mem: own.reduce((a, p) => a + (p.memory?.workingSetSize || 0), 0) * 1024,
        processes: own.map((p) => ({ type: p.type, name: p.name || "", cpu: Math.round((p.cpu?.percentCPUUsage || 0) * 10) / 10, mem: (p.memory?.workingSetSize || 0) * 1024 })),
      },
      at: Date.now(),
    }
    last = now
    broadcast("system:state", snap)
  }
  return {
    subscribe(id) { subs.add(id); if (!timer) { timer = setInterval(sample, 2000); sample() } return snap },
    unsubscribe(id) { subs.delete(id); if (!subs.size && timer) { clearInterval(timer); timer = null } },
    sample: () => { sample(); return snap },
    stop() { clearInterval(timer); timer = null; subs.clear() },
  }
}

module.exports = { createSystem, cpuUsage }
