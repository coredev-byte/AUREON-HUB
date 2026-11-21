# Relatório da reconstrução: Widgy → Aureon Hub 0.5.4




## 0.5.4 (pedido do usuário: transmitir sem o som do Discord)

- **Nova opção em Som do PC: "Tudo menos o Discord".** Quem assiste ouve o jogo, a música e o resto, mas não a call do Discord.
- **Como funciona:**
  - Usa a captura de som por programa do Windows (process loopback, modo "excluir a árvore do processo", Windows 10 versão 2004 ou mais novo, ou Windows 11), a mesma do Widgy.
  - O app encontra o processo principal do Discord (também PTB e Canary) e deixa de fora ele e todos os processos filhos.
  - O som chega como PCM 48 kHz e vira uma trilha de áudio comum da transmissão (AudioWorklet), com pouca fila para não atrasar em relação ao vídeo.
- **Nunca manda o Discord por engano:** se o Windows não permitir separar, a transmissão continua **sem som** e avisa. Não cai para o "som do PC inteiro".
- **Discord fechado ao começar:** vai o som do PC normalmente e aparece um aviso. Se abrir o Discord depois, é preciso parar e recomeçar a transmissão para deixá-lo de fora.
- **Trocar de tela:** o som sem o Discord continua o mesmo, sem cortar.
- O PCM vai só para a janela principal (antes ia para todas as janelas do app).
- **Testes:**
  - ponta a ponta: Ana transmite com "Tudo menos o Discord" (um tom de teste no lugar da captura do Windows) e a Bia recebe som de verdade (nível medido), e a captura para junto quando a Ana para;
  - CI do Windows: compila e roda o ajudante de captura.
- **Não testado num PC com Discord tocando de verdade:** o teste do Windows no GitHub não tem Discord nem placa de som.

## 0.5.3 (pedido do usuário: escolher a resolução da transmissão)

- **Resolução de envio:** Automática, 720p, 900p, 1080p, 1440p (2K), 2160p (4K) ou Original da tela. Dá para escolher antes de começar, ao lado da qualidade, e trocar durante a transmissão sem reconectar ninguém. A escolha fica salva.
  - A largura acompanha o formato da tela, então monitores ultrawide não são cortados.
  - A taxa de envio sobe ou desce com a quantidade de pixels: 1440p e 4K pedem mais Mbit/s, com teto de 30 Mbit/s.
  - **Resolução fixa:** se a rede apertar, o ajuste automático reduz a taxa e os quadros por segundo, mas não a resolução. Na "Automática", continua como antes, reduzindo também a imagem.
  - Conferido no Electron capturando uma tela 2560×1440: 720p, 1080p e 1440p saem exatamente nesses tamanhos, e "Original" sai em 2560×1440.
  - Novos testes em `tests/share-quality.test.mjs`.

## 0.5.2 (pedido do usuário: desenhos sobrepostos nos widgets Aureon e notch fechando na hora)

- **Ícones do clima sem traços cruzando:** nas cenas com duas camadas (nublado, parcialmente nublado, noite com nuvens, vento), o que fica atrás (sol, lua, segunda nuvem, rajadas) passou a ser recortado no formato da nuvem da frente, com uma folga. Antes, os contornos passavam um por cima do outro.
- **Cena atrás do ícone:** um respiro escuro em volta do ícone impede que chuva, nuvens e montanhas cruzem o desenho. A rajada de vento e a montanha da neve saíram da altura do ícone. O raio da tempestade agora começa abaixo da nuvem.
- **Valorant:** a arte do agente aparece só nos cartões largos, numa área própria à direita. Os times ficam com o escudo em cima e o nome embaixo, sem nada por cima.
- **Futebol:** o 2º tempo aparecia como "Intervalo", porque o status "STATUS_SECOND_HALF" contém "half". Agora só STATUS_HALFTIME e "HT" contam como intervalo. Há teste novo para isso.
- **Notch:** ao tirar o mouse do painel aberto, ele fecha na hora (antes esperava 0,45 s, ou 1,6 s quando aberto por clique), e a animação de fechar ficou mais curta. A faixa de tolerância em volta do desenho continua evitando que ele feche por engano.

