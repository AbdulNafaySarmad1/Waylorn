import { expect, test } from '@playwright/test';
import { fixtureControl, resetFixtures, signIn } from './support';

test.describe('degraded connectivity and stale telemetry', () => {
  test.afterEach(async ({ page }) => resetFixtures(page));

  test('a severed live stream keeps last values but marks them Unknown', async ({ page }) => {
    await signIn(page, 'A. Keller', '/o/northwind/assets/ast_plc203/live');
    await expect(page.getByText('Live stream connected')).toBeVisible();
    await expect(page.getByRole('row', { name: /Scan cycle time/ })).toContainText('Current');

    await fixtureControl(page, { stream: 'severed' });
    await expect(page.getByText('Live stream disconnected')).toBeVisible();
    await expect(page.getByText(/last known/)).toBeVisible();
    await expect(page.getByRole('row', { name: /Scan cycle time/ })).toContainText('Unknown');
    await expect(page.getByRole('row', { name: /Scan cycle time/ })).toContainText('ms');

    await fixtureControl(page, { stream: 'normal' });
    await expect(page.getByText('Live stream connected')).toBeVisible({ timeout: 20_000 });
  });

  test('values go stale when updates stop on an open connection', async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page, 'A. Keller', '/o/northwind/assets/ast_plc203/live');
    await expect(page.getByText('Live stream connected')).toBeVisible();
    await fixtureControl(page, { stream: 'frozen' });
    // Scan cycle time is expected every 1 s: delayed after 2 s, stale after 5 s.
    await expect(page.getByRole('row', { name: /Scan cycle time/ })).toContainText('Stale', { timeout: 15_000 });
    await expect(page.getByText('Live stream connected')).toBeVisible();
  });

  test('a disconnected site shows unknown health and gaps instead of values', async ({ page }) => {
    await signIn(page, 'A. Keller', '/o/northwind/assets?site=site_qro');
    await expect(page.getByRole('table', { name: 'Assets' }).getByText('Unknown').first()).toBeVisible();
    await page.getByRole('table', { name: 'Assets' }).locator('tbody').getByRole('link').first().click();
    await page.getByRole('navigation', { name: 'Asset views' }).getByRole('link', { name: 'Telemetry' }).click();
    await expect(page.getByText(/Site disconnected/).first()).toBeVisible();
  });

  test('control-plane failure shows an error with a correlation ID, not empty data', async ({ page }) => {
    await signIn(page, 'A. Keller');
    await fixtureControl(page, { failApi: true });
    await page.goto('/o/northwind/incidents');
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toContainText('Control plane unavailable');
    await expect(alert).toContainText('Correlation ID');
    await expect(page.getByText('No incidents match')).toHaveCount(0);
  });

  test('slow responses still render correctly', async ({ page }) => {
    await signIn(page, 'A. Keller');
    await fixtureControl(page, { latencyMs: 1500 });
    await page.goto('/o/northwind/assets');
    await expect(page.getByRole('table', { name: 'Assets' })).toBeVisible();
  });
});
