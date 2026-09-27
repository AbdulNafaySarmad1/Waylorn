import axe from 'axe-core';

/** Runs axe on a container and returns serious/critical violations (WCAG 2.2 A/AA rules). */
export async function seriousViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    // Colour contrast needs real layout and computed styles; covered by Playwright and token tests.
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`);
}
