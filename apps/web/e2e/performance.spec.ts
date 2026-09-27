import { expect, test } from '@playwright/test';
import { signIn } from './support';

/** Coarse budgets on the production build; they catch regressions, not micro-changes. */
test.describe('performance budgets', () => {
  test('asset inventory (2,300+ assets) renders one server-filtered page quickly', async ({ page }) => {
    await signIn(page, 'A. Keller');
    const start = Date.now();
    await page.goto('/o/northwind/assets?health=warning');
    await expect(page.getByRole('table', { name: 'Assets' })).toBeVisible();
    expect(Date.now() - start).toBeLessThan(3000);
    expect(await page.getByRole('table', { name: 'Assets' }).locator('tbody tr').count()).toBeLessThanOrEqual(50);
  });

  test('event log stays virtualised after loading many pages', async ({ page }) => {
    await signIn(page, 'A. Keller', '/o/northwind/assets/ast_plc203/events');
    const viewport = page.getByRole('rowgroup', { name: /Event rows/ });
    await expect(page.getByText(/loaded of about/)).toBeVisible();
    for (let i = 0; i < 8; i += 1) {
      await viewport.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(250);
    }
    await expect(page.getByText(/^[4-9]\d\d loaded|^1,\d{3} loaded/)).toBeVisible();
    // Only the visible window plus overscan is in the DOM.
    expect(await viewport.getByRole('row').count()).toBeLessThan(60);
  });

  test('topology neighbourhood lays out and renders within budget', async ({ page }) => {
    await signIn(page, 'A. Keller');
    const start = Date.now();
    await page.goto('/o/northwind/topology?focus=ast_hist&depth=2');
    await expect(page.locator('[data-node="ast_hist"]')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(3000);
    expect(await page.locator('[data-node]').count()).toBeLessThanOrEqual(300);
  });
});
