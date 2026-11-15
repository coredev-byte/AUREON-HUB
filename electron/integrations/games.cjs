"use strict"
// Jogo em primeiro plano: usa só o monitor de tela cheia (executável da janela da frente).
// Nada de listar processos o tempo todo nem ler memória de jogos (compatível com anti-cheat).
const KNOWN = new Map([["valorant-win64-shipping","Valorant","#ff4655"],["cs2","Counter-Strike 2","#de9b35"],["csgo","Counter-Strike 2","#de9b35"],["league of legends","League of Legends","#c89b3c"],["fortniteclient-win64-shipping","Fortnite","#9d4dbb"],["gta5","GTA V","#5aa832"],["gta5_enhanced","GTA V","#5aa832"],["playgtav","GTA V","#5aa832"],["robloxplayerbeta","Roblox","#e2231a"],["r5apex","Apex Legends","#da292a"],["r5apex_dx12","Apex Legends","#da292a"],["overwatch","Overwatch 2","#f99e1a"],["rocketleague","Rocket League","#0c8ce9"],["dota2","Dota 2","#be1e2d"],["minecraft.windows","Minecraft","#62b47a"],["fc25","EA Sports FC","#00d16d"],["fc26","EA Sports FC","#00d16d"],["genshinimpact","Genshin Impact","#d3bc8e"],["starrail","Honkai: Star Rail","#8e7cc3"],["zenlesszonezero","Zenless Zone Zero","#f2c94c"],["rainbowsix","Rainbow Six Siege","#4a90d9"],["rainbowsix_vulkan","Rainbow Six Siege","#4a90d9"],["tslgame","PUBG","#f2a900"],["cod","Call of Duty","#7cb342"],["blackops6","Call of Duty","#7cb342"],["marvel-win64-shipping","Marvel Rivals","#e23636"],["project8","Deadlock","#c9a46a"],["eldenring","Elden Ring","#c8a85a"],["cyberpunk2077","Cyberpunk 2077","#fcee0a"],["rdr2","Red Dead Redemption 2","#b71c1c"],["destiny2","Destiny 2","#5a8fd8"],["wow","World of Warcraft","#f8b700"],["hearthstone","Hearthstone","#f0b232"],["deadbydaylight-win64-shipping","Dead by Daylight","#9b1c1c"],["thefinals","The Finals","#d6ff3d"],["among us","Among Us","#c51111"],["terraria","Terraria","#4caf50"],["stardew valley","Stardew Valley","#7cb342"],["fallguys_client_game","Fall Guys","#ff7ac6"],["brawlhalla","Brawlhalla","#3fa9f5"],["paladins","Paladins","#41b6e6"],["sims4","The Sims 4","#3ec300"],["ts4_x64","The Sims 4","#3ec300"],["helldivers2","Helldivers 2","#ffe600"],["palworld-win64-shipping","Palworld","#3fa9f5"],["warframe.x64","Warframe","#a7c7e7"],["pathofexile_x64","Path of Exile","#b08d57"],["pathofexile2","Path of Exile 2","#b08d57"]].map(([exe, name, color]) => [exe, { name, color }]))

/** identifica o jogo a partir do nome do processo (sem .exe) e se a janela está em tela cheia */
function identify(exe, fullscreen) {
  const key = String(exe || "").toLowerCase().replace(/\.exe$/, "")
  if (!key) return null
  const k = KNOWN.get(key)
  if (k) return { exe: key, name: k.name, color: k.color, known: true }
  // qualquer outro programa em tela cheia conta como "app em tela cheia" (vídeo, jogo desconhecido)
  return fullscreen ? { exe: key, name: key, color: "", known: false } : null
}

function createGames({ broadcast }) {
  let current = null
  const history = []
  return {
    /** chamado pelo monitor de tela cheia */
    update(fs) {
      const g = fs.fs ? identify(fs.exe, true) : null
      const same = (current && g && current.exe === g.exe) || (!current && !g)
      if (same) return
      if (current) { history.unshift({ ...current, ended: Date.now() }); history.length = Math.min(history.length, 20) }
      current = g ? { ...g, since: Date.now(), displayId: fs.displayId } : null
      broadcast("games:state", { current, history })
    },
    get: () => ({ current, history }),
  }
}

module.exports = { createGames, identify, KNOWN }
