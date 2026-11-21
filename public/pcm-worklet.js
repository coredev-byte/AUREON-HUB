// Toca o PCM (16 bits, estéreo, 48 kHz) que chega do processo principal como uma trilha de áudio.
// Fila com pré-carga curta (~60 ms) e teto (~250 ms) para não acumular atraso em relação ao vídeo.
class AureonPcm extends AudioWorkletProcessor {
  constructor() {
    super()
    this.q = []
    this.off = 0
    this.frames = 0
    this.primed = false
    this.port.onmessage = (e) => {
      const a = new Int16Array(e.data)
      if (!a.length) return
      this.q.push(a)
      this.frames += a.length / 2
      // atrasou demais (aba ocupada, pico de CPU): descarta o mais antigo
      while (this.frames > 12000 && this.q.length > 1) {
        const x = this.q.shift()
        this.frames -= (x.length - this.off) / 2
        this.off = 0
      }
    }
  }
  process(_inputs, outputs) {
    const out = outputs[0]
    const L = out[0], R = out[1] || out[0]
    if (!this.primed) {
      if (this.frames < 2880) { L.fill(0); R.fill(0); return true }
      this.primed = true
    }
    for (let i = 0; i < L.length; i++) {
      const cur = this.q[0]
      if (!cur) { L[i] = 0; R[i] = 0; continue }
      L[i] = cur[this.off] / 32768
      R[i] = cur[this.off + 1] / 32768
      this.off += 2
      this.frames--
      if (this.off >= cur.length) { this.q.shift(); this.off = 0 }
    }
    if (!this.q.length) this.primed = false
    return true
  }
}
registerProcessor("aureon-pcm", AureonPcm)