## 0.5.0 (pedido do usuário: abertura, esportes e clima na estética Aureon, transmissão em grupo com código curto)

- **Abertura:**
  - Ao iniciar o app, a logo aparece no centro, duas fitas de luz (branca e azul) sobem até o topo e o notch nasce estreito e abre com um contorno de luz que apaga. Dura cerca de 2,7 s.
  - Roda uma vez por execução, só no monitor principal. Não roda com "reduzir animações" (do app ou do Windows) e pode ser desligada em Notch › Animação de abertura.
  - Só usa opacidade, transform e o traço das fitas. Depois disso o componente sai da tela.
- **Transmissão em grupo (sala no estilo Discord):**
  - Uma sala junta várias pessoas, e qualquer uma pode transmitir a própria tela ao mesmo tempo que as outras. Cada pessoa escolhe quais telas assistir (uma ou várias, em grade), com volume, tela cheia e estatísticas por tela.
  - O aviso "Fulano começou a transmitir" tem o botão Assistir.
  - **Código curto:** `XXXX-XXXX` (8 caracteres) no lugar dos 16. Aceita minúsculas e com ou sem traço. Continua protegido por aprovação, limite de tentativas por IP, trava da sala e validade.
  - **Dono da sala:** aprova, recusa, remove, tranca e troca o código. Se sair, a sala passa para quem entrou primeiro; só o dono encerra para todos.
  - Ninguém transmite sem escolher a própria tela, nada é gravado e ninguém controla o PC de ninguém.
  - **Servidor 2.0 (protocolo 2):** precisa ser publicado de novo. O teste de conexão avisa quando o servidor está desatualizado.
  - Nova interface na estética Aureon:
    - entrada: criar sala ou entrar com código;
    - palco com as telas;
    - barra "Transmitir minha tela";
    - lateral com o código, as pessoas (ao vivo, assistindo você, dono), os pedidos e as opções.
  - A aba Transmissão do notch passou a mostrar a sala.
- **Esportes na estética Aureon** (Futebol, Valorant, CS2; o estilo clássico do Widgy continua como opção):
  - **Placar em destaque:** campeonato, selo "Ao vivo", escudos, placar e tempo de jogo ("2º tempo · 72'"), com barra de progresso.
  - **Valorant:** escudos e o mapa em andamento ("Mapa 2 · Haven"), lidos da página da partida no vlr.gg só para a partida em destaque. A arte do agente vem do valorant-api.com, e dá para escolher o agente ou nenhum.
  - **Próximos jogos:** abas de futebol, basquete (NBA, ESPN) e F1 (sessões do fim de semana, ESPN).
  - **Classificação do campeonato** (ESPN): posição, pontos, jogos, vitórias e saldo, com a cor da zona (Libertadores, rebaixamento etc.) e o seu time destacado.
  - **Versão pequena:** "Ao vivo" ou "Próximo jogo".
  - Partidas sem horário ou com times a definir ficam por último na escolha do destaque.
- **Clima na estética Aureon:**
  - Cartão de vidro com cabeçalho e "⋯" (previsão das próximas horas e dias), cidade, temperatura, condição, máxima e mínima.
  - Uma cena desenhada para cada tempo: ensolarado, parcialmente nublado, nublado, chuva, tempestade, neblina, vento, neve e noite.
  - Movimento leve: nuvens, chuva, neve, vento, raio e estrelas, só com transform e opacidade. Fica parado em tela cheia e com "reduzir animações".
  - Dá para fixar uma cena em Widgets › Conteúdo.
