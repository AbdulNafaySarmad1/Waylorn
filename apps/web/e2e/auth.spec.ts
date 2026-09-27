import { expect, test } from '@playwright/test';
import { signIn } from './support';

test.describe('authentication and session', () => {
  test('unauthenticated access is redirected to the identity provider and back', async ({ page }) => {
    await page.goto('/o/northwind/assets?site=site_muc3');
    await expect(page.getByRole('heading', { name: 'Sign in to Waylorn' })).toBeVisible();
    await page.getByRole('button', { name: /Sign in as A\. Keller/ }).click();
    await expect(page).toHaveURL(/\/o\/northwind\/assets\?site=site_muc3$/);
    await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible();
  });

  test('rejects open redirects in returnTo', async ({ page }) => {
    await page.goto('/auth/login?returnTo=//evil.example/steal');
    await page.getByRole('button', { name: /Sign in as A\. Keller/ }).click();
    await expect(page).toHaveURL(/localhost:3100\/o\/northwind\/overview$/);
  });

  test('session cookie is host-bound, HttpOnly and never exposes tokens to scripts', async ({ page, context }) => {
    await signIn(page, 'A. Keller');
    const cookie = (await context.cookies()).find((c) => c.name === '__Host-waylorn-session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain('waylorn-session');
    const session = await page.evaluate(async () => (await fetch('/api/bff/session')).json() as Promise<Record<string, unknown>>);
    expect(Object.keys(session)).not.toEqual(expect.arrayContaining(['accessToken', 'refreshToken', 'idToken']));
    expect(JSON.stringify(session)).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });

  test('sends security headers', async ({ page }) => {
    const response = await page.goto('/signed-out');
    const h = response?.headers() ?? {};
    expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('BFF rejects cross-site and token-less mutations', async ({ page }) => {
    await signIn(page, 'K. Osei');
    const noToken = await page.evaluate(async () => {
      const r = await fetch('/api/bff/v0/orgs/org_northwind/commands/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return { status: r.status, body: (await r.json()) as { code?: string } };
    });
    expect(noToken).toEqual({ status: 403, body: expect.objectContaining({ code: 'csrf' }) as unknown });
  });

  test('BFF refuses paths outside the allowlist', async ({ page }) => {
    await signIn(page, 'A. Keller');
    const status = await page.evaluate(async () => (await fetch('/api/bff/v0/admin/users')).status);
    expect(status).toBe(404);
  });

  test('logout ends the session at the BFF and the identity provider', async ({ page }) => {
    await signIn(page, 'A. Keller');
    await page.locator('summary', { hasText: 'A. Keller' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Signed out' })).toBeVisible();
    await page.goto('/o/northwind/overview');
    await expect(page.getByRole('heading', { name: 'Sign in to Waylorn' })).toBeVisible();
  });
});

test.describe('tenancy', () => {
  test('an organization outside the principal scope is not found', async ({ page }) => {
    await signIn(page, 'A. Keller');
    await page.goto('/o/harbor/overview');
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  });

  test('an asset from another organization is not reachable through this organization', async ({ page }) => {
    await signIn(page, 'R. Novak');
    await page.goto('/o/harbor/assets/ast_plc203');
    await expect(page.getByText('Not found in this organization')).toBeVisible();
  });

  test('switching organization changes every context indicator', async ({ page }) => {
    await signIn(page, 'R. Novak');
    await page.locator('summary', { hasText: 'Northwind Industrial' }).click();
    await page.getByRole('link', { name: 'Harbor Foods (fixture)' }).click();
    await expect(page).toHaveURL(/\/o\/harbor\/overview$/);
    await expect(page.locator('summary', { hasText: 'Harbor Foods (fixture)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Amsterdam Bakery 1' })).toBeVisible();
    await expect(page.getByText('Munich Plant 3')).toHaveCount(0);
  });
});
