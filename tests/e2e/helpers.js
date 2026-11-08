// Shared helpers for the Playwright suite.

const { expect } = require('@playwright/test');

const TEST_USER = {
  email: 'testowner@test.dev',
  password: 'testpass123',
};

// Logs in through the real UI and dismisses the welcome modal when present.
async function login(page) {
  await page.goto('/');
  await page.locator('#login-form').waitFor({ state: 'visible' });
  await page.fill('#login-email', TEST_USER.email);
  await page.fill('#login-password', TEST_USER.password);
  await page.click('#login-form button[type="submit"]');

  await expect(page).toHaveURL(/\/boards(\/[^/?#]+)?$/);
  await page.locator('#board-picker-label').waitFor({ state: 'visible' });
  await dismissWelcome(page);
}

async function dismissWelcome(page) {
  const welcome = page.locator('#welcome-modal');
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.locator('.lwts-modal-btn-primary').click();
    await expect(welcome).not.toHaveClass(/active/);
  }
}

async function apiLogin(request) {
  const res = await request.post('/api/auth/login', { data: TEST_USER });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function listBoards(request, token) {
  const res = await request.get('/api/v1/boards', { headers: authHeaders(token) });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function listCards(request, token, boardId) {
  const res = await request.get(`/api/v1/boards/${boardId}/cards`, { headers: authHeaders(token) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  // The endpoint groups cards by column: { "<column>": [cards...] }.
  if (Array.isArray(data)) return data;
  return Object.values(data).flat();
}

async function createBoard(request, token, name, projectKey) {
  const res = await request.post('/api/v1/boards', {
    headers: authHeaders(token),
    data: { name, project_key: projectKey },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function createCard(request, token, boardId, title) {
  const res = await request.post(`/api/v1/boards/${boardId}/cards`, {
    headers: authHeaders(token),
    data: { title },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Returns an existing board by name or creates it.
async function ensureBoard(request, token, name, projectKey) {
  const boards = await listBoards(request, token);
  const found = boards.find((b) => b.name === name);
  if (found) return found;
  return createBoard(request, token, name, projectKey);
}

// Collects uncaught page errors and console errors so a test can assert a
// clean console. Ignore noise that is not produced by the app itself.
function watchConsole(page) {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon')) return;
    problems.push(`console: ${text}`);
  });
  return problems;
}

async function openBoardPicker(page) {
  const menu = page.locator('#board-menu');
  if (!(await menu.isVisible().catch(() => false))) {
    await page.locator('#board-picker').click();
  }
  await expect(menu).toBeVisible();
  return menu;
}

async function pickBoard(page, name) {
  const menu = await openBoardPicker(page);
  await menu.locator('.header-board-option', { hasText: name }).first().click();
  await expect(page.locator('#board-menu')).toBeHidden();
}

module.exports = {
  TEST_USER,
  login,
  dismissWelcome,
  apiLogin,
  authHeaders,
  listBoards,
  listCards,
  createBoard,
  createCard,
  ensureBoard,
  watchConsole,
  openBoardPicker,
  pickBoard,
};
