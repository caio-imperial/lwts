# Route contract (frontend)

The SPA navigates by **path** using the History API: no hash routing and no
redirects for old URLs. The implementation is in phase 2b; `slug`/`number`
identifiers arrive in phase 3.

## Routes

| URL | Screen |
|---|---|
| `/` | redirects to the last board (`localStorage`) or `/boards` |
| `/boards` | "all boards" view |
| `/boards/<board>` | open board |
| `/boards/<board>/cards/<card>` | open card (shareable deep link) |
| `/settings` | settings (general) |
| `/settings/<section>` | settings tab |

## Refs

`<board>` and `<card>` are **opaque refs** to the router; a single resolver
interprets them.

| Ref | Accepted formats (in order) |
|---|---|
| `<board>` | `slug` → `uuid` |
| `<card>` | `number` (per board) → `key` (`PROJ-42`) → `uuid` |

- Phase 2b: `board = uuid`, `card = key/uuid`.
- Phase 3: the builder prefers `slug`/`number`; the route shape does not change.

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
the last board (or `/boards`).

## Server fallback (SPA)

The server returns `index.html` only when **all** conditions hold:

- method is `GET` or `HEAD`;
- path does not start with `/api/` or `/plugins/`;
- path is not `/healthz` or `/readyz`;
- the last segment has no extension (`.js`, `.css`, `.png`, `.json`, …).

Otherwise it returns a real 404. The same rule applies to dev and production.

```
GET /boards/8509.../cards/LWTS-1   → 200 index.html
GET /settings/general              → 200 index.html
GET /api/nope                      → 404
GET /assets/missing.js             → 404
POST /boards                       → 405/404
```

## API

REST endpoints (`/api/v1/...`) **do not change** in this contract. UUID-based
endpoints remain valid; phase 3 adds `slug`/`number` resolution.

## Acceptance criteria (phase 2b)

1. Direct refresh on `/boards/<uuid>`, `/boards/<uuid>/cards/<KEY>` and
   `/settings/general` renders the correct screen.
2. The card "copy link" includes the board and works with dashed keys
   (`MY-BOA-1`).
3. `/boards` (all boards) survives refresh and the back button.
4. `POST /api/nope` → 404; `/assets/missing.js` → 404.
5. Old URLs (`?board=`, hash) do not break boot: they fall back to `/boards` or
   the last board, without a redirect and without a blank screen.
