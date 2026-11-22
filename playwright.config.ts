import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The SPA lives in `dist/app/index.html` and `serve` resolves `-c` against the served
    // directory, hence `../e2e/serve.json`; without the rewrite every `/app/*` route 404s.
    command: 'npm run build:all && npx serve dist -c ../e2e/serve.json -l 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // `build:all` (tsc + vite + astro) takes ~4-5 min on slower machines; the old 180s ceiling made
    // every run fail before the first test.
    timeout: 600_000,
    env: {
      ...process.env,
      VITE_USE_V6_WIZARD: process.env.VITE_USE_V6_WIZARD ?? 'true',
      PUBLIC_APP_URL: 'http://127.0.0.1:4173',
    },
  },
});