- **Vidro real também nos widgets Aureon:** com Fundo › Vidro, o papel de parede desfocado aparece por trás do cartão.
- **Testes:**
  - servidor: 15 testes do protocolo 2 (código curto, várias transmissões, troca de dono, queda e retomada);
  - `tests/sports-aureon.test.mjs`: destaque, tempo de jogo, datas, leitor do vlr.gg e cenas do clima;
  - ponta a ponta com três "PCs":
    - Ana e Bia transmitem ao mesmo tempo e Caio assiste as duas;
    - troca de tela e de qualidade;
    - queda do servidor, troca de dono, encerramento e limpeza;
    - 26 verificações passando;
  - TURN forçado: passou.
  - No total, 71 testes unitários.
  - Os widgets de esportes foram conferidos no Electron com dados reais da ESPN e do vlr.gg.
- **Não testado em hardware real:** a abertura sobre a área de trabalho do Windows e a transmissão em grupo entre redes diferentes. Entre redes diferentes vale o mesmo TURN de antes.


## 0.4.0 (pedido do usuário: revisar design e cantos, notch bem preto e branco, animações fluidas e leves)

- **Notch preto de verdade:** o fundo passou de #050506 para #000000 e todo o texto e os ícones de dentro para #ffffff. Os tons cinza (secundário, apagado) foram reequilibrados sobre o preto puro.
- **Defeitos de design corrigidos:**
  - A cor "apagada" do notch apontava para ela mesma (`--sh-dim: var(--sh-dim)`) e ficava inválida, então alguns ícones e textos sumiam (ex.: nuvem do clima, hora na lista de avisos). Agora ela tem um valor próprio.
  - O seletor de player na aba Mídia aparecia com a borda branca padrão do navegador. Os botões do notch e do app perderam a borda e o fundo padrão.
  - A área de letra da aba Mídia terminava 10 px antes das outras colunas. Agora ocupa toda a altura do painel.
  - Orelhas do notch: 1 px de sobreposição com o corpo, para não abrir fresta com a escala do notch fora de 100%.
  - O seletor "outra cor" (Personalização) tinha o visual nativo do Windows. Agora tem o mesmo formato das amostras.
- **Animações:**
  - Abrir usa uma mola curta: passa ~2% do tamanho e assenta. Medido: 236 → 881 → 860 px. Fechar vai direto, sem quicar.
  - O conteúdo entra só com opacidade e escala. O desfoque animado (`filter: blur`) que existia foi removido, porque é caro de pintar.
  - A sombra do painel fica numa camada própria e aparece por opacidade, sem repintar uma sombra que muda de tamanho.
  - O painel aberto tem tamanho fixo e é só revelado pelo contorno. Antes, toda a grade era recalculada a cada quadro da abertura.
- **Consumo:**
  - As barrinhas de música do notch fechado animavam a altura, o que recalculava o layout continuamente enquanto houvesse música. Agora usam `transform`, que a placa de vídeo anima sozinha.
  - Medido no Chromium em 5 s tocando: antes, 310 recálculos de layout e 122 ms de processador; agora, 0 recálculos e 23 ms.
- **Vidro de verdade nos widgets:**
  - Antes, o "vidro fosco" e o "Desfoque" usavam `backdrop-filter`. Numa janela transparente, o navegador não enxerga o papel de parede do Windows, então o efeito não desfocava nada e só gastava GPU.
  - Agora o app lê o papel de parede atual (`TranscodedWallpaper` e o registro), reduz para uma miniatura de 960 px e cada widget desenha essa imagem desfocada e alinhada com a tela. Isso respeita os estilos preencher, ajustar, estender, centralizar e lado a lado, a área sem a barra de tarefas e a escala do monitor.
  - A camada é estática: o navegador desfoca uma vez e reaproveita.
  - Com o Wallpaper Engine ou o Lively ativos, a imagem salva não corresponde ao que aparece na tela. Nesse caso o vidro fica só translúcido, sem fingir um desfoque errado.
  - O papel de parede é conferido a cada minuto e quando os monitores mudam.
  - Limite: com "estender" (uma imagem para todos os monitores), cada monitor usa a imagem inteira em modo preencher.
