import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dark, light, type ColorTokens } from '../src/index';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function toCssName(key: string): string {
  return `--${key.replace(/([a-z])([0-9A-Z])/g, '$1-$2').toLowerCase()}`;
}

function block(selector: string): string {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open, close);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('environment badges', () => {
  it.each([
    ['production', '#b3261e'],
    ['lab light', '#4a3aa7'],
    ['lab dark', '#5b4ec2'],
    ['development light', '#4a5159'],
    ['development dark', '#555d66'],
  ])('%s badge meets 4.5:1 with white text', (_n, bg) => {
    expect(contrast('#ffffff', bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('dark theme badge colours are the tested ones', () => {
    const b = block(":root[data-theme='dark']");
    expect(b).toContain('--env-production: #b3261e;');
    expect(b).toContain('--env-lab: #5b4ec2;');
    expect(b).toContain('--env-development: #555d66;');
  });
});

const textKeys: (keyof ColorTokens)[] = [
  'textPrimary', 'textSecondary', 'textMuted', 'statusOk', 'statusWarning', 'statusFault',
  'statusUnknown', 'statusInfo', 'safetyGreen', 'safetyAmber', 'safetyRed',
];

describe.each([
  ['light', light, ':root {'],
  ['dark', dark, ":root[data-theme='dark']"],
] as const)('%s tokens', (_name, tokens, selector) => {
  it('match tokens.css', () => {
    const b = block(selector);
    for (const [key, value] of Object.entries(tokens)) {
      expect(b, key).toContain(`${toCssName(key)}: ${value};`);
    }
  });
  it.each(textKeys)('%s meets WCAG AA (4.5:1) on every surface', (key) => {
    for (const surface of [tokens.surface0, tokens.surface1, tokens.surface2]) {
      expect(contrast(tokens[key], surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
