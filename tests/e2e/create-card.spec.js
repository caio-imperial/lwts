// User-facing card creation flows.

const { test, expect } = require('@playwright/test');
const { login, pickBoard, watchConsole, openCreateCard } = require('./helpers');

test('create card from All Boards posts to a concrete board and shows it', async ({ page }) => {
  const problems = watchConsole(page);
  const posts = [];
  page.on('response', (res) => {
    if (res.request().method() === 'POST' && res.url().includes('/cards')) {
      posts.push({ url: res.url(), status: res.status() });
    }
  });

  await login(page);
  await pickBoard(page, 'All Boards');
  await expect(page).toHaveURL(/\/boards$/);

  const title = 'All boards card ' + Date.now();
  await openCreateCard(page);
  await page.fill('#detail-title', title);
  await page.click('#create-submit-btn');

  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  await expect.poll(() => posts.length).toBeGreaterThan(0);

  for (const post of posts) {
    expect(post.url).not.toContain('/boards/all/cards');
    expect(post.status).toBe(201);
  }

  // The aggregated view refreshes after a successful create.
  await expect(page.locator('#board')).toContainText(title, { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('create card on a concrete board shows it immediately', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  const title = 'Board card ' + Date.now();
  await openCreateCard(page);
  await page.fill('#detail-title', title);
  await page.click('#create-submit-btn');

  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#board')).toContainText(title);
  expect(problems).toEqual([]);
});

test('create card in list view updates the list immediately', async ({ page }) => {
  const problems = watchConsole(page);
  await login(page);

  await page.click('.view-switcher-btn[data-view="list"]');
  await expect(page.locator('#list-view')).toBeVisible();
  const rowsBefore = await page.locator('#list-view .list-row').count();

  const title = 'List view card ' + Date.now();
  await openCreateCard(page);
  await page.fill('#detail-title', title);
  await page.click('#create-submit-btn');

  await expect(page.locator('#detail-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#list-view')).toContainText(title);
  expect(await page.locator('#list-view .list-row').count()).toBe(rowsBefore + 1);
  expect(problems).toEqual([]);
});
