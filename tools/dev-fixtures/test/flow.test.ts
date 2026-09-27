import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 4290; // Note: 4190 is on the fetch spec's blocked-port list.
const BASE = `http://127.0.0.1:${PORT}`;
const REDIRECT = 'http://localhost:3999/auth/callback';
let proc: ChildProcess;

beforeAll(async () => {
  proc = spawn(process.execPath, ['src/server.ts'], {
    env: { ...process.env, FIXTURE_PORT: String(PORT), NODE_ENV: 'test', FIXTURE_WEB_ORIGIN: 'http://localhost:3999' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/__fixture/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`fixture server did not start: ${output}`);
});
afterAll(() => {
  proc.kill();
});

async function login(user: string, mfa = false): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const form = new URLSearchParams({
    response_type: 'code',
    client_id: 'waylorn-web',
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 's1',
    user,
    ...(mfa ? { acr_values: 'urn:waylorn:acr:mfa', otp: '123456' } : {}),
  });
  const auth = await fetch(`${BASE}/oidc/authorize`, { method: 'POST', body: form, redirect: 'manual' });
  expect(auth.status).toBe(303);
  const code = new URL(auth.headers.get('location') ?? '').searchParams.get('code') ?? '';
  const token = await fetch(`${BASE}/oidc/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from('waylorn-web:dev-only-secret').toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }),
  });
  expect(token.status).toBe(200);
  return ((await token.json()) as { access_token: string }).access_token;
}

const api = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}/api/v0${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });

async function preflight(token: string): Promise<{ preflightId: string; decision: string; safetyClass: string }> {
  const r = await api(token, '/orgs/org_northwind/commands/preflight', {
    method: 'POST',
    body: JSON.stringify({
      assetId: 'ast_plc203',
      action: 'asset.change_configuration',
      parameters: { interval_ms: 500 },
      reason: 'Diagnostics for CHG-1',
      changeTicket: 'CHG-1',
    }),
  });
  return (await r.json()) as { preflightId: string; decision: string; safetyClass: string };
}

const submit = (token: string, preflightId: string, key: string = crypto.randomUUID()) =>
  api(token, '/orgs/org_northwind/commands', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify({ preflightId }) });

describe('fixture OIDC issuer', () => {
  it('rejects a PKCE verifier mismatch', async () => {
    const form = new URLSearchParams({
      response_type: 'code',
      client_id: 'waylorn-web',
      redirect_uri: REDIRECT,
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
      user: 'u_keller',
    });
    const auth = await fetch(`${BASE}/oidc/authorize`, { method: 'POST', body: form, redirect: 'manual' });
    const code = new URL(auth.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const token = await fetch(`${BASE}/oidc/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        code_verifier: 'wrong',
        client_id: 'waylorn-web',
        client_secret: 'dev-only-secret',
      }),
    });
    expect(token.status).toBe(400);
  });

  it('accepts the public mobile client only with PKCE and its own redirect URI', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const form = new URLSearchParams({
      response_type: 'code',
      client_id: 'waylorn-mobile',
      redirect_uri: 'waylorn://auth/callback',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      user: 'u_keller',
    });
    const auth = await fetch(`${BASE}/oidc/authorize`, { method: 'POST', body: form, redirect: 'manual' });
    const code = new URL(auth.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const exchange = (client_id: string) =>
      fetch(`${BASE}/oidc/token`, {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'waylorn://auth/callback', code_verifier: verifier, client_id }),
      });
    // A code issued to the mobile client cannot be redeemed as the web client.
    expect((await exchange('waylorn-web')).status).toBe(401);
    expect((await exchange('waylorn-mobile')).status).toBe(200);
    const webRedirect = await fetch(`${BASE}/oidc/authorize?client_id=waylorn-mobile&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code`);
    expect(webRedirect.status).toBe(400);
  });

  it('rejects unregistered redirect URIs', async () => {
    const r = await fetch(`${BASE}/oidc/authorize?client_id=waylorn-web&redirect_uri=https://evil.example/cb&response_type=code`);
    expect(r.status).toBe(400);
  });
});

describe('fixture API', () => {
  it('labels every response as fixture data', async () => {
    const token = await login('u_keller');
    const r = await api(token, '/me');
    expect(r.headers.get('x-waylorn-data-source')).toBe('fixture');
  });

  it('enforces the tenant boundary', async () => {
    const token = await login('u_keller');
    expect((await api(token, '/orgs/org_harbor/assets')).status).toBe(403);
    const admin = await login('u_admin');
    expect((await api(admin, '/orgs/org_harbor/assets/ast_plc203')).status).toBe(404);
  });

  it('requires step-up for AMBER and rejects execution even after step-up', async () => {
    const engineer = await login('u_osei');
    const pf = await preflight(engineer);
    expect(pf).toMatchObject({ decision: 'permit', safetyClass: 'AMBER' });
    const denied = await submit(engineer, pf.preflightId);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe('step_up_required');

    const stepped = await login('u_osei', true);
    const pf2 = await preflight(stepped);
    const key = crypto.randomUUID();
    const accepted = await submit(stepped, pf2.preflightId, key);
    expect(accepted.status).toBe(202);
    const record = (await accepted.json()) as { id: string; state: string };
    expect(record.state).toBe('rejected');
    // Idempotent replay returns the same record.
    const replay = (await (await submit(stepped, pf2.preflightId, key)).json()) as { id: string };
    expect(replay.id).toBe(record.id);
  });

  it('denies commands to operators through policy, not only through hidden buttons', async () => {
    const operator = await login('u_keller');
    const pf = await preflight(operator);
    expect(pf.decision).toBe('deny');
  });

  it('implements every path in the draft contract', () => {
    const yaml = readFileSync(new URL('../../../contracts/openapi/control-plane.v0.yaml', import.meta.url), 'utf8');
    const contractPaths = [...yaml.matchAll(/^ {2}(\/[^:]+):$/gm)].map((m) => m[1]);
    const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
    expect(contractPaths.length).toBeGreaterThan(30);
    expect(contractPaths.filter((p) => !source.includes(`'${p}'`))).toEqual([]);
  });
});
