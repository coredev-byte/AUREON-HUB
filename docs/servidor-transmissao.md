# Servidor de transmissão

A transmissão do Aureon Hub precisa de dois serviços:

1. **Sinalização** (`server/`, obrigatório): um servidor WebSocket pequeno (Node + `ws`). Ele cria as salas, confere os códigos, repassa as mensagens de conexão e gera credenciais TURN temporárias. **Vídeo e áudio não passam por ele.**
   - Versão 2.1 (protocolo 2 + salas com senha), exigida pelo Aureon Hub 0.7 ou mais novo. A 2.0 serve para o app 0.5–0.6. A sala funciona como um canal de voz: várias pessoas entram, qualquer uma pode transmitir a própria tela e cada uma escolhe o que assistir.
2. **TURN** (coturn, recomendado): retransmite a mídia quando a rede de alguém bloqueia a conexão direta (CGNAT rígido, empresa, escola). Sem TURN, a transmissão funciona na maioria das redes domésticas, mas não em todas.

Todo mundo na sala precisa configurar o **mesmo** endereço em *Transmissão › Servidor e conexão*.

> **Atualizando da versão 1.x:** publique de novo a pasta `server/` (no Render, "Manual Deploy › Deploy latest commit", se o deploy automático estiver desligado). Confira em `/health`: deve aparecer `"version":"2.1.0","protocol":2,"features":["passwords"]`. Apps 0.4 ou mais antigos não entram em salas do servidor 2.0.

## Variáveis de ambiente (sinalização)

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | 8787 | Porta HTTP/WebSocket (`/ws` para o app, `/health` para verificação). |
| `TRUST_PROXY` | 0 | `1` atrás de proxy (Render, Fly): usa `X-Forwarded-For` para limitar tentativas por IP. |
| `MAX_VIEWERS` | 8 | Pessoas por sala além de quem criou. |
| `ROOM_TTL_MIN` | 480 | Vida máxima de uma sala. |
| `CODE_TTL_MIN` | 120 | Validade do convite para novas entradas. O transmissor pode gerar outro. |
| `MAX_CONN_PER_IP` | 30 | Conexões simultâneas por IP. |
| `STUN_URLS` | Google + Cloudflare | Lista separada por vírgula. |
| `TURN_URLS` | (vazio) | Ex.: `turn:turn.seudominio.com:3478,turns:turn.seudominio.com:443?transport=tcp`. |
| `TURN_SECRET` | (vazio) | O mesmo `static-auth-secret` do coturn. Gera credenciais temporárias por pessoa. |
| `TURN_TTL_S` | 21600 | Validade das credenciais TURN (segundos). |
| `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN` | (vazio) | TURN da Cloudflare (gratuito): o servidor gera credenciais temporárias. |
| `METERED_APP` / `METERED_API_KEY` | (vazio) | TURN da Metered. |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | (vazio) | Alternativa para TURN com usuário fixo (ex.: Metered, Cloudflare). Menos seguro que `TURN_SECRET`. |

## Publicar a sinalização

### Render.com (plano gratuito aceita WebSocket)
1. Suba esta pasta num repositório no GitHub.
2. No Render: **New › Blueprint** e aponte para o repositório (usa `server/render.yaml`).
3. Quando estiver no ar, o endereço para o app é `wss://<nome>.onrender.com/ws`.
4. Observação: o plano gratuito "dorme" sem uso. A primeira conexão depois de um tempo parado pode levar ~30 s.

### Fly.io
```
cd server
fly launch --copy-config --no-deploy
fly deploy
```
Endereço: `wss://<app>.fly.dev/ws`.

### VPS (Docker)
```
cd server
docker build -t aureon-signal .
docker run -d --restart=always -p 8787:8787 -e TRUST_PROXY=1 -e TURN_URLS=... -e TURN_SECRET=... aureon-signal
```
Coloque na frente um proxy com HTTPS (Caddy: `sinal.seudominio.com { reverse_proxy localhost:8787 }`). O app só aceita `wss://` fora do localhost.

## TURN pronto e gratuito: Cloudflare (recomendado, 5 minutos)