- **Responsivo:** com a janela estreita (ou o texto maior), a barra lateral vira só ícones, com o nome ao passar o mouse. As grades passam de 3 para 2 colunas, e de 2 para 1, e a página de Widgets e a de Transmissão empilham as colunas.
- **Testes:** `tests/wallpaper.test.mjs` cobre a leitura do registro, os estilos e o alinhamento, além de não inventar papel de parede fora do Windows. A leitura de uma imagem sem extensão foi conferida no Electron real. São 63 testes unitários, mais e2e, TURN, smoke do Electron e clique real no notch.
- **Não testado em hardware real:** a aparência final do vidro sobre o papel de parede real do Windows e a detecção do Wallpaper Engine.


## 0.3.0 (pedido do usuário: letras, mídia do Carbono, capas, fundos, cores e interface)

- **Widget Música (antes "Mídia")**: agora é o player do Widgy.
  - Formatos: adaptável, mini ou capa grande. Fundo: discreto, capa desfocada, sólido ou nenhum.
  - Capa arredondada, quadrada ou circular. Progresso arrastável e controles.
  - **Letra sincronizada**: a linha atual se preenche como karaokê, com a próxima embaixo. Widget alto mostra a letra inteira rolando, e clicar numa linha pula para ela.
  - Ajuste fino de sincronia (±2 s).
- **Sincronia de verdade**:
  - Antes: a posição era estimada a partir da hora da leitura (a cada ~1,1 s), o que gerava até ~1 s de atraso.
  - Agora: o leitor de mídia envia o instante exato em que o Windows mediu a posição (`LastUpdatedTime`). Teste em `tests/media-position.test.mjs`.
- **Capas que não apareciam**: quando o player não entrega a capa ao Windows (comum no Spotify), o Aureon busca a mesma faixa no iTunes e depois no Deezer. Só aceita com título e artista iguais (regras e testes do Widgy).
- **Aba Mídia do notch igual ao Carbono**:
  - capa recortada girando, com a coroa que reage ao som do PC (espectro do áudio, portado do Widgy);
  - barra de progresso em onda;
  - aleatório e repetir;
  - letra rolando no centro;
  - escolha do player.
- **Fundo por widget**:
  - Padrão, Vidro, Sólido ou Sem fundo, com sombra no texto para continuar legível.
  - Nos widgets com fundo próprio (Clima, Música, Time, Agente), a opção vira o ajuste equivalente de cada um.
  - Clima pode ficar sem o céu, Time sem as cores de fundo, Agente com "Sem fundo".
- **Cores que não funcionavam:**
  - Uma regra genérica do tema ("botão herda a cor do texto") passava por cima das cores dos widgets do Widgy. Era por isso que o ícone de pausar ficava invisível e várias amostras de cor não mudavam nada. A regra foi para uma camada mais fraca.
  - Por dentro, o notch usava cores fixas: a cor escolhida para o notch só mudava a borda. Agora as cores de dentro seguem a escolha.
  - A cor de destaque de cada widget aparece de verdade (no relógio, a data muda de cor). Foi adicionada a **Cor do texto** por widget.
- **Página Widgets reformulada:**
  - lista à esquerda e editor à direita, com as abas Conteúdo, Aparência e Tamanho e posição;
  - catálogo por categoria (Essenciais, Jogos e esportes, PC e diversão), com ícones e descrições.
- **Notch:** clicar num espaço vazio do painel aberto não fecha mais o painel. Ele fecha ao tirar o mouse ou pelo atalho.

## 0.2.0 (a partir do segundo vídeo do usuário)

- **Widgets sumiam depois de "Concluir".**
  - Causa: a camada era mandada para o fundo da pilha de janelas do Windows, que fica *atrás* da área de trabalho e do papel de parede (Wallpaper Engine incluso).
  - Agora ela fica logo acima da janela da área de trabalho: na frente do papel de parede e atrás das janelas comuns. Continua mexendo só na própria janela, sem reparentar nada do Explorer.
  - A posição é reafirmada a cada 20 s.
