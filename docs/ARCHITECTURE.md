# Architecture and repository layout

This document describes what exists in the repository **today**. For the URL
contract, see [ROUTES.md](ROUTES.md).

## Overview

The repository hosts three products and three toolchains:

| Area | What it is | Toolchain |
|---|---|---|
| `server/` | HTTP API, SSE/WebSocket, admin CLI and migrations | Go 1.25+ |
| `web/` | Kanban SPA (vanilla JS + Vite) | Node 20 (build/test only) |
| `docs/` | Landing page published via GitHub Pages (`CNAME`) | plain HTML/CSS/JS |
| `tests/` | Manual agent UI specs + frontend unit/E2E tests | Node |
| `tf/`, `Dockerfile*`, `docker-compose*.yml` | packaging and deploy (Docker, Lambda, Terraform) | Docker/Terraform |

The production runtime is **only the Go binary**; Node does not run in
production.

## Backend (`server/`)

```
server/
├── cmd/
│   ├── main.go        # entrypoint: config, DB, routes, middleware, static files
│   ├── admin.go       # CLI: users, boards, cards, seed, backup, restore, api-key
│   └── plugins.go     # header plugin discovery/render
├── internal/
│   ├── auth/          # JWT, login/register, passwords, auth middleware
│   ├── board/         # board handlers + search/snippets
│   ├── card/          # card handlers + images
│   ├── comment/       # comment handlers
│   ├── config/        # environment-based configuration
│   ├── db/            # SQLite/Postgres datasource, migrator
│   ├── discord/       # Discord notifications
│   ├── embed/         # optional semantic search (pgvector + embeddings)
│   ├── middleware/    # CORS, body limit, rate limit, logger, recovery, security
│   ├── repo/          # repositories, models, validation, seed
│   ├── settings/      # workspace settings, API keys, export/reset
│   ├── spa/           # SPA fallback rule (serves index.html for app routes)
│   ├── sse/           # SSE hub, event store, WebSocket, presence
│   └── webhook/       # dispatch, retry, delivery logs
└── migrations/        # 20 SQL migrations (+ .down) embedded via go:embed
```

Notes:

- `internal/repo` mixes persistence, domain rules (e.g. `custom_fields.go`) and
  seed data (`seed.go`, `seed_test_data.go`).
- `server/cmd` is a single `package main` with the entrypoint and ~20 CLI
  commands.
- Card key generation lives in `internal/repo/card.go` (`nextKey`).

## Database

Supports **SQLite** (dev default) and **PostgreSQL** (production/semantic
search). Migrations are portable SQL translated at runtime for SQLite
(`internal/db/migrate.go`).

Tables: `users`, `refresh_tokens`, `boards`, `cards`, `comments`, `webhooks`,
`webhook_deliveries`, `invites`, `settings`, `api_keys`, `discord_integrations`,
`board_events`, `card_images`, `schema_migrations`.

Card identity (phase 3a implemented):

- `workspaces` is the platform-wide scope (unique `slug`; one `Default` workspace
  is created by the migration and existing boards are attached to it).
- `boards.workspace_id` and `boards.slug` (unique per workspace) identify a
  board; the alias is the normalized board name and changes when the board is
  renamed.
- `boards.card_seq` is the persisted per-board counter; card creation allocates
  numbers with `UPDATE ... RETURNING` inside the insert transaction.
- `cards.number` and `cards.key` are unique **per board**
  (`UNIQUE (board_id, number)`, `UNIQUE (board_id, key)`). The old global
  `idx_cards_key` was removed.
- `key` is display/legacy (`PROJ-42`); `number` is the public identity.
- `GET /api/v1/cards/{key}` returns 409 `ambiguous_key` when the same key
  exists in more than one board; UUID lookups still work.

Still pending (phase 3c): workspace-scoped API routes, `/<workspace>/<board>`
URLs and the workspace selector UI.

## Frontend (`web/`)

```
web/
├── index.html        # SPA shell (still contains a lot of inline script)
├── login.html        # separate login page
├── src/              # ES modules imported by main.js in dependency order
│   ├── main.js       # entrypoint: imports modules and boots the SPA
│   ├── router.js     # pure route helpers (parse/build/navigate)
│   ├── kanban.js     # board state, render, drag&drop, detail, picker, boot routes
│   ├── settings.js   # every settings screen
│   ├── features.js   # filters, search, board switching, presence
│   ├── listview.js, subtasks.js, editor.js, dropdown.js
│   ├── api.js, auth.js, boardstream.js, presence.js, notifications.js
│   ├── boardthemes.js, a11y.js, plugins.js, login.js
├── styles/           # 10 CSS files (theme, board, detail, settings, ...)
├── public/           # favicon, images
├── vite.config.js    # build output: web/dist
└── package.json      # Vite (single devDependency)
```

Current characteristics:

- Modules are loaded for their **side effects** (`import './x.js'`) and talk
  through `window.*` (hundreds of occurrences), not explicit imports.
- `kanban.js` (~3.2k lines) and `settings.js` (~3.1k lines) concentrate several
  responsibilities.
- Navigation uses **paths** (`/boards/...`, `/settings/...`) through the History
  API. Legacy `?board=` and hash URLs are ignored (no redirect).

## Tests

| Type | Location | Command |
|---|---|---|
| Go unit | colocated (`*_test.go`) | `go test ./...` |
| Go integration | `integration` build tag | `make test-pg` / `make test-sqlite` |
| Frontend unit (jsdom) | `tests/frontend/*.test.js` | `node --test tests/frontend/*.test.js` |
| Frontend E2E (Playwright) | `tests/e2e/*.spec.js` | `make test-e2e` |
| Manual UI (agent/CDP) | `tests/*.md` | `tests/start-test-server.sh` + specs 01–11 |

Frontend test dependencies (`jsdom`, `postcss`, `@playwright/test`) live in the
**root** `package.json`; application dependencies live in `web/package.json`.

## Build, run and deploy

- `make run` — build, migrate, seed, create admin and start on `:8099` with
  SQLite at `/tmp/lwts-e2e.db`.
- `make dev` — hot reload with `air` (requires `air` installed).
- `make verify` — local pre-merge gate (build, file-size check, vet, Go tests,
  frontend build).
- `make check-size` — fails when a tracked source file exceeds 500 lines
  (`scripts/file-size-allowlist.txt` keeps the current exceptions; the list
  must only shrink).
- `make test-e2e` — Playwright against the disposable test server on `:8044`
  (system Chrome; `PW_HEADED=1` to watch it).
- `make verify-full` — `verify` + E2E.
- `Dockerfile` — Vite stage + Go stage + Alpine image; the frontend build is
  copied to `/static` and served by the binary through `STATIC_DIR`.
- `Dockerfile.lambda` / `tf/` — serverless deploy with Lambda Web Adapter.
- `docs/` — static landing page (GitHub Pages).

## Known inconsistencies

1. The README used to mention `server/internal/api/`, which **does not exist**
   (fixed).
2. The README says "embed the frontend at build time", but assets are served
   from `STATIC_DIR` (there is no `go:embed` of `web/dist`).
3. Besides `make run`, the server can be started by `scripts/start.sh` and
   `tests/start-test-server.sh`.
4. `docs/` is the marketing site, not developer documentation.
5. Files over 500 lines are common; a file-size gate and a mechanical split are
   planned.
