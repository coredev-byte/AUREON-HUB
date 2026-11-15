# Auditoria do Widgy (base da reconstrução)

Repositório analisado: `core-dev-user/agenda`, versão 0.3.39 (main `2a7ef76`).

## O que existia

| Área | Onde | Situação |
|---|---|---|
| Núcleo Electron | `electron/main.cjs` (730 linhas) + 30 módulos | Um processo principal monolítico: janelas, mídia, música embutida, apps web, finanças, esportes, atualizador. |
| Substituição do Windows | `bar.cjs` (898), `winhelper.cjs` (545), `keys.cjs` (407), `mode.cjs`, `taskbar-key-policy.cjs`, `wallpaper-engine.cjs`, `startapps.cjs`, `src/bar/*`, `taskbar.html` | Barra de tarefas própria, menu Iniciar, gancho de teclado de baixo nível (tecla Windows, Win+D), janelas presas ao WorkerW/Progman do Explorer, controle do Wallpaper Engine. **Removido no Aureon.** |
| "Notch Carbono" | `src/shell/Carbono.tsx` (585) + `Dashboard.tsx` (660) | Não era uma janela própria: um painel que descia do topo dentro da janela de tela cheia do Widgy (EdgePanel com orelhas côncavas), com abas Painel/Mídia/Desempenho/Clima. Dependia do modo "desktop" de tela cheia. |
| Widgets | `src/widgets/*` (27 arquivos) | Muitos widgets (relógio, clima, Spotify via SMTC, YouTube Music embutido, WhatsApp embutido, Valorant, esportes, finanças...), todos dentro da mesma janela de tela cheia. Um widget travado afetava a página inteira. |
| Transmissão ("Salas") | `src/lib/rooms.ts` (757) + PeerJS 1.5.5 | Ver abaixo. |
| Pets | `src/pet/*` | Desenho em pixel art bom e testado; comportamento acoplado ao desktop inteiro. |
| Mídia do Windows | `electron/media.cjs`, `media-utils.cjs` | Leitor SMTC num único PowerShell, estável. **Reaproveitado.** |

## Por que a transmissão falhava

1. **Servidor de encontro de terceiros.** As salas usavam o servidor público gratuito do PeerJS (`0.peerjs.com`), sem garantia de funcionamento. Redes, antivírus e filtros de DNS que bloqueiam esse domínio impediam a entrada (caso real do seu amigo).
2. **Retransmissão (TURN) pública e instável.** Sem um TURN confiável, redes com CGNAT ou firewall rígido deixavam a tela preta: a conexão "abria", mas o vídeo não passava.
3. **Segurança fraca.** O código da sala tinha 6 caracteres e virava um id público no servidor do PeerJS (`agenda-sala-CODIGO`). Qualquer pessoa que acertasse ou visse o código entrava, sem limite de tentativas e sem aprovação.
4. **Anfitrião implícito.** Quem entrava primeiro virava o "anfitrião"; se ele saísse, outro assumia. Isso funciona para conversa, mas é confuso para uma transmissão.
5. **Sessão presa à interface.** O estado da transmissão vivia na página do app. Quando a janela era recriada, a sessão era perdida.

## Processos em segundo plano, listeners e timers

- Vários PowerShell longos ao mesmo tempo: mídia, monitor de sistema, monitor de jogos, helper de janelas e barra.
- A barra e o helper de janelas faziam consultas periódicas ao Windows o tempo todo.
- Atualizações por timer em widgets escondidos (corrigido parcialmente nas versões 0.3.3x).

## Decisão

Reconstruir num projeto novo (Aureon Hub) e reaproveitar só o que tinha valor comprovado:

- leitor SMTC (mídia);
- desenhos dos pets;
- funções de estatística do WebRTC (`summarize`, `withStartBitrate`);
- lista de jogos conhecidos;
- a forma do Notch Carbono (corpo com cantos de baixo arredondados e orelhas côncavas no topo).

Todo o resto foi reescrito com arquitetura modular.
