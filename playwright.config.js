// Playwright config for the LWTS end-to-end suite.
//
// The test server is the disposable one from tests/start-test-server.sh
// (port 8044, SQLite /tmp/lwts-test-ui.db, seeded with Edge Cases data).
// It uses the locally installed Google Chrome (channel "chrome") so no
// browser download is required. On machines without Chrome, run
// `npx playwright install chromium` and change the channel to chromium.

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8044',
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: !process.env.PW_HEADED,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: './tests/start-test-server.sh --foreground',
    url: 'http://localhost:8044/healthz',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
