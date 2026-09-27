import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E, accessibility, visual-regression, degraded-connectivity and performance tests run
 * against the production build pointed at tools/dev-fixtures (ADR 0012). Tests share one
 * fixture server whose failure-injection state is global, so they run serially.
 */
const WEB_PORT = 3100;
const FIXTURE_PORT = 4011;
const WEB = `http://localhost:${WEB_PORT}`;
const FIXTURES = `http://localhost:${FIXTURE_PORT}`;

// Use a locally provisioned Chromium when the pinned Playwright browser is not installed.
const localChromium = process.env['PW_CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    timezoneId: 'UTC',
    locale: 'en-GB',
    ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'node ../../tools/dev-fixtures/src/server.ts',
      url: `${FIXTURES}/__fixture/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        FIXTURE_PORT: String(FIXTURE_PORT),
        FIXTURE_WEB_ORIGIN: WEB,
        FIXTURE_CLOCK: '2026-09-27T12:00:00Z',
      },
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `${WEB}/signed-out`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'production',
        WAYLORN_PUBLIC_ORIGIN: WEB,
        WAYLORN_API_BASE_URL: FIXTURES,
        WAYLORN_OIDC_ISSUER: `${FIXTURES}/oidc`,
        WAYLORN_OIDC_CLIENT_ID: 'waylorn-web',
        WAYLORN_OIDC_CLIENT_SECRET: 'dev-only-secret',
        WAYLORN_ALLOW_SINGLE_INSTANCE_SESSIONS: 'true',
        WAYLORN_HSTS_MAX_AGE: '0',
      },
    },
  ],
});