- **Widgets do Widgy portados**, com o mesmo visual e as mesmas opções:
  - Clima (céu animado, próximas horas, previsão completa e cidade por widget);
  - Futebol (ESPN), CS2 (Liquipedia), Valorant partidas (VLR);
  - Time favorito (placar, último e próximo jogo, forma);
  - Agente do Valorant: arte oficial animada, mapa de fundo, troca sozinha pelo agente escolhido na partida via API local do Riot, modelos e imagens próprias.
  - Testado no Electron com internet de verdade: Brasileirão, CS2 e Corinthians carregaram; a Jett animada apareceu.
  - O clima e às vezes a Liquipedia responderam "429" (limite de pedidos) a partir do IP compartilhado do servidor de testes. Não é defeito do código.
- **Personalização ampliada:**
  - 6 temas prontos;
  - 10 cores de destaque e 8 de fundo, além de cor livre;
  - 6 fontes de interface e 8 de números, todas offline;
  - tamanho do texto;
  - relógio 12/24 h;
  - visual dos widgets: fundo, desfoque, arredondamento, sombra e contorno;
  - cor e contorno do notch;
  - velocidade das animações;
  - prévia ao vivo.
- **TURN sem VPS:** o servidor de sinalização (1.1.0) busca credenciais temporárias na Cloudflare (gratuito) ou na Metered. Passo a passo em `docs/servidor-transmissao.md`.


## Novidade 0.1.2: atualizar pelo próprio app

- Fica em **Configurações › Atualizações**: mostra a versão instalada e tem os botões "Procurar agora", "Baixar" e "Reiniciar e atualizar".
- Opções "Procurar sozinho" (ao abrir e a cada 4 h) e "Baixar sozinho". Instalar continua sendo um clique seu, ou acontece ao sair do app.
- Instala por cima, sem desinstalar e sem perder configurações (`electron-updater`, o mesmo esquema do Widgy).
- Se você estiver transmitindo, o app pergunta antes de atualizar.
- As versões vêm das Releases do repositório `core-dev-user/aureon-hub`, que precisa ser **público**. O workflow `release.yml` publica sozinho quando a versão do `package.json` muda na `main`.
- A versão portátil (zip) não se atualiza sozinha: o app explica isso na própria tela.


## Correção 0.1.1 (achada no primeiro teste num Windows real)

- **Sintoma** (vídeo do usuário): o notch abria ao passar o mouse e os botões acendiam, mas nenhum clique funcionava. Nem as abas nem os botões respondiam.
- **Causa:** a janela do notch era "não focável", para não roubar o foco. No Windows, o Chromium responde ao clique numa janela que não pode ser ativada com `MA_NOACTIVATEANDEAT`: não ativa e descarta o clique. Isso não acontece no Linux nem no navegador, por isso os testes daqui não pegaram.
- **Correção:**
  - o notch passa a ser uma janela focável do tipo "ferramenta", fora do Alt+Tab e da barra;
  - ele aparece sem pegar o foco e devolve o foco ao app em uso quando o mouse sai;
  - a camada de widgets também virou janela de ferramenta.
- **Teste novo:** `npm run test:click` faz cliques reais do sistema (xdotool) no notch do Electron. Ele confirma que o clique troca a aba no Linux, mas não reproduz o comportamento do Windows: **a confirmação final é no seu PC**.


## O que foi removido (de propósito)

| Recurso do Widgy | Situação no Aureon |
|---|---|
| Barra de tarefas própria, barra alternativa, menu Iniciar | Removidos. A barra e o menu do Windows ficam intactos. |
| Gancho global de teclado (tecla Windows, Win+D) | Removido. Único atalho: Ctrl+Alt+Espaço (desligável), que não é do Windows. |
| Janelas presas ao Explorer (WorkerW/Progman), modo "desktop" de tela cheia | Removidos. Os widgets ficam numa janela comum, mandada para o fundo da pilha. |
| Controle do Wallpaper Engine, papel de parede do app, apps que abrem com o Windows | Removidos. O papel de parede do Windows não é tocado. |
| Música embutida (YouTube Music dentro do app), WhatsApp/iFood/Discord embutidos, finanças, estudos, esportes, IA local, assistente | Fora do produto novo (foco em widgets, notch e transmissão). Ver "Não migrado". |

