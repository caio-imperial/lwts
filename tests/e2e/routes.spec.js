// End-to-end routing checks for the SPA (Phase 2b contract).
//
// Run: npm run test:e2e
// Target: disposable server on http://localhost:8044 (tests/start-test-server.sh)

const { test, expect } = require('@playwright/test');
const {
  login,
  apiLogin,
  listBoards,
  listCards,
  createCard,
  ensureBoard,
  watchConsole,
  openBoardPicker,
  pickBoard,
} = require('./helpers');

let token;
let secondBoard;
let dashedBoard;
let edgeBoard;
let edgeCard;
let dashedCard;

test.beforeAll(async ({ request }) => {
  token = await apiLogin(request);

  secondBoard = await ensureBoard(request, token, 'Second Board', 'SEC');
  dashedBoard = await ensureBoard(request, token, 'Dashed Keys', 'MY-BOA');

  const boards = await listBoards(request, token);
  edgeBoard = boards.find((b) => b.name === 'Edge Cases') || boards[0];

  const edgeCards = await listCards(request, token, edgeBoard.id);
  expect(edgeCards.length).toBeGreaterThan(0);
  edgeCard = edgeCards[0];

  let dashedCards = await listCards(request, token, dashedBoard.id);
  while (dashedCards.length < 2) {
    await createCard(request, token, dashedBoard.id, `Dashed card ${dashedCards.length + 1}`);
    dashedCards = await listCards(request, token, dashedBoard.id);
  }
  dashedCard = dashedCards[dashedCards.length - 1];
});

test('boot: / redirects to /boards/<uuid> without a query', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toContain('?board=');
  await expect(page.locator('#board-picker-label')).toBeVisible();
  expect(problems).toEqual([]);
});

test('board switching navigates and history works', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await pickBoard(page, 'Second Board');
  await expect(page).toHaveURL(new RegExp(`/boards/${secondBoard.id}$`));

  await pickBoard(page, 'Edge Cases');
  await expect(page).toHaveURL(new RegExp(`/boards/${edgeBoard.id}$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/boards/${secondBoard.id}$`));

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/boards/${edgeBoard.id}$`));
  expect(problems).toEqual([]);
});

test('All Boards at /boards survives a refresh', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await pickBoard(page, 'All Boards');
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.locator('#board-picker-label')).toHaveText('All Boards');

  await page.reload();
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.locator('#board-picker-label')).toHaveText('All Boards');
  expect(problems).toEqual([]);
});

test('card deep link opens and survives a refresh', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  const cardUrl = `/boards/${edgeBoard.id}/cards/${encodeURIComponent(edgeCard.key)}`;
  await page.goto(cardUrl);

  const modal = page.locator('#detail-modal');
  await expect(modal).toHaveClass(/active/);
  await expect(page.locator('#detail-key-text')).toHaveText(edgeCard.key);

  await page.reload();
  await expect(modal).toHaveClass(/active/);
  await expect(page.locator('#detail-key-text')).toHaveText(edgeCard.key);

  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/active/);
  await expect(page).toHaveURL(new RegExp(`/boards/${edgeBoard.id}$`));

  // Closing uses replaceState: going back must not reopen the card.
  await page.goBack();
  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test('deep link with a dashed key (MY-BOA-N)', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  expect(dashedCard.key).toMatch(/^MY-BOA-\d+$/);
  await page.goto(`/boards/${dashedBoard.id}/cards/${encodeURIComponent(dashedCard.key)}`);

  await expect(page.locator('#detail-modal')).toHaveClass(/active/);
  await expect(page.locator('#detail-key-text')).toHaveText(dashedCard.key);
  expect(problems).toEqual([]);
});

test('settings: open by URL, switch tab, refresh and close', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await page.goto('/settings/appearance');
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.locator('#settings-page')).toHaveClass(/active/);
  await expect(page.locator('#settings-appearance')).toHaveClass(/active/);

  await page.locator('#settings-nav .settings-nav-item', { hasText: 'Boards' }).first().click();
  await expect(page).toHaveURL(/\/settings\/boards$/);
  await expect(page.locator('#settings-boards')).toHaveClass(/active/);

  await page.reload();
  await expect(page).toHaveURL(/\/settings\/boards$/);
  await expect(page.locator('#settings-boards')).toHaveClass(/active/);

  await page.locator('.header-title').click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.locator('#settings-page')).not.toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test('unknown route falls back to /boards', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await page.goto('/nao-existe');
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.locator('#board-picker-label')).toBeVisible();
  expect(problems).toEqual([]);
});

test('old URLs (?board= and hash) are ignored without breaking', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await page.goto(`/?board=${edgeBoard.id}`);
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toContain('?board=');

  await page.goto('/#settings/boards');
  await page.reload();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
  await expect(page.locator('#settings-page')).not.toHaveClass(/active/);

  await page.goto(`/#${encodeURIComponent(edgeCard.key)}`);
  await page.reload();
  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  expect(problems).toEqual([]);
});

test('card copy link includes the board and key', async ({ page, context }) => {
  const problems = watchConsole(page);
  await login(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto(`/boards/${edgeBoard.id}/cards/${encodeURIComponent(edgeCard.key)}`);
  await expect(page.locator('#detail-modal')).toHaveClass(/active/);

  await page.locator('#detail-key').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toContain(`/boards/${edgeBoard.id}/cards/${encodeURIComponent(edgeCard.key)}`);
  expect(problems).toEqual([]);
});

test('regression: cards render and detail opens/closes', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  const cards = page.locator('#board .card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  await cards.first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  expect(problems).toEqual([]);
});
