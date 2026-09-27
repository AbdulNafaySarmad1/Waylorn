import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../src/redirect';

describe('safeReturnTo', () => {
  it.each([
    ['/o/acme/assets?site=s1#x', '/o/acme/assets?site=s1#x'],
    ['/o/acme/overview', '/o/acme/overview'],
  ])('accepts same-origin path %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it.each([
    'https://evil.example/',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/o/acme\u0000',
    '/o/acme\n',
    'o/acme',
    '',
    '/auth/login',
    '/api/bff/me',
    `/${'a'.repeat(3000)}`,
  ])('rejects %j', (input) => {
    expect(safeReturnTo(input, '/fallback')).toBe('/fallback');
  });

  it('rejects non-strings', () => {
    expect(safeReturnTo(undefined, '/f')).toBe('/f');
    expect(safeReturnTo(null, '/f')).toBe('/f');
  });

  it('normalises dot segments without escaping origin', () => {
    expect(safeReturnTo('/o/../../x')).toBe('/x');
  });
});
