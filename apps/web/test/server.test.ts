import { describe, expect, it } from 'vitest';
import { buildCsp } from '@/lib/csp';
import { isAllowedPath } from '@/server/bff';
import { MemoryStore } from '@/server/auth/store';

describe('BFF path allowlist', () => {
  it.each(['me', 'orgs/org_1/assets', 'orgs/org_1/assets/ast_1/live/stream', 'orgs/org_1/ai/assistant/turns'])('allows %s', (p) => {
    expect(isAllowedPath(p)).toBe(true);
  });
  it.each(['orgs/org_1/../admin', 'orgs//assets', 'admin/users', 'orgs/org_1/unknown', 'https://evil.example', 'orgs/org 1/assets'])('rejects %s', (p) => {
    expect(isAllowedPath(p)).toBe(false);
  });
});

describe('CSP', () => {
  const csp = buildCsp({ nonce: 'abc', development: false, identityOrigin: 'https://id.example', upgradeInsecure: true });
  it('uses a nonce with strict-dynamic and no unsafe-inline scripts', () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain('unsafe-eval');
  });
  it('forbids framing, plugins and base-tag injection', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
  it('allows form posts only to self and the identity provider', () => {
    expect(csp).toContain("form-action 'self' https://id.example");
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

describe('MemoryStore', () => {
  it('expires entries after their TTL', async () => {
    let now = 0;
    const store = new MemoryStore<string>(() => now);
    await store.set('k', 'v', 10);
    expect(await store.get('k')).toBe('v');
    now = 10_001;
    expect(await store.get('k')).toBeUndefined();
  });
});
