# Route contract (frontend)

The SPA navigates by **path** using the History API: no hash routing and no
redirects for old URLs. Routes are workspace-scoped (phase 3c-2).

## Routes

| URL | Screen |
|---|---|
| `/` | redirects to the last board (`localStorage`) or the default workspace |
| `/<workspace>` | "all boards" view for the workspace |
| `/<workspace>/<board>` | open board (alias) |
| `/<workspace>/<board>/cards/<card>` | open card (shareable deep link) |
| `/settings` | settings (general) |
| `/settings/<section>` | settings tab |

Reserved first segments never parse as a workspace: `settings`, `boards`, `api`,
`assets`, `login`, `plugins`, `healthz`, `readyz`. `/boards...` is therefore
`notFound` and falls back to the default workspace (no redirect).

## Refs

`<board>` and `<card>` are **opaque refs** to the router; a single resolver
interprets them.

| Ref | Accepted formats (in order) |
|---|---|
| `<workspace>` | `slug` |
| `<board>` | `slug` (unique inside the workspace) → `uuid` |
| `<card>` | `number` (per board) → `key` (`PROJ-42`) → `uuid` |

- Current (phase 3c-2): `/<workspace>/<board>` and
  `/<workspace>/<board>/cards/<number>`; the SPA fetches the default workspace on
  boot and resolves board/card refs inside it.

Keys are unique **per board**; `GET /api/v1/cards/{key}` returns `409
ambiguous_key` when the key exists in more than one board. Use the card UUID or
a board-scoped route.

## Query string

Reserved for **ephemeral state**, never identity/navigation:

```
?view=list
?assignee=<id>&priority=<p>&tag=<t>
?q=<search>
```

## Navigation and history

- Route change (board, card, settings): `history.pushState`.
- Filter/view change: `history.replaceState`.
- A single `popstate` listener; **no** hash routing.

## Old URLs

There is no compatibility redirect. `?board=...` and hashes (`#settings`,
`#<KEY>`) are **ignored**: the path decides the route and, at `/`, the app opens
the last board (or the default workspace root).

## Server fallback (SPA)

The server returns `index.html` only when **all** conditions hold:

- method is `GET` or `HEAD`;
- path does not start with `/api/` or `/plugins/`;
- path is not `/healthz` or `/readyz`;
- the last segment has no extension (`.js`, `.css`, `.png`, `.json`, …).

Otherwise it returns a real 404. The same rule applies to dev and production.

```
GET /default/my-board/cards/42     → 200 index.html
GET /settings/general              → 200 index.html
GET /api/nope                      → 404
GET /assets/missing.js             → 404
POST /boards                       → 405/404
```

## API

REST endpoints (`/api/v1/...`) **do not change** for UUID-based clients. Phase
3 adds workspace-scoped read routes resolved by slug:

```
GET /api/v1/workspaces
GET /api/v1/workspaces/<workspace>/boards
GET /api/v1/workspaces/<workspace>/boards/<board>
GET /api/v1/workspaces/<workspace>/boards/<board>/cards
GET /api/v1/workspaces/<workspace>/boards/<board>/cards/<card>
```

`<workspace>` = slug (or UUID), `<board>` = slug inside the workspace (or
UUID), `<card>` = per-board number (or key or UUID). Unknown refs return 404.
Legacy `/api/v1/boards/{id}` endpoints remain valid for compatibility.

## Acceptance criteria (phase 3c-2)

1. Direct refresh on `/<workspace>`, `/<workspace>/<board>` and
   `/<workspace>/<board>/cards/<number>` renders the correct screen.
2. The card "copy link" is `/<workspace>/<board>/cards/<number>` (falls back to
   `key` when the number is missing).
3. The workspace root (all boards) survives refresh and the back button.
4. `POST /api/nope` → 404; `/assets/missing.js` → 404.
5. Old URLs (`/boards...`, `?board=`, hash) do not break boot: they land on the
   default workspace without a redirect and without a blank screen.
