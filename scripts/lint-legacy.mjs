// Verificação de regras do projeto: nada de módulos que mexem no Windows (barra de tarefas, Explorer, atalhos nativos, papel de parede).
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const FORBIDDEN = [
  [/Shell_TrayWnd.*ShowWindow|ShowWindow.*Shell_TrayWnd/i, "esconder a barra de tarefas"],
  [/SetWindowsHookEx|WH_KEYBOARD_LL/i, "gancho global de teclado"],
  [/SystemParametersInfo.*SPI_SETDESKWALLPAPER|SPI_SETDESKWALLPAPER/i, "trocar o papel de parede"],
  [/SetParent\(.*(WorkerW|Progman)|SendMessageTimeout.*0x052C/i, "pendurar janela no Explorer (WorkerW)"],
  [/taskkill.*explorer|Stop-Process.*explorer/i, "reiniciar o Explorer"],
  [/registerAccelerator.*Super|globalShortcut\.register\(["'`](Super|Meta|Win)/i, "atalho com a tecla Windows"],
]
const roots = ["electron", "src"]
let bad = 0
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(c?js|mjs|ts|tsx)$/.test(f)) {
      const txt = readFileSync(p, "utf8")
      for (const [re, what] of FORBIDDEN) if (re.test(txt)) { console.error(`${p}: proibido (${what})`); bad++ }
    }
  }
}
roots.forEach(walk)
if (bad) process.exit(1)
console.log("lint-legacy: ok (nenhuma modificação do Windows encontrada)")
