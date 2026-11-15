# Relatório da reconstrução: Widgy → Aureon Hub 0.1.0

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
