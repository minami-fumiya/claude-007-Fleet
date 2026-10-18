import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

/**
 * Browser screen tests (#101): every menu screen in portrait and landscape, plus a sortie, against the Vite dev
 * server (dev builds expose `window.game`). Run with `npm run test:e2e`.
 */
// Containers with a preinstalled Chromium (e.g. Claude Code on the web) use it instead of downloading one.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'portrait',
      use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
      metadata: { layout: 'portrait' },
    },
    {
      name: 'landscape',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
      metadata: { layout: 'landscape' },
    },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
