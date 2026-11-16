// Cena e texto do clima Aureon a partir do código WMO (puro, testado em tests/sports-aureon.test.mjs).
export type Scene = "sun" | "partly" | "cloudy" | "rain" | "storm" | "fog" | "wind" | "snow" | "night" | "night-cloudy"

/** cena e texto a partir do código WMO, dia/noite e vento (km/h) */
export function sceneOf(code: number, day: boolean, wind = 0): { scene: Scene; label: string } {
  if (code >= 95) return { scene: "storm", label: code >= 96 ? "Tempestade com granizo" : "Tempestade" }
  if (code >= 71 && code <= 77) return { scene: "snow", label: code === 71 ? "Neve leve" : code === 75 ? "Neve forte" : code === 77 ? "Grãos de neve" : "Neve" }
  if (code === 85 || code === 86) return { scene: "snow", label: code === 85 ? "Pancadas de neve" : "Neve forte" }
  if (code >= 51 && code <= 57) return { scene: "rain", label: "Garoa" }
  if (code >= 61 && code <= 67) return { scene: "rain", label: code === 61 ? "Chuva leve" : code === 65 ? "Chuva forte" : code >= 66 ? "Chuva congelante" : "Chuva" }
  if (code >= 80 && code <= 82) return { scene: "rain", label: code === 80 ? "Pancadas leves" : code === 82 ? "Pancadas fortes" : "Pancadas de chuva" }
  if (code === 45 || code === 48) return { scene: "fog", label: "Neblina" }
  if (wind >= 35) return { scene: "wind", label: "Ventando" }
  if (code === 3) return { scene: "cloudy", label: "Nublado" }
  if (!day) return code <= 1 ? { scene: "night", label: "Noite limpa" } : { scene: "night-cloudy", label: "Noite com nuvens" }
  if (code === 0) return { scene: "sun", label: "Ensolarado" }
  return { scene: "partly", label: code === 1 ? "Poucas nuvens" : "Parcialmente nublado" }
}

