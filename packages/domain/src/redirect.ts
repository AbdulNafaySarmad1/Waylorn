/**
 * Safe post-login redirect handling. Only same-origin, absolute-path references are
 * accepted. Everything else falls back, preventing open redirects.
 */
export function safeReturnTo(candidate: string | null | undefined, fallback = '/'): string {
  if (typeof candidate !== 'string') return fallback;
  if (candidate.length === 0 || candidate.length > 2048) return fallback;
  // Must be a path: one leading slash, not protocol-relative, no backslashes (browsers
  // normalise `\` to `/`), no control characters.
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://waylorn.invalid');
  } catch {
    return fallback;
  }
  if (parsed.origin !== 'https://waylorn.invalid') return fallback;
  // Never bounce back into the auth endpoints (loops, token replay confusion).
  if (parsed.pathname.startsWith('/auth/') || parsed.pathname.startsWith('/api/')) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
