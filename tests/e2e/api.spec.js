// API-level checks for card key / ref resolution.

const { test, expect } = require('@playwright/test');
const {
  apiLogin,
  authHeaders,
  listBoards,
  listCards,
  createCard,
  ensureBoard,
} = require('./helpers');

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