Não precisa de VPS. O servidor de sinalização pede à Cloudflare credenciais **temporárias** e repassa para os apps. A chave fica só no servidor.

1. Entre em https://dash.cloudflare.com (conta gratuita) e abra **Realtime › TURN Server** (o link do painel é `https://dash.cloudflare.com/?to=/:account/calls`).
2. Clique em **Create** para criar uma chave TURN. Copie o **TURN Token ID** e o **API Token**: o token aparece uma vez só.
3. No Render, abra o serviço `aureon-signal` › **Environment** › **Add Environment Variable**:
   - `CF_TURN_KEY_ID` = o TURN Token ID
   - `CF_TURN_API_TOKEN` = o API Token
4. Salve. O Render reinicia o serviço sozinho.
5. Confira em `https://<seu-servidor>.onrender.com/health`: deve aparecer `"turn":true,"turnProvider":"cloudflare"`. No app, use **Transmissão › Servidor e conexão › Testar**: a linha "Retransmissão (TURN)" fica verde.

Alternativa: Metered (https://www.metered.ca), com `METERED_APP` (o nome antes de `.metered.live`) e `METERED_API_KEY`.

> O servidor precisa estar na versão 2.0.0 ou mais nova (a pasta `server/` desta versão). Se o Render publica a partir do seu repositório, basta enviar o código novo.

## TURN (coturn)

Precisa de uma VPS com IP público (o TURN usa portas UDP; plataformas como Render não servem).

```
apt install coturn
cp server/turn/turnserver.conf /etc/turnserver.conf    # edite realm, external-ip, segredo e certificados
systemctl enable --now coturn
```

Portas a liberar:
- 3478 UDP/TCP;
- 5349 TCP (TLS);
- 49160–49200 UDP (relay).

Para passar por redes muito fechadas, use também `turns:` na porta 443/TCP.

No servidor de sinalização:
- `TURN_URLS=turn:turn.seudominio.com:3478,turns:turn.seudominio.com:5349`
- `TURN_SECRET=<o mesmo static-auth-secret>`

## Segurança

- **Nome e senha:** quem cria escolhe o nome da sala (3 a 24 letras, números ou hífen) e uma senha (4 a 64 caracteres). Quem entra digita os dois.
  - O servidor nunca guarda a senha: guarda só um hash scrypt com sal próprio. O cálculo é lento de propósito (~50 ms) para atrapalhar chutes em massa, e a comparação é em tempo constante. A sala inexistente custa o mesmo tempo, então a resposta não revela se ela existe.
  - O dono pode trocar a senha a qualquer momento. Quem já está dentro continua; quem for entrar usa a nova.
  - Por padrão, quem cuida da sala ainda aprova cada entrada.
  - Apps 0.5–0.6 ainda conseguem usar salas de código curto (`XXXX-XXXX`) no mesmo servidor.
- **Tentativas erradas:**
  - 8 erros por IP em 10 min bloqueiam aquele IP;
  - 30 erros numa mesma sala a trancam e avisam o transmissor, que pode gerar um código novo.
- **Aprovação** de cada pessoa ligada por padrão. Quem cuida da sala pode recusar, remover ou trancar a sala.
- **Dono da sala:** se quem criou a sala sai ou cai por mais de 45 s, ela passa para quem entrou primeiro, junto com os pedidos pendentes. Só o dono encerra a sala para todos.
- **Retomada:** depois de uma queda, só volta quem tem a chave de retomada. O dono tem 45 s; os outros, 30 s. As telas abertas continuam durante a queda, porque o vídeo vai direto entre os PCs.
- **Mensagens:**
  - só membros aceitos trocam mensagens de conexão entre si; quem espera aprovação não fala com ninguém;
  - limite de 64 KB por mensagem e de 60 mensagens por segundo por conexão.
- **Criptografia:** a mídia vai em WebRTC (DTLS-SRTP). A sinalização deve usar `wss://`, ou seja, TLS no proxy ou na plataforma.
- **O servidor não grava nada**, não tem banco de dados e esquece tudo ao reiniciar.

## Rodar localmente (testes)

```
npm run server          # ws://localhost:8787/ws
```
