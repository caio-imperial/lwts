// API-level checks for card key / ref resolution.

const { test, expect } = require('@playwright/test');
const {
  apiLogin,
  authHeaders,
  listBoards,
  listCards,
  createBoard,
  createCard,
  ensureBoard,
} = require('./helpers');

async function fetchWorkspaces(request, token) {
  const res = await request.get('/api/v1/workspaces', { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  const workspaces = await res.json();
  expect(Array.isArray(workspaces)).toBe(true);
  expect(workspaces.length).toBeGreaterThan(0);
  return workspaces;
}

// The default workspace is the oldest one and owns boards created through the
// legacy /api/v1/boards route.
async function defaultWorkspace(request, token) {
  const workspaces = await fetchWorkspaces(request, token);
  return workspaces[0];
}

let token;
let dashedBoard;
let dashedCard;

test.beforeAll(async ({ request }) => {
  token = await apiLogin(request);
  dashedBoard = await ensureBoard(request, token, 'API Dashed Keys', 'API-BOA');

  let cards = await listCards(request, token, dashedBoard.id);
  if (cards.length === 0) {
    await createCard(request, token, dashedBoard.id, 'API dashed card');
    cards = await listCards(request, token, dashedBoard.id);
  }
  dashedCard = cards[cards.length - 1];
});

test('dashed card key resolves through /api/v1/cards/{key}', async ({ request }) => {
  expect(dashedCard.key).toMatch(/^API-BOA-\d+$/);

  const res = await request.get(`/api/v1/cards/${encodeURIComponent(dashedCard.key)}`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.card.key).toBe(dashedCard.key);
  expect(body.card.id).toBe(dashedCard.id);
});

test('non-UUID board ref returns 404 instead of an empty payload', async ({ request }) => {
  const res = await request.get('/api/v1/boards/not-a-uuid/cards', {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(404);
});

test('board listing still works after the ref guards', async ({ request }) => {
  const boards = await listBoards(request, token);
  expect(boards.length).toBeGreaterThan(0);
  expect(boards.some((b) => b.id === dashedBoard.id)).toBe(true);
});

test('card numbers are per board and keys are board-scoped', async ({ request }) => {
  const stamp = String(Date.now()).slice(-6);
  const prefix = 'NUM' + stamp;
  const board = await ensureBoard(request, token, 'Numbers ' + stamp, prefix);

  const first = await createCard(request, token, board.id, 'First');
  const second = await createCard(request, token, board.id, 'Second');

  expect(first.number).toBe(1);
  expect(second.number).toBe(2);
  expect(first.key).toBe(`${prefix}-1`);
  expect(second.key).toBe(`${prefix}-2`);
});

test('the same key in two boards is ambiguous (409)', async ({ request }) => {
  const stamp = String(Date.now()).slice(-6);
  const prefix = 'AMB' + stamp;
  const boardA = await ensureBoard(request, token, 'Ambiguous A ' + stamp, prefix);
  const boardB = await ensureBoard(request, token, 'Ambiguous B ' + stamp, prefix);

  const cardA = await createCard(request, token, boardA.id, 'A1');
  const cardB = await createCard(request, token, boardB.id, 'B1');
  expect(cardA.key).toBe(`${prefix}-1`);
  expect(cardB.key).toBe(`${prefix}-1`);

  const res = await request.get(`/api/v1/cards/${encodeURIComponent(cardA.key)}`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error).toBe('ambiguous_key');
});

test('GET /api/v1/workspaces exposes the default workspace', async ({ request }) => {
  const res = await request.get('/api/v1/workspaces', { headers: authHeaders(token) });
  expect(res.status()).toBe(200);

  const workspaces = await res.json();
  expect(Array.isArray(workspaces)).toBe(true);
  expect(workspaces.length).toBeGreaterThan(0);
  expect(workspaces[0].slug).toBeTruthy();
});

test('workspace-scoped routes resolve board by slug and card by number', async ({ request }) => {
  const stamp = String(Date.now()).slice(-6);
  const prefix = 'WS' + stamp;

  const board = await createBoard(request, token, 'Workspace Scoped ' + stamp, prefix);
  expect(board.slug).toBeTruthy();

  const workspaces = await fetchWorkspaces(request, token);
  const workspace = workspaces.find((w) => w.id === board.workspace_id);
  expect(workspace, 'board workspace must be listed').toBeTruthy();

  const boardBase = `/api/v1/workspaces/${encodeURIComponent(workspace.slug)}/boards`;

  let res = await request.get(boardBase, { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  const boards = await res.json();
  expect(boards.some((b) => b.id === board.id && b.slug === board.slug)).toBe(true);

  res = await request.get(`${boardBase}/${encodeURIComponent(board.slug)}`, {
    headers: authHeaders(token),
  });
  expect(res.status()).toBe(200);
  const boardBody = await res.json();
  expect(boardBody.board.id).toBe(board.id);

  const card = await createCard(request, token, board.id, 'Workspace scoped card');
  expect(card.number).toBe(1);
  expect(card.key).toBe(`${prefix}-1`);

  const cardsBase = `${boardBase}/${encodeURIComponent(board.slug)}/cards`;
  res = await request.get(cardsBase, { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  const grouped = await res.json();
  const cards = Object.values(grouped).flat();
  expect(cards.some((c) => c.id === card.id)).toBe(true);

  res = await request.get(`${cardsBase}/${card.number}`, { headers: authHeaders(token) });
  expect(res.status()).toBe(200);
  const cardBody = await res.json();
  expect(cardBody.card.id).toBe(card.id);
  expect(cardBody.card.key).toBe(card.key);
});

test('workspace-scoped routes return 404 for unknown refs', async ({ request }) => {
  const stamp = String(Date.now()).slice(-6);
  const workspace = await defaultWorkspace(request, token);
  const board = await createBoard(request, token, 'Workspace Missing ' + stamp, 'WSM' + stamp);
  const wsBase = `/api/v1/workspaces/${encodeURIComponent(workspace.slug)}/boards`;

  const cases = [
    `/api/v1/workspaces/missing-${stamp}/boards`,
    `${wsBase}/missing-${stamp}`,
    `${wsBase}/${encodeURIComponent(board.slug)}/cards/999999`,
  ];
  for (const target of cases) {
    const res = await request.get(target, { headers: authHeaders(token) });
    expect(res.status(), target).toBe(404);
  }
});
