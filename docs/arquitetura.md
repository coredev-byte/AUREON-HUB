# Arquitetura do Aureon Hub

```
electron/                     processo principal (Node, CommonJS)
  main.cjs                    início, IPC com verificação de papel da janela, bandeja, atalho, convites aureon://
  preload.cjs                 ponte segura: só canais listados, nenhuma API do Node nas páginas
  core/
    store.cjs, defaults.cjs   estado salvo (JSON atômico) + validação de tudo que as janelas mandam
    windows.cjs               registro de janelas por papel (main/notch/widgets), carregamento seguro, broadcast
    fullscreen.cjs            detecta app em tela cheia (só leitura) e manda janelas DO PRÓPRIO app para o fundo
    notifications.cjs         central de avisos do Aureon
    smoke.cjs                 modo de teste de fumaça (AUREON_SMOKE=1)
  notch/manager.cjs           uma janela de notch por monitor (ou só no principal)
  widgets/manager.cjs         uma camada de widgets por monitor (área útil)
  share/capture.cjs           captura com consentimento (setDisplayMediaRequestHandler)
  share/probe.cjs             teste do servidor de sinalização
  integrations/               mídia (SMTC), sistema, clima (Open-Meteo), jogos
src/                          páginas (React 18 + TypeScript, Vite)
  shared/                     tema Carbono, componentes, ponte, estado, assinaturas sob demanda
  app/                        janela principal: Início, Widgets, Notch, Transmissão, Personalização, Configurações, Diagnósticos
  notch/                      Notch Carbono + máquina de estados pura (machine.ts)
  widgets/                    motor de widgets (catálogo, perfis, camada, 7 widgets, pets)
  share/                      motor de transmissão: sinalização, transmissor, espectador, qualidade, diagnóstico
server/                       servidor de sinalização (Node + ws), Docker, Render, Fly.io, coturn
tests/                        unitários (node:test) + e2e (Playwright, Electron)
```

## Janelas

| Janela | Quantas | Características |
|---|---|---|
| Principal | 1 | Sem moldura nativa, tema Carbono. Fechar só esconde, então a transmissão continua. Sem throttling em segundo plano, porque o motor WebRTC vive nela. |
| Notch | 1 por monitor (ou só o principal) | Transparente, sempre no topo e sem foco (`focusable: false`, não rouba o foco do app em uso). Atravessável pelo mouse fora do desenho: a página informa quando o ponteiro entra na forma real. Some quando há tela cheia naquele monitor; durante uma transmissão, vira uma pílula sem cliques. |
| Widgets | 1 por monitor | Ocupa a área útil, sem cobrir a barra do Windows. Fica atrás das janelas comuns e é mandada para o fundo da pilha ao perder o foco (`SetWindowPos` só na própria janela). Atravessável fora de widgets interativos. Some e pausa em tela cheia. |

## Fluxo de dados

- **Estado:** o processo principal é a fonte da verdade.
  - As páginas pedem `store:get` e escrevem com `store:patch`/`store:replace`, que são validados e salvos.
  - Todas as janelas recebem `store:changed`.
- **Integrações:** mídia, sistema e clima rodam no processo principal, uma vez só, e mandam o estado por broadcast.
  - Só rodam enquanto alguém assina. Por exemplo, o PowerShell de mídia para quando nenhum widget nem o notch precisa dele.
- **Transmissão:** o motor fica na janela principal.
  - Ele publica um resumo (`share:publish`) que o processo principal repassa ao notch e à bandeja.
  - Comandos do notch, como encerrar ou aceitar, voltam por `share:command`.

## Transmissão

```
Transmissor ──wss──▶ Servidor de sinalização ◀──wss── Espectador
     │                  (salas, convites, aprovação,              │
     │                   credenciais TURN temporárias)            │
     └──────────── WebRTC (DTLS-SRTP) direto ou via TURN ─────────┘
```

- **Captura:** `getDisplayMedia` no renderer. O processo principal só libera a fonte que o usuário clicou nos últimos 15 s.
  - Áudio do sistema: loopback do Chromium, só no Windows.
- **Uma conexão por espectador** (topologia em estrela), com codificação H.264 preferida quando a placa de vídeo é usada.
- **Ajuste automático** a cada 2 s por espectador (`quality.ts`):
  - rede congestionada: reduz a taxa e depois a resolução;
  - processador no limite: reduz os quadros por segundo;
  - leituras boas seguidas: volta a subir aos poucos.
- **Troca de fonte** com `replaceTrack`, sem renegociar: quem assiste não percebe a reconexão.
- **Queda do servidor de sinalização:**
  - a mídia continua, porque vai direto entre os PCs;
  - transmissor e espectadores reconectam com espera crescente e retomam a sala com chaves de retomada.
- **Queda da mídia:** o transmissor faz ICE restart, e o espectador também pode pedir.

## Desempenho

- Renderização sob demanda:
  - o relógio atualiza 1×/min, ou 1×/s só com segundos ligados;
  - nada é animado enquanto a página está escondida.
- Cada widget é carregado só quando aparece (`lazy`) e fica isolado: se der erro, os outros continuam.
- Em tela cheia, a camada de widgets daquele monitor fica escondida e pausada. O pet dorme e a música para de animar.
- IPC mínimo:
  - o notch só avisa o processo principal quando o ponteiro entra ou sai da forma, não a cada movimento;
  - as integrações mandam um estado por mudança.
- Medição real (Linux, display virtual, sem GPU), parado:
  - CPU de ~0,4% somando todos os processos;
  - memória "working set" somada de ~610–650 MB, incluindo o processo da GPU por software e memória compartilhada contada mais de uma vez.
  - No Windows os números vão ser outros: medir com a página Diagnósticos.

## Segurança

- As páginas rodam com `contextIsolation` e `sandbox`, sem `nodeIntegration`. A CSP no build não permite scripts inline.
- O IPC confere o papel da janela: só a janela principal escolhe fonte de captura, publica estado de transmissão ou fecha o app.
- Tudo o que vem das páginas é validado antes de ser salvo (chaves e tipos conhecidos, limites de tamanho).
- O helper do Windows só lê a janela da frente e só mexe na ordem das janelas do próprio Aureon.