Uma checagem automática (`npm run lint` → `scripts/lint-legacy.mjs`) falha o build se aparecer código que esconde a barra, instala gancho de teclado, troca o papel de parede, pendura janela no Explorer ou reinicia o Explorer.

## O que foi reconstruído

| Pilar | Widgy | Aureon Hub |
|---|---|---|
| Notch Carbono | Painel dentro da janela de tela cheia, aberto pelo mouse no topo | Janela própria por monitor, atravessável, sem roubar foco. Máquina de estados com 7 estados (repouso, hover, aberto, aviso, mídia, transmitindo, alerta), um temporizador por vez, 12 testes. Mesma forma do Carbono (orelhas côncavas). Painel com Agora/Mídia/Transmissão/Atividade, menu de contexto, atalho, avisos com ações (aceitar/recusar). |
| Widgets | Todos numa página de tela cheia | Camada por monitor, cada widget carregado sob demanda e isolado (erro num não derruba os outros). Perfis, adicionar/duplicar/remover, arrastar/redimensionar com grade de 8 px, travar, opacidade, fonte, cor, monitor. Somem e pausam em tela cheia. |
| Transmissão | PeerJS público, código de 6 caracteres, sem aprovação | Servidor de sinalização próprio, convite de 80 bits com validade, aprovação de cada espectador, proteção contra força bruta, TURN com credenciais temporárias, ajuste automático de qualidade, troca de fonte sem reconectar, retomada após queda, diagnóstico de conexão, indicador no notch/bandeja/barra lateral. |

## Funcionalidades concluídas (testadas)

**Transmissão.** Testada com servidor real e dois navegadores isolados (`tests/e2e/share-e2e.cjs`, 19 verificações, todas passando):
- criar sala;
- recusar código errado;
- recusar pedido de entrada;
- entrar com aprovação;
- receber vídeo 1280×720 a ~30 fps e áudio;
- imagem correta;
- estatísticas de envio no painel;
- trocar a fonte sem o espectador reconectar;
- parar as trilhas da fonte antiga;
- trocar a qualidade sem cortar o vídeo;
- queda do servidor de sinalização: o vídeo continua e os dois retomam a sala;
- espectador sai e o transmissor atualiza a lista;
- encerrar avisa o espectador;
- **nenhuma trilha nem conexão sobrando** nos dois lados;
- sala removida do servidor.

Medido nesse teste:
- primeiro quadro em ~590 ms depois de pedir para entrar, contando o clique de aprovação automatizado;
- ~30 fps no espectador.

Ambos os números são na mesma máquina, sem internet no caminho.

**Transmissão forçada pelo TURN** (`tests/e2e/share-turn-e2e.cjs`, coturn local com `use-auth-secret`):
- vídeo chegou pelo par de candidatos relay ↔ relay, ~31 fps;
- credencial temporária aceita pelo coturn;
- encerramento avisado.

**Servidor de sinalização** (`tests/signal-hub.test.mjs`, 12 testes):
- aprovação, recusa e expulsão;
- espectador não fala com espectador;
- força bruta por IP e por sala;
- convite com validade e troca de código;
- retomada do transmissor e do espectador (com e sem chave);
- limite de espectadores;
- credenciais TURN no formato do coturn.

**Notch, qualidade, widgets e módulos do processo principal** (29 testes unitários):
- estados do notch e expansão involuntária;
- fila e silêncio de avisos;
- comportamento em tela cheia;
- ajuste de qualidade por rede/CPU;
- validação do estado salvo;
- detecção de tela cheia e monitor;
- clima por condição;
- jogos;
- teste do servidor;
- posicionamento de widgets sem sobreposição.

**App de verdade no Electron** (`tests/e2e/electron-smoke.cjs`, display virtual Linux):
- janela principal, notch e camada de widgets montam sem nenhum erro de console;
- ida e volta do estado pelo processo principal funciona;
- consumo parado: ~0,4% de CPU e ~610–650 MB de memória somada, com GPU por software. O Linux conta memória compartilhada mais de uma vez, então isso não é medida do Windows.

