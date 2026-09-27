import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './support';

const PAGES = [
  '/o/northwind/overview',
  '/o/northwind/sites',
  '/o/northwind/assets',
  '/o/northwind/assets/ast_press1991',
  '/o/northwind/assets/ast_press1991/live',
  '/o/northwind/assets/ast_plc203/telemetry',
  '/o/northwind/assets/ast_press1991/reliability',
  '/o/northwind/assets/ast_press1991/events',
  '/o/northwind/assets/ast_plc203/dependencies',
  '/o/northwind/topology?focus=ast_plc203&depth=2',
  '/o/northwind/incidents',
  '/o/northwind/infrastructure',
  '/o/northwind/reliability/reviews/rev_2026_q3',
  '/o/northwind/audit',
  '/o/northwind/ai',
  '/o/northwind/ai/governance',
  '/o/northwind/domains',
  '/o/northwind/policies',
];

test.describe('accessibility (WCAG 2.2 AA, axe)', () => {
  test('pages have no serious or critical violations in light and dark themes', async ({ page, context }) => {
    test.setTimeout(180_000);
    await signIn(page, 'K. Osei');
    for (const theme of ['light', 'dark', 'contrast']) {
      await context.addCookies([{ name: 'waylorn-theme', value: theme, url: 'http://localhost:3100' }]);
      for (const path of theme === 'light' ? PAGES : PAGES.slice(0, 6)) {
        await test.step(`${theme} ${path}`, async () => {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await expectAccessible(page);
        });
      }
    }
  });

  test('keyboard: skip link, command palette and shortcuts', async ({ page }) => {
    await signIn(page, 'A. Keller');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();

    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search areas and assets' });
    await expect(input).toBeFocused();
    await input.fill('MCH-P2');
    await expect(page.getByRole('option', { name: /MCH-P2-07/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/assets\/ast_press1991$/);

    await page.locator('body').click();
    await page.keyboard.press('g');
    await page.keyboard.press('u');
    await expect(page).toHaveURL(/\/o\/northwind\/audit$/);
  });

  test('topology is operable from the keyboard and has a table equivalent', async ({ page }) => {
    await signIn(page, 'A. Keller', '/o/northwind/topology');
    await page.goto('/o/northwind/topology?focus=ast_plc203&depth=1');
    await page.waitForLoadState('networkidle');
    const focusNode = page.locator('[data-node="ast_plc203"]');
    // Tab reaches the selected node (roving tabindex), then arrows move between nodes.
    await expect(focusNode).toHaveAttribute('tabindex', '0');
    await focusNode.focus();
    await expect(focusNode).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('complementary', { name: 'Selected asset' }).getByRole('heading')).not.toHaveText('PLC-203');
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('table', { name: 'Relations' })).toContainText('controls');
  });

  test('reduced motion and forced colours do not break the layout', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', forcedColors: 'active', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signIn(page, 'A. Keller');
    await expect(page.getByRole('table', { name: 'Site status' })).toBeVisible();
    await context.close();
  });

  test('narrow viewport exposes navigation through a menu', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await signIn(page, 'A. Keller');
    await page.getByText('Menu').click();
    await page.getByRole('navigation', { name: 'Primary (compact)' }).getByRole('link', { name: 'Incidents' }).click();
    await expect(page).toHaveURL(/incidents$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
