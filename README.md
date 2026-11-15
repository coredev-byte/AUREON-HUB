<p align="center"><img src="build/icon.png" width="96" alt="Aureon Hub"></p>

# Aureon Hub

Widgets inteligentes, um Notch no topo da tela e transmissão de tela privada, com o visual Carbono. O Windows continua nativo: o Aureon não substitui nem altera a barra de tarefas, o Explorer, os atalhos ou o papel de parede.

## Desenvolvimento

```
npm install
npm run build          # verificação de tipos + build das páginas
npm run app            # abre o app (usa dist/)
npm run server         # servidor de sinalização local em ws://localhost:8787/ws
```

Para recarregar ao editar: rode `npm run dev` e, em outro terminal, `AUREON_DEV_URL=http://localhost:5173 npm run app`.

## Testes

```
npm run lint           # tipos estritos + regra "não mexer no Windows"
npm test               # unitários (notch, qualidade, servidor, widgets, módulos do processo principal)
npm run test:e2e       # transmissão real com servidor + dois navegadores
npm run test:turn      # transmissão forçada pelo TURN (precisa do coturn instalado)
npm run test:electron  # abre o app Electron de verdade e confere as janelas
```

## Instalador do Windows

`npm run dist:win` no Windows, ou o workflow **build** no GitHub (artefato `AureonHub-Setup`).

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Servidor de transmissão (sinalização + TURN)](docs/servidor-transmissao.md)
- [Auditoria do Widgy](docs/auditoria-widgy.md)
- [Relatório: Widgy × Aureon, limitações e testes pendentes](docs/relatorio.md)
