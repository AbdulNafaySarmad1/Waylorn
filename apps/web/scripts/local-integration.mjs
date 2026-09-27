import { chromium } from '@playwright/test';

const password = process.env.WAYLORN_TEST_ADMIN_PASSWORD;
if (!password) throw new Error('Set WAYLORN_TEST_ADMIN_PASSWORD from the ignored deploy/dev/.env file.');

const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAYLORN_BROWSER_EXECUTABLE ? { executablePath: process.env.WAYLORN_BROWSER_EXECUTABLE } : {}),
});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/o/waylorn-local/assets', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"]').fill('waylorn-admin');
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[type="submit"], button[type="submit"]').first().click();
  await page.waitForURL('**/o/waylorn-local/assets', { timeout: 30_000 });
  await page.getByText(/smoke-/).first().waitFor({ timeout: 30_000 });
  if (await page.getByText(/fixture data/i).count()) throw new Error('Web page still reports fixture data.');
  await page.locator('tr', { hasText: /smoke-/ }).first().locator('a').first().click();
  await page.waitForURL(/\/o\/waylorn-local\/assets\/[0-9a-f-]+$/);
  await page.getByText('Unverified').first().waitFor();
  await page.goto('http://localhost:3000/o/waylorn-local/sites');
  await page.getByText('Local Test Plant').first().waitFor();
  await page.locator('summary', { hasText: 'Local Test Plant' }).click();
  await page.getByText('Test Bench').first().waitFor();
  process.stdout.write('Browser integration passed: Keycloak login, API session, PostgreSQL-backed assets and site hierarchy.\n');
} finally {
  await browser.close();
}
