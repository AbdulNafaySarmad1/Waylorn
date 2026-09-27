/**
 * DEVELOPMENT / TEST fixture server. Serves:
 *   /oidc/*        development OIDC issuer (stands in for Keycloak)
 *   /api/v0/*      draft control-plane API backed by fixture data
 *   /__fixture/*   controls for degraded-connectivity tests
 * Every response carries `x-waylorn-data-source: fixture`; the web UI shows a persistent banner.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { control, dispatch, openStreams, problem, send } from './api.ts';
import { createIssuer } from './oidc.ts';
import { readBody } from './oidc.ts';

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to start: the fixture server is development/test only (ADR 0012).');
  process.exit(1);
}

const port = Number(process.env['FIXTURE_PORT'] ?? 4010);
const host = process.env['FIXTURE_HOST'] ?? '127.0.0.1';
const publicUrl = process.env['FIXTURE_PUBLIC_URL'] ?? `http://localhost:${port}`;
const webOrigin = process.env['FIXTURE_WEB_ORIGIN'] ?? 'http://localhost:3000';

const issuer = await createIssuer({
  publicUrl,
  clientId: process.env['FIXTURE_CLIENT_ID'] ?? 'waylorn-web',
  clientSecret: process.env['FIXTURE_CLIENT_SECRET'] ?? 'dev-only-secret',
  redirectUris: [`${webOrigin}/auth/callback`],
  publicClients: [{ id: 'waylorn-mobile', redirectUris: ['waylorn://auth/callback', 'exp://127.0.0.1:8081/--/auth/callback'] }],
  postLogoutRedirectUris: [`${webOrigin}/signed-out`],
  accessTokenTtlSeconds: Number(process.env['FIXTURE_ACCESS_TTL'] ?? 300),
});

const server = createServer((req, res) => {
  res.setHeader('x-waylorn-data-source', 'fixture');
  const correlationId = (req.headers['x-correlation-id'] as string | undefined)?.slice(0, 64) ?? randomUUID();
  res.setHeader('x-correlation-id', correlationId);
  const url = new URL(req.url ?? '/', publicUrl);

  void (async () => {
    try {
      if (url.pathname === '/__fixture/health') return send(res, 200, { ok: true, control });
      if (url.pathname === '/__fixture/control' && req.method === 'POST') {
        const patch = JSON.parse(await readBody(req)) as Partial<typeof control>;
        if (patch.stream === 'normal' || patch.stream === 'frozen' || patch.stream === 'severed') control.stream = patch.stream;
        if (typeof patch.latencyMs === 'number') control.latencyMs = Math.max(0, Math.min(30_000, patch.latencyMs));
        if (typeof patch.failApi === 'boolean') control.failApi = patch.failApi;
        if (control.stream === 'severed') for (const s of openStreams) s.destroy();
        return send(res, 200, control);
      }
      if (await issuer.handle(req, res, url)) return;

      if (url.pathname.startsWith('/api/v0/')) {
        if (control.latencyMs > 0) await new Promise((r) => setTimeout(r, control.latencyMs));
        if (control.failApi && !url.pathname.endsWith('/me')) {
          return problem(res, 503, 'Control plane unavailable', correlationId, { detail: 'Fixture control: API failure injected.' });
        }
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) return problem(res, 401, 'Missing bearer token', correlationId);
        let caller;
        try {
          caller = await issuer.verifyAccessToken(auth.slice(7));
        } catch {
          return problem(res, 401, 'Invalid or expired token', correlationId);
        }
        return await dispatch(req, res, url, caller, correlationId);
      }
      problem(res, 404, 'Not found', correlationId);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) problem(res, 500, 'Fixture server error', correlationId);
    }
  })();
});

server.listen(port, host, () => {
  console.log(`[fixtures] DEVELOPMENT FIXTURE SERVER on ${publicUrl} (issuer ${issuer.issuer})`);
});
