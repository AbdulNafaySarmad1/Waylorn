import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const FIXTURES = 'http://localhost:4011';
export type FixtureUser = 'A. Keller' | 'K. Osei' | 'L. Brandt' | 'R. Novak';

/** Signs in through the fixture OIDC issuer — the same code path as Keycloak. */
export async function signIn(page: Page, user: FixtureUser, target = '/o/northwind/overview'): Promise<void> {
  await page.goto(target);
  await page.getByRole('button', { name: new RegExp(`Sign in as ${user.replace('.', '\\.')}`) }).click();
  await page.waitForURL((u) => u.pathname === new URL(target, 'http://x').pathname);
}

export async function fixtureControl(page: Page, patch: Record<string, unknown>): Promise<void> {
  const r = await page.request.post(`${FIXTURES}/__fixture/control`, { data: patch });
  expect(r.ok()).toBe(true);
}

export async function resetFixtures(page: Page): Promise<void> {
  await fixtureControl(page, { stream: 'normal', latencyMs: 0, failApi: false });
}

/** Serious and critical WCAG 2.2 A/AA violations on the current page. */
export async function expectAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(serious).toEqual([]);
}
