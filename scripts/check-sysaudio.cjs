// Windows (CI): compila e roda por alguns segundos o ajudante que captura o som do PC sem um programa
// (o mesmo usado em "Tudo menos o Discord"). Falha se o código C# não compilar. Se o Windows ativar a captura,
// mostra quantos bytes de áudio chegaram; máquina sem placa de som pode recusar a ativação (só informa).
const { spawn } = require("node:child_process")
const fs = require("node:fs"), os = require("node:os"), path = require("node:path")
const { PS } = require("../electron/integrations/widgy/sysaudio.cjs")

if (process.platform !== "win32") { console.log("pulado: só no Windows"); process.exit(0) }
const file = path.join(os.tmpdir(), "aureon-sysaudio-check.ps1")
fs.writeFileSync(file, "﻿" + PS, "utf8")
const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
  windowsHide: true, env: { ...process.env, AGENDA_AUDIO_PID: String(process.pid), AGENDA_AUDIO_MODE: "exclude" },
})
let bytes = 0, err = ""
p.stdout.on("data", (d) => { bytes += d.length })
p.stderr.on("data", (d) => { err += d })
setTimeout(() => { try { p.stdin.end() } catch {} setTimeout(() => p.kill(), 3000) }, 6000)
p.on("exit", () => {
  const msg = err.trim()
  console.log("bytes de áudio:", bytes, "| saída do ajudante:", JSON.stringify(msg.slice(0, 400)))
  if (/error CS\d+|Add-Type|Cannot add type|compil/i.test(msg)) { console.error("FALHOU: o ajudante de áudio não compilou"); process.exit(1) }
  console.log(bytes > 0 ? "ok - captura por programa ativou e entregou áudio" : "ok - compilou; a captura não entregou áudio nesta máquina (" + (msg || "sem saída") + ")")
})
