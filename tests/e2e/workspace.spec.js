// Workspace switcher (phase 3d) — header picker, workspace creation and
// workspace-scoped board creation.
//
// Run: npm run test:e2e
// Target: disposable server on http://localhost:8044 (tests/start-test-server.sh)

const { test, expect } = require('@playwright/test');
const {
  login,
  apiLogin,
  listWorkspaces,
  watchConsole,
  openBoardPicker,
  openWorkspacePicker,
  pickWorkspace,
} = require('./helpers');

const pathOf = (page) => new URL(page.url()).pathname;
const uniqueStamp = () => String(Date.now()).slice(-7);
const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let token;
let defaultWorkspace;

test.beforeAll(async ({ request }) => {
  token = await apiLogin(request);
  const workspaces = await listWorkspaces(request, token);
  expect(workspaces.length).toBeGreaterThan(0);
  defaultWorkspace = workspaces[0];
});

test('boot shows the default workspace in the picker', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await expect(page.locator('#workspace-picker')).toBeVisible();
  await expect(page.locator('#workspace-picker-label')).toHaveText(defaultWorkspace.name);
  // The workspace name is the navbar brand now: brand face, no static LWTS title.
  await expect(page.locator('#workspace-picker-label')).toHaveCSS('font-family', /Audiowide/);
  await expect(page.locator('.header-title')).toHaveCount(0);

  const menu = await openWorkspacePicker(page);
  await expect(menu.locator('.header-board-option', { hasText: defaultWorkspace.name }).first())
    .toHaveClass(/active/);
  await expect(menu.locator('.header-board-option', { hasText: '+ New workspace' })).toBeVisible();

  expect(problems).toEqual([]);
});

test('create a workspace, add a board, then switch back', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  const stamp = uniqueStamp();
  const workspaceName = `WS UI ${stamp}`;
  const boardName = `UI Board ${stamp}`;

  // ── Create the workspace through the picker modal ──
  await openWorkspacePicker(page);
  await page.locator('#workspace-menu .header-board-option', { hasText: '+ New workspace' }).click();

  const modal = page.locator('#workspace-modal');
  await expect(modal).toHaveClass(/active/);
  const createBtn = page.locator('#create-workspace-submit');
  await expect(createBtn).toBeDisabled();
  await page.fill('#new-workspace-name', workspaceName);
  await expect(createBtn).toBeEnabled();
  await createBtn.click();
  await expect(modal).not.toHaveClass(/active/);

  // Switches to the new workspace root: /<slug> with no boards.
  await expect.poll(() => pathOf(page)).toMatch(/^\/[a-z0-9-]+$/);
  const workspaceSlug = pathOf(page).slice(1);
  expect(workspaceSlug).not.toBe(defaultWorkspace.slug);

  await expect(page.locator('#workspace-picker-label')).toHaveText(workspaceName);
  await expect(page.locator('#board-picker-label')).toHaveText('All Boards');
  await expect(page.locator('#list-view .list-row')).toHaveCount(0);

  const emptyBoardMenu = await openBoardPicker(page);
  await expect(emptyBoardMenu.locator('.header-board-option', { hasText: '+ New board' })).toBeVisible();
  expect(await emptyBoardMenu.locator('.header-board-option', { hasText: 'Edge Cases' }).count()).toBe(0);
  await page.locator('#board-picker').click();
  await expect(page.locator('#board-menu')).toBeHidden();

  // ── Create a board in this workspace through the UI ──
  await page.locator('#board-picker').click();
  await page.locator('#board-menu .header-board-option', { hasText: '+ New board' }).click();
  await expect(page.locator('#new-board-modal')).toHaveClass(/active/);
  await page.fill('#new-board-name', boardName);
  await page.fill('#new-board-key', 'UIB');
  await page.locator('#new-board-modal .lwts-modal-btn-primary').click();
  await expect(page.locator('#new-board-modal')).not.toHaveClass(/active/);

  await expect.poll(() => pathOf(page))
    .toMatch(new RegExp(`^/${escapeRe(workspaceSlug)}/[a-z0-9-]+$`));
  const boardSlug = pathOf(page).split('/')[2];
  await expect(page.locator('#board-picker-label')).toHaveText(boardName);
  await expect(page.locator('#workspace-picker-label')).toHaveText(workspaceName);

  // ── The chosen workspace is remembered across a plain root visit ──
  await page.goto('/');
  await expect.poll(() => pathOf(page)).toBe(`/${workspaceSlug}/${boardSlug}`);

  // ── Switch back to the default workspace ──
  await pickWorkspace(page, defaultWorkspace.name);
  await expect.poll(() => pathOf(page)).toBe(`/${defaultWorkspace.slug}`);
  await expect(page.locator('#workspace-picker-label')).toHaveText(defaultWorkspace.name);

  const defaultBoardMenu = await openBoardPicker(page);
  await expect(defaultBoardMenu.locator('.header-board-option', { hasText: 'Edge Cases' })).toBeVisible();
  expect(await defaultBoardMenu.locator('.header-board-option', { hasText: boardName }).count()).toBe(0);

  expect(problems).toEqual([]);
});

test('rename the current workspace updates the picker and the slug', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);
  const stamp = uniqueStamp();

  // Create a workspace to rename.
  await openWorkspacePicker(page);
  await page.locator('#workspace-menu .header-board-option', { hasText: '+ New workspace' }).click();
  const originalName = `Rename ${stamp}`;
  await page.fill('#new-workspace-name', originalName);
  await page.click('#create-workspace-submit');
  await expect(page.locator('#workspace-picker-label')).toHaveText(originalName);

  const oldSlug = `rename-${stamp}`;
  const newName = `Renamed ${stamp}`;
  const newSlug = `renamed-${stamp}`;
  await expect.poll(() => pathOf(page)).toBe(`/${oldSlug}`);

  // Rename through Settings -> General.
  await page.goto('/settings');
  await expect(page.locator('#settings-page')).toHaveClass(/active/);
  const input = page.locator('[data-setting="general.workspace_name"]');
  await expect(input).toHaveValue(originalName);

  const patch = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/api/v1/workspaces/'),
  );
  await input.fill(newName);
  await input.press('Tab');
  expect((await patch).status()).toBe(200);

  await expect(page.locator('#workspace-picker-label')).toHaveText(newName);

  const origin = new URL(page.url()).origin;
  const token = await page.evaluate(() => localStorage.getItem('lwts_access_token'));
  const headers = { Authorization: 'Bearer ' + token };
  expect((await page.request.get(`${origin}/api/v1/workspaces/${newSlug}/boards`, { headers })).status()).toBe(200);
  expect((await page.request.get(`${origin}/api/v1/workspaces/${oldSlug}/boards`, { headers })).status()).toBe(404);

  // Closing settings returns to the renamed workspace root.
  await page.locator('#settings-back').click();
  await expect.poll(() => pathOf(page)).toBe(`/${newSlug}`);
  expect(problems).toEqual([]);
});
