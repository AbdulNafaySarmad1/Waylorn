/**
 * Cookie names. `__Host-` requires Secure, Path=/ and no Domain, binding the cookie to the
 * exact origin (browsers treat http://localhost as a secure context for development).
 */
export const SESSION_COOKIE = '__Host-waylorn-session';
export const AUTH_TX_COOKIE = '__Host-waylorn-auth';
export const THEME_COOKIE = 'waylorn-theme';
export const CSRF_HEADER = 'x-waylorn-csrf';

export const THEMES = ['system', 'light', 'dark', 'contrast'] as const;
export type ThemePreference = (typeof THEMES)[number];

export function parseTheme(value: string | undefined): ThemePreference {
  return THEMES.find((t) => t === value) ?? 'system';
}
