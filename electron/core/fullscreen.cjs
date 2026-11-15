"use strict"
// Detecta aplicativo em tela cheia (jogo, vídeo, apresentação) SEM mexer no Windows:
// só lê a janela em primeiro plano, o monitor dela e o estado de notificações do shell.
// Um único processo PowerShell leve, que só escreve quando algo muda (~0,8 s entre leituras).
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawn } = require("node:child_process")

const CS = String.raw`
using System; using System.Text; using System.Diagnostics; using System.Runtime.InteropServices;
public static class AureonFs {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  // só mexe em janelas do PRÓPRIO Aureon: manda para o fundo da pilha, sem ativar, mover ou redimensionar
  public static bool Bottom(long handle, int ownPid) {
    IntPtr h = new IntPtr(handle); uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid != (uint)ownPid) return false;
    return SetWindowPos(h, new IntPtr(1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
  }
  static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
  public static bool Alive(int pid) { try { return !Process.GetProcessById(pid).HasExited; } catch { return false; } }
  public static string Probe(int ownPid) {
    int quns = 0; try { SHQueryUserNotificationState(out quns); } catch { }
    IntPtr h = GetForegroundWindow();
    bool fs = false; string exe = ""; RECT m = new RECT();
    if (h != IntPtr.Zero && IsWindowVisible(h)) {
      var cls = new StringBuilder(64); GetClassName(h, cls, 64);
      string c = cls.ToString();
      uint pid; GetWindowThreadProcessId(h, out pid);
      int cloaked = 0; try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { }
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      IntPtr mon = MonitorFromWindow(h, 2);
      if (GetMonitorInfo(mon, ref mi)) m = mi.rcMonitor;
      if (pid != (uint)ownPid && cloaked == 0 && c != "Progman" && c != "WorkerW" && c != "Shell_TrayWnd" && c != "Shell_SecondaryTrayWnd") {
        RECT r; if (GetWindowRect(h, out r)) fs = r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B;
        try { exe = Process.GetProcessById((int)pid).ProcessName; } catch { }
      }
    }
    // 3 = Direct3D em tela cheia exclusiva, 4 = modo apresentação
    if (quns == 3 || quns == 4) fs = true;
    return "{\"fs\":" + (fs ? "true" : "false") + ",\"quns\":" + quns + ",\"exe\":\"" + Esc(exe) + "\",\"x\":" + m.L + ",\"y\":" + m.T + ",\"w\":" + (m.R - m.L) + ",\"h\":" + (m.B - m.T) + "}";
  }
}`

const PS = (ownPid) => `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CS}
'@
$last = ''
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $null
while ($true) {
  if (-not [AureonFs]::Alive(${ownPid})) { exit 0 }
  while ($true) {
    if ($null -eq $pending) { $pending = $stdin.ReadLineAsync() }
    if (-not $pending.IsCompleted) { break }
    $line = $pending.Result; $pending = $null
    if ($null -eq $line) { exit 0 }
    if ($line -match '^bottom (\\d{1,20})$') { $null = [AureonFs]::Bottom([long]$Matches[1], ${ownPid}) }
  }
  try { $j = [AureonFs]::Probe(${ownPid}) } catch { $j = '{"fs":false,"quns":0,"exe":"","x":0,"y":0,"w":0,"h":0}' }
  if ($j -ne $last) { $j; $last = $j }
  Start-Sleep -Milliseconds 800
}
`

/** interpreta uma linha do helper; devolve null se inválida */
function parseLine(line) {
  try {
    const v = JSON.parse(line)
    if (typeof v.fs !== "boolean") return null
    return { fs: v.fs, quns: Number(v.quns) || 0, exe: String(v.exe || "").slice(0, 80), bounds: { x: v.x | 0, y: v.y | 0, width: v.w | 0, height: v.h | 0 } }
  } catch { return null }
}

/**
 * Converte o retângulo do monitor (pixels físicos) no id do display do Electron.
 * screen.screenToDipRect não existe no Linux; os testes passam um conversor.
 */
function displayFor(bounds, displays, toDip = (r) => r) {
  if (!bounds.width) return null
  const r = toDip(bounds)
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const d = displays.find((x) => cx >= x.bounds.x && cx < x.bounds.x + x.bounds.width && cy >= x.bounds.y && cy < x.bounds.y + x.bounds.height)
  return d ? String(d.id) : null
}

function createMonitor({ onChange, screen }) {
  let state = { fs: false, exe: "", displayId: null, quns: 0, since: Date.now(), helper: "off" }
  let proc = null, buf = "", retry = null, stopped = false
  const emit = (next) => {
    const changed = next.fs !== state.fs || next.displayId !== state.displayId || next.exe !== state.exe
    state = { ...state, ...next, since: changed ? Date.now() : state.since }
    if (changed) onChange(state)
  }
  function start() {
    if (process.platform !== "win32" || proc || stopped) return
    const file = path.join(os.tmpdir(), "aureon-fullscreen-v1.ps1")
    try { fs.writeFileSync(file, "﻿" + PS(process.pid), "utf8") } catch { state.helper = "erro"; return }
    try {
      proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    } catch { state.helper = "erro"; return }
    state.helper = "ativo"
    proc.stdout.on("data", (d) => {
      buf += d.toString("utf8")
      const lines = buf.split(/\r?\n/); buf = lines.pop() || ""
      for (const l of lines) {
        const v = parseLine(l.trim())
        if (!v) continue
        const toDip = (r) => (screen.screenToDipRect ? screen.screenToDipRect(null, r) : r)
        emit({ fs: v.fs, exe: v.exe, quns: v.quns, displayId: v.fs ? displayFor(v.bounds, screen.getAllDisplays(), toDip) : null })
      }
    })
    proc.stderr.on("data", (d) => console.warn("Aureon fullscreen:", d.toString("utf8").slice(0, 300)))
    proc.on("exit", () => {
      proc = null
      state.helper = "parado"
      if (state.fs) emit({ fs: false, exe: "", displayId: null })
      if (!stopped) retry = setTimeout(start, 5000)
    })
  }
  return {
    start,
    stop() { stopped = true; clearTimeout(retry); try { proc?.kill() } catch {} proc = null },
    get: () => state,
    /** manda uma janela do próprio app para o fundo (widgets) */
    toBottom(hwnd) { if (proc && /^\d{1,20}$/.test(hwnd)) try { proc.stdin.write("bottom " + hwnd + "\n") } catch {} },
  }
}

module.exports = { createMonitor, parseLine, displayFor, CS, PS }
