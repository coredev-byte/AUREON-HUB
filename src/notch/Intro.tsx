// Abertura do Aureon: a logo aparece, duas fitas de luz (branca e azul) sobem até o topo da tela e
// formam o notch. Roda uma vez por execução, só no monitor principal, e nunca com "reduzir animações".
// Só opacidade, transform e o traço das fitas (uns 2,5 s, depois o componente sai da tela).
export const INTRO_MS = 2700

export function Intro() {
  return (
    <div className="intro" aria-hidden>
      <svg className="intro-ribbons" viewBox="0 0 960 440" preserveAspectRatio="xMidYMin meet">
        <defs>
          <linearGradient id="ribW" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".35" stopColor="#fff" /><stop offset="1" stopColor="#dfe8ff" /></linearGradient>
          <linearGradient id="ribB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#0b7bfa" stopOpacity="0" /><stop offset=".4" stopColor="#1e8bff" /><stop offset="1" stopColor="#5aa8ff" /></linearGradient>
          <filter id="ribGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" /></filter>
        </defs>
        {/* névoa larga atrás das fitas */}
        <path className="rib rib-haze" pathLength={1} d="M400 330 C330 240 610 250 575 140 S500 34 480 0" stroke="#cfe0ff" strokeWidth="46" fill="none" filter="url(#ribGlow)" />
        <path className="rib rib-w" pathLength={1} d="M400 330 C330 240 610 250 575 140 S500 34 480 0" stroke="url(#ribW)" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path className="rib rib-b-glow" pathLength={1} d="M430 350 C420 270 650 270 600 150 S520 40 486 0" stroke="#1e8bff" strokeWidth="22" fill="none" filter="url(#ribGlow)" />
        <path className="rib rib-b" pathLength={1} d="M430 350 C420 270 650 270 600 150 S520 40 486 0" stroke="url(#ribB)" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
      <img className="intro-logo" src="./mark.png" alt="" draggable={false} />
    </div>
  )
}
