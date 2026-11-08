# Contrato de rotas (frontend)

Estado **alvo** da navegação da SPA. A implementação acontece em fases; enquanto
a fase 1 não entra, o app usa `?board=<uuid>` + hash.

## Rotas

| URL | Tela |
|---|---|
| `/` | redireciona para o último board (`localStorage`) ou `/boards` |
| `/boards` | visão "todos os boards" |
| `/boards/<board>` | board aberto |
| `/boards/<board>/cards/<card>` | card aberto (deep link compartilhável) |
| `/settings` | settings (general) |
| `/settings/<section>` | aba de settings |

## Refs

`<board>` e `<card>` são **refs opacas** para o router; quem resolve é um único
resolvedor.

| Ref | Formatos aceitos (em ordem) |
|---|---|
| `<board>` | `slug` → `uuid` |
| `<card>` | `number` (por board) → `key` (`PROJ-42`) → `uuid` |

- Fase 1: `board = uuid`, `card = key/uuid`.
- Fase 3: o build passa a preferir `slug`/`number`; as rotas não mudam.

## Query string

Reservada a **estado efêmero**, nunca identidade/navegação:

```
?view=list
?assignee=<id>&priority=<p>&tag=<t>
?q=<busca>
```

## Navegação e histórico

- Mudança de rota (board, card, settings): `history.pushState`.
- Mudança de filtro/visualização: `history.replaceState`.
- Um único listener de `popstate`; **sem** roteamento por hash.

## Redirects legados (somente nesta versão)

No boot, antes de renderizar:

| URL antiga | Nova |
|---|---|
| `?board=<uuid>` | `/boards/<uuid>` |
| `#settings` / `#settings/<section>` | `/settings` / `/settings/<section>` |
| `#<KEY>` | `/boards/<último-board>/cards/<KEY>` |

Filtros presentes na query antiga são preservados no redirect.

## Fallback do servidor (SPA)

O servidor devolve `index.html` somente quando **todas** as condições valem:

- método `GET` ou `HEAD`;
- path não começa com `/api/` nem `/plugins/`;
- path não é `/healthz` nem `/readyz`;
- o último segmento não tem extensão (`.js`, `.css`, `.png`, `.json`, …).

Caso contrário responde o 404 real. A mesma regra vale para dev e produção.

```
GET /boards/8509.../cards/LWTS-1   → 200 index.html
GET /settings/general              → 200 index.html
GET /api/nope                      → 404 JSON
GET /assets/missing.js             → 404
POST /boards                       → 405/404
```

## API

Os endpoints REST (`/api/v1/...`) **não mudam** neste contrato. Endpoints por
UUID continuam válidos; a fase 3 acrescenta resolução por `slug`/`number`.

## Critérios de aceite (fase 1)

1. Refresh direto em `/boards/<uuid>`, `/boards/<uuid>/cards/<KEY>` e
   `/settings/general` renderiza a tela correta.
2. "Copiar link" do card inclui o board e resolve keys com hífen (`MY-BOA-1`).
3. `/boards` (todos os boards) sobrevive a refresh e ao botão voltar.
4. `POST /api/nope` → 404; `/assets/nao-existe.js` → 404.
5. URLs legadas redirecionam uma única vez e não voltam ao hash.
