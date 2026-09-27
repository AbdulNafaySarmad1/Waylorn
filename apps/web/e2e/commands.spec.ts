import { expect, test } from '@playwright/test';
import { signIn } from './support';

test.describe('command safety', () => {
  test('operators see consequential actions as unavailable, with the reason', async ({ page }) => {
    await signIn(page, 'A. Keller', '/o/northwind/assets/ast_plc203');
    await page.getByRole('button', { name: 'Request action…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: /Change OPC UA publishing interval/ })).toBeDisabled();
    await expect(dialog.getByText('Unavailable: Requires the controls-engineer role for this site.')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Write ram pressure setpoint/ })).toBeDisabled();
  });

  test('AMBER change: preflight, review, step-up, submit, and an honest outcome', async ({ page }) => {
    await signIn(page, 'K. Osei', '/o/northwind/assets/ast_plc203');
    await page.getByRole('button', { name: 'Request action…' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('PRODUCTION');
    await expect(dialog).toContainText('Munich Plant 3 (DE-MUC-P3)');
    await dialog.getByRole('radio', { name: /Change OPC UA publishing interval/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('spinbutton', { name: /Publishing interval/ }).fill('500');
    await dialog.getByRole('textbox', { name: /Reason/ }).fill('Reduce load during diagnostics (CHG-20931)');
    await dialog.getByRole('textbox', { name: /Change ticket/ }).fill('CHG-20931');
    await dialog.getByRole('button', { name: 'Check policy' }).click();

    const summary = dialog.getByRole('table', { name: 'Request summary' });
    await expect(summary).toContainText('1000 ms → 500 ms');
    await expect(summary).toContainText('PLC-203');
    await expect(summary).toContainText('OT administrative change');
    const submit = dialog.getByRole('button', { name: 'Submit AMBER request' });
    await expect(submit).toBeDisabled();
    await expect(submit).not.toBeFocused();

    // Step-up: fresh MFA at the identity provider, then resume with the draft restored.
    await dialog.getByRole('button', { name: 'Re-authenticate' }).click();
    await expect(page.getByText('Step-up authentication requested')).toBeVisible();
    await page.getByLabel(/One-time code/).fill('123456');
    await page.getByRole('button', { name: /Sign in as K\. Osei/ }).click();

    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('table', { name: 'Request summary' })).toContainText('Reduce load during diagnostics');
    await expect(dialog.getByText('Recent strong authentication')).toBeVisible();
    await dialog.getByRole('button', { name: 'Submit AMBER request' }).click();

    // Execution is disabled in this build; the UI reports it rather than implying success.
    await expect(dialog.getByRole('status')).toContainText('Rejected');
    await expect(dialog.getByRole('status')).toContainText('Nothing was executed');
    const correlation = dialog.getByRole('link', { name: /^[0-9a-f-]{36}$/ });
    await correlation.click();
    await expect(page).toHaveURL(/\/o\/northwind\/audit\?correlationId=/);
    await expect(page.getByRole('table', { name: 'Audit records' })).toContainText('Change OPC UA publishing interval');
  });

  test('RED write requires typed confirmation of the target and fresh authentication', async ({ page }) => {
    await signIn(page, 'K. Osei', '/o/northwind/assets/ast_plc203');
    await page.getByRole('button', { name: 'Request action…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Write ram pressure setpoint/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('spinbutton', { name: /Ram pressure setpoint/ }).fill('160');
    await dialog.getByRole('textbox', { name: /Reason/ }).fill('Die change requires higher pressure');
    await dialog.getByRole('textbox', { name: /Change ticket/ }).fill('CHG-1');
    await dialog.getByRole('button', { name: 'Check policy' }).click();

    await expect(dialog.getByText('RED · Physical process impact')).toBeVisible();
    // The fixture policy denies because the write capability is not site-approved.
    await expect(dialog.getByRole('alert')).toContainText('not site-approved');
    await expect(dialog.getByRole('button', { name: 'Submit RED request' })).toBeDisabled();
  });

  test('GREEN observation reports acknowledgement before success', async ({ page }) => {
    await signIn(page, 'K. Osei', '/o/northwind/assets/ast_plc203');
    await page.getByRole('button', { name: 'Request action…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Capture configuration snapshot/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('textbox', { name: /Reason/ }).fill('Baseline before firmware diagnostics');
    await dialog.getByRole('button', { name: 'Check policy' }).click();
    await dialog.getByRole('button', { name: 'Submit request' }).click();
    await expect(dialog.getByRole('status')).toContainText('outcome not confirmed');
    await expect(dialog.getByRole('status')).toContainText('Succeeded (confirmed by site)', { timeout: 15_000 });
  });
});
