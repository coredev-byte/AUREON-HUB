# Servidor de transmissão

A transmissão do Aureon Hub precisa de dois serviços:

1. **Sinalização** (`server/`, obrigatório): um servidor WebSocket pequeno (Node + `ws`). Ele cria as salas, confere os convites, repassa as mensagens de conexão e gera credenciais TURN temporárias. **Vídeo e áudio não passam por ele.**
2. **TURN** (coturn, recomendado): retransmite a mídia quando a rede de alguém bloqueia a conexão direta (CGNAT rígido, empresa, escola). Sem TURN, a transmissão funciona na maioria das redes domésticas, mas não em todas.

Quem transmite e quem assiste precisam configurar o **mesmo** endereço em *Transmissão › Servidor e conexão*.

## Variáveis de ambiente (sinalização)

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | 8787 | Porta HTTP/WebSocket (`/ws` para o app, `/health` para verificação). |
| `TRUST_PROXY` | 0 | `1` atrás de proxy (Render, Fly): usa `X-Forwarded-For` para limitar tentativas por IP. |
| `MAX_VIEWERS` | 8 | Espectadores por sala. |
| `ROOM_TTL_MIN` | 480 | Vida máxima de uma sala. |
| `CODE_TTL_MIN` | 120 | Validade do convite para novas entradas. O transmissor pode gerar outro. |
| `MAX_CONN_PER_IP` | 30 | Conexões simultâneas por IP. |
| `STUN_URLS` | Google + Cloudflare | Lista separada por vírgula. |
| `TURN_URLS` | (vazio) | Ex.: `turn:turn.seudominio.com:3478,turns:turn.seudominio.com:443?transport=tcp`. |
| `TURN_SECRET` | (vazio) | O mesmo `static-auth-secret` do coturn. Gera credenciais temporárias por pessoa. |
| `TURN_TTL_S` | 21600 | Validade das credenciais TURN (segundos). |
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

- **Convite:** `SALA-SEGREDO` com 16 caracteres (80 bits). O servidor guarda só o hash do segredo e compara em tempo constante.
- **Tentativas erradas:**
  - 8 erros por IP em 10 min bloqueiam aquele IP;
  - 30 erros numa mesma sala a trancam e avisam o transmissor, que pode gerar um código novo.
- **Aprovação** de cada espectador ligada por padrão. O transmissor pode recusar, remover ou trancar a sala.
- **Retomada:** depois de uma queda, só volta quem tem a chave de retomada. O transmissor tem 45 s; o espectador, 30 s.
- **Mensagens:**
  - espectadores só falam com o transmissor, nunca entre si;
  - limite de 64 KB por mensagem e de 60 mensagens por segundo por conexão.
- **Criptografia:** a mídia vai em WebRTC (DTLS-SRTP). A sinalização deve usar `wss://`, ou seja, TLS no proxy ou na plataforma.
- **O servidor não grava nada**, não tem banco de dados e esquece tudo ao reiniciar.

## Rodar localmente (testes)

```
npm run server          # ws://localhost:8787/ws
```
