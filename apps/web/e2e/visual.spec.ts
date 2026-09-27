import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

/**
 * Visual regression. Time-dependent text (clocks, ages, timestamps) is masked; the fixture
 * dataset is generated from a fixed FIXTURE_CLOCK. Baselines are platform-specific and
 * generated on the CI image (`pnpm e2e --update-snapshots`).
 */
function masks(page: Page) {
  return [page.locator('time'), page.getByTestId('reachability'), page.locator('[aria-label="Coordinated Universal Time"]'), page.locator('svg[role="img"]')];
}

test.describe('visual regression', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`overview and asset overview (${theme})`, async ({ page, context }) => {
      await context.addCookies([{ name: 'waylorn-theme', value: theme, url: 'http://localhost:3100' }]);
      await signIn(page, 'A. Keller');
      await expect(page).toHaveScreenshot(`overview-${theme}.png`, { fullPage: true, mask: masks(page) });
      await page.goto('/o/northwind/assets/ast_press1991');
      await expect(page).toHaveScreenshot(`asset-legacy-press-${theme}.png`, { fullPage: true, mask: masks(page) });
    });
  }

  test('command review dialog', async ({ page }) => {
    await signIn(page, 'K. Osei', '/o/northwind/assets/ast_plc203');
    await page.getByRole('button', { name: 'Request action…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Change OPC UA publishing interval/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('spinbutton').fill('500');
    await dialog.getByRole('textbox', { name: /Reason/ }).fill('Reduce load during diagnostics');
    await dialog.getByRole('textbox', { name: /Change ticket/ }).fill('CHG-20931');
    await dialog.getByRole('button', { name: 'Check policy' }).click();
    await expect(dialog.getByRole('table', { name: 'Request summary' })).toBeVisible();
    await expect(dialog).toHaveScreenshot('command-review-amber.png', {
      mask: [dialog.getByRole('row', { name: /VALID UNTIL/ }), dialog.getByRole('row', { name: /TARGET/ }).locator('.mono')],
    });
  });
});
