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
  await page.goto('http://localhost:3000/o/waylorn-local/assets');
  const observedAsset = page.locator('tr', { hasText: 'Modbus simulator observation' }).first();
  await observedAsset.locator('a').first().click();
  await page.waitForURL(/\/o\/waylorn-local\/assets\/[0-9a-f-]+$/);
  const observedUrl = page.url();
  await page.goto(`${observedUrl}/live`);
  await page.getByText('modbus.holding.10').first().waitFor();
  await page.getByText('Live stream connected').first().waitFor({ timeout: 15_000 });
  await page.goto(`${observedUrl}/telemetry`);
  if ((await page.locator('#signal').inputValue()) !== 'modbus.holding.10') throw new Error('Telemetry signal was not loaded.');
  await page.getByText(/Server-aggregated/).first().waitFor();
  await page.goto('http://localhost:3000/o/waylorn-local/incidents');
  const incident = page.locator('tr', { hasText: 'Local smoke incident' }).first();
  await incident.getByText('Local smoke incident').waitFor();
  const assetHref = await incident.locator('a[href*="/assets/"]').first().getAttribute('href');
  if (!assetHref) throw new Error('Incident primary asset link was not rendered.');
  await page.goto(`http://localhost:3000${assetHref}/maintenance`);
  await page.getByText('Inspect local simulator asset').first().waitFor();
  await page.goto(`http://localhost:3000${assetHref}/topology`);
  await page.getByText('Direct relationships').first().waitFor();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByText('Depends on').first().waitFor();
  process.stdout.write('Browser integration passed: Keycloak login, inventory, site hierarchy, telemetry, incidents, maintenance and topology.\n');
} finally {
  await browser.close();
}
