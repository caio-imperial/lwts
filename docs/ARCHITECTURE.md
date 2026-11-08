# Arquitetura e organização do repositório

Este documento descreve o que existe **hoje** no repositório. Para o contrato de
URLs, veja [ROUTES.md](ROUTES.md).

## Visão geral

O repositório hospeda três produtos e três toolchains:

| Área | O que é | Toolchain |
|---|---|---|
| `server/` | API HTTP, SSE/WebSocket, CLI administrativo e migrations | Go 1.25+ |
| `web/` | SPA de kanban (vanilla JS + Vite) | Node 20 (somente build/teste) |
| `docs/` | Landing page publicada via GitHub Pages (`CNAME`) | HTML/CSS/JS puro |
| `tests/` | Specs manuais de UI para agente + testes unitários de frontend | Node |
| `tf/`, `Dockerfile*`, `docker-compose*.yml` | empacotamento e deploy (Docker, Lambda, Terraform) | Docker/Terraform |

O runtime de produção é **apenas o binário Go**; Node não roda em produção.

## Backend (`server/`)

```
server/
├── cmd/
│   ├── main.go        # entrypoint: config, DB, rotas, middleware, estáticos
│   ├── admin.go       # CLI: users, boards, cards, seed, backup, restore, api-key
│   └── plugins.go     # descoberta/render de header plugins
├── internal/
│   ├── auth/          # JWT, login/registro, senha, middleware de auth
│   ├── board/         # handlers de board + busca/snippets
│   ├── card/          # handlers de card + imagens
│   ├── comment/       # handlers de comentário
│   ├── config/        # configuração por variáveis de ambiente
│   ├── db/            # datasource SQLite/Postgres, migrator
│   ├── discord/       # notificações Discord
│   ├── embed/         # busca semântica opcional (pgvector + embeddings)
│   ├── middleware/    # CORS, body limit, rate limit, logger, recovery, security
│   ├── repo/          # repositórios, modelos, validação, seed
│   ├── settings/      # settings do workspace, API keys, export/reset
│   ├── sse/           # hub SSE, event store, WebSocket, presença
│   └── webhook/       # dispatch, retry, delivery logs
└── migrations/        # 20 migrations SQL (+ .down) embutidas via go:embed
```

Observações:

- `internal/repo` concentra persistência **e** regras de domínio (ex.:
  `custom_fields.go`) **e** seed (`seed.go`, `seed_test_data.go`).
- `server/cmd` é um único `package main` com o entrypoint e ~20 comandos de CLI.
- A geração de `cards.key` vive em `internal/repo/card.go` (`nextKey`).

## Banco de dados

Suporta **SQLite** (default de dev) e **PostgreSQL** (produção/semântica).
As migrations são SQL portável, traduzidas em runtime para SQLite
(`internal/db/migrate.go`).

Tabelas: `users`, `refresh_tokens`, `boards`, `cards`, `comments`, `webhooks`,
`webhook_deliveries`, `invites`, `settings`, `api_keys`, `discord_integrations`,
`board_events`, `card_images`, `schema_migrations`.

Restrições relevantes para identidade de card:

- `cards.key` é **único globalmente** (`idx_cards_key`).
- `boards.project_key` é o prefixo exibido nas keys; hoje **não** é único.
- Não existe contador persistido: o próximo número é derivado das keys
  existentes dentro do board.

## Frontend (`web/`)

```
web/
├── index.html        # shell da SPA (contém muito script inline)
├── login.html        # página de login separada
├── src/              # módulos ES carregados por main.js em ordem de dependência
│   ├── main.js       # entrypoint: importa os módulos e inicializa a SPA
│   ├── kanban.js     # estado do board, render, drag&drop, detail, picker, hash router
│   ├── settings.js   # todas as telas de settings
│   ├── features.js   # filtros, busca, board switching, presença
│   ├── listview.js, subtasks.js, editor.js, dropdown.js
│   ├── api.js, auth.js, boardstream.js, presence.js, notifications.js
│   ├── boardthemes.js, a11y.js, plugins.js, login.js
├── styles/           # 10 arquivos CSS (theme, board, detail, settings, ...)
├── public/           # favicon, imagens
├── vite.config.js    # build para web/dist
└── package.json      # Vite (devDependency única)
```

Características atuais:

- Módulos são carregados por **efeito colateral** (`import './x.js'`) e se
  comunicam por `window.*` (centenas de ocorrências), não por imports explícitos.
- `kanban.js` (~3.2k linhas) e `settings.js` (~3.1k linhas) concentram múltiplas
  responsabilidades.
- A navegação usa **path** (`/boards/...`, `/settings/...`) via History API.
  URLs antigas com `?board=` ou hash são ignoradas (sem redirect).

## Testes

| Tipo | Onde | Como rodar |
|---|---|---|
| Go unitário | colocalizado (`*_test.go`) | `go test ./...` |
| Go integração | tags `integration` | `make test-pg` / `make test-sqlite` |
| Frontend unitário | `tests/frontend/*.test.js` | `node --test tests/frontend/*.test.js` |
| Frontend E2E (Playwright) | `tests/e2e/*.spec.js` | `make test-e2e` |
| UI manual (agente/CDP) | `tests/*.md` | `tests/start-test-server.sh` + specs 01–11 |

Dependências de teste do frontend (`jsdom`, `postcss`) ficam no `package.json`
da **raiz**; as dependências do app ficam em `web/package.json`.

## Build, execução e deploy

- `make run` — build, migrate, seed, cria admin e sobe em `:8099` com SQLite em
  `/tmp/lwts-e2e.db`.
- `make dev` — hot reload com `air` (requer `air` instalado).
- `make verify` — gate local usado antes de merge (build, vet, testes, build do
  frontend).
- `make test-e2e` — Playwright contra o servidor de teste descartável em `:8044`
  (Chrome do sistema; `PW_HEADED=1` para ver o browser).
- `make verify-full` — `verify` + E2E.
- `Dockerfile` — estágio Vite + estágio Go + imagem Alpine; o build do frontend
  vai para `/static`, servido pelo binário via `STATIC_DIR`.
- `Dockerfile.lambda` / `tf/` — deploy serverless com Lambda Web Adapter.
- `docs/` — landing page estática (GitHub Pages).

## Inconsistências conhecidas

1. O README citava `server/internal/api/`, que **não existe**.
2. O README fala em "embed the frontend at build time", mas os assets são
   servidos de `STATIC_DIR` (não há `go:embed` de `web/dist`).
3. Existem duas formas de subir o servidor além do `make run`:
   `scripts/start.sh` e `tests/start-test-server.sh`.
4. `docs/` é o site de marketing, não documentação de desenvolvimento.
5. Os workflows do fork ainda apontam para o registry e os runners do projeto
   original.
