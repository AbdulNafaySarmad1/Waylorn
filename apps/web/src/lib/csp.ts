/** Builds the per-request Content Security Policy (architecture §7). */
export interface CspOptions {
  readonly nonce: string;
  readonly development: boolean;
  /** Origin of the identity provider; logout and login redirect chains pass through it. */
  readonly identityOrigin: string | undefined;
  readonly upgradeInsecure: boolean;
}

export function buildCsp({ nonce, development, identityOrigin, upgradeInsecure }: CspOptions): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])],
    // Development tooling injects style elements; production uses only nonce'd/linked styles.
    'style-src': ["'self'", development ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    // Inline style attributes (virtualised row offsets, SVG sizing) carry no script capability.
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'", ...(identityOrigin ? [identityOrigin] : [])],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (upgradeInsecure) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}