**Bug real encontrado e corrigido pelos testes:** com a economia de segundo plano do Chromium, a animação de entrada do notch travava e a hora ficava invisível. O notch agora roda sem essa economia (é uma janela minúscula).

## Situação real da transmissão

- **Funciona:**
  - entre duas instalações, no fluxo completo, com o servidor real;
  - pelo TURN, quando configurado.
- **Testado** só na mesma máquina, com dois navegadores isolados e o caminho direto local, e com TURN local.
- **Não testado** entre dois PCs em redes diferentes, com NAT de verdade, porque não há dois computadores aqui. É o próximo teste obrigatório (lista abaixo).
- **Precisa de um servidor seu.** Sem endereço configurado, a tela de Transmissão mostra isso e não finge funcionar. O app não usa mais o servidor público do PeerJS. Publicar no Render ou no Fly.io leva poucos minutos (`docs/servidor-transmissao.md`).

## Não migrado (honesto)

- **WhatsApp:** dependia de embutir o WhatsApp Web dentro do app (pesado e frágil). Não existe no Aureon 0.1.0.
- **YouTube Music:** não é embutido. O widget de mídia e o notch mostram e controlam o YouTube Music (app/PWA ou navegador) pelos controles de mídia do Windows, igual ao Spotify.
- **Spotify:** mesma via (SMTC). Capa, título, artista, posição e play/pausa/próxima funcionam quando o Spotify publica no Windows. Não há login na API do Spotify (letras, biblioteca etc.).
- **Widgets de jogos:**
  - o atual mostra o jogo em primeiro plano, o tempo de sessão e o histórico;
  - não lê estatísticas de dentro dos jogos (o "agente do Valorant" do Widgy não veio).
- **Avisos de outros apps:** o Windows não deixa um app comum ler essas notificações. A central mostra só os avisos do próprio Aureon.
- **IA, voz, lembretes e rotinas:** não incluídos, conforme o pedido.
- **Visualizador pela web** (opcional no pedido): não feito.

## Testes reais que ainda precisam ser feitos (num PC com Windows)

1. Instalar o `AureonHub-Setup` (ou baixar o artefato do workflow `build`), abrir e desinstalar.
2. Notch:
   - DPI de 100%, 125%, 150% e 200%;
   - dois monitores, com o notch em "Todos";
   - o atalho Ctrl+Alt+Espaço;
   - clique e passagem do mouse sobre apps abaixo do notch;
   - um jogo em tela cheia exclusiva e um em janela sem borda.
3. Widgets:
   - Win+D (eles devem voltar);
   - ficar atrás das janelas;
   - mídia com Spotify e com YouTube Music;
   - clima com uma cidade escolhida;
   - um dia inteiro aberto, olhando a memória em Diagnósticos.
4. Transmissão:
   - entre dois PCs na mesma rede e em redes diferentes (4G × fibra);
   - com e sem som do PC;
   - "preferir placa de vídeo" ligado: conferir se aparece "· placa" em Envio;
   - desligar o Wi-Fi do espectador por 10 s e ver se ele volta;
   - fechar à força o Aureon de quem transmite: o espectador deve ser avisado em até 45 s.
5. Comparar CPU/RAM com o Widgy no mesmo PC: Diagnósticos do Aureon e Gerenciador de Tarefas. Essa comparação **não foi medida** aqui.

## Instalador

- **Gerado aqui:** `AureonHub-Setup-0.1.0.exe` (NSIS, x64, ~124 MB), compilado no Linux com Wine. Conferi que o pacote dentro dele traz as três páginas e o processo principal.
- **Não verificado aqui:** instalação, execução e desinstalação no Windows. O Wine deste ambiente não consegue simular um Windows 64 bits e o instalador é só para x64. Instalador sem assinatura digital: o Windows SmartScreen vai avisar ("Mais informações › Executar assim mesmo").
- **Verificação automática:** o workflow `.github/workflows/build.yml` gera o instalador no `windows-latest`, instala em silêncio, abre o app em modo de teste, confere o relatório e desinstala. Ele não publica release.
