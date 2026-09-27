/**
 * DEVELOPMENT-ONLY OIDC issuer. Stands in for Keycloak so the web app exercises the same
 * Authorization Code + PKCE, step-up (acr_values / max_age) and logout code paths that it
 * uses in production. It has no passwords and must never be reachable outside a dev machine.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK, type JWTPayload } from 'jose';

export const ACR_PASSWORD = 'urn:waylorn:acr:pwd';
export const ACR_MFA = 'urn:waylorn:acr:mfa';
export const API_AUDIENCE = 'waylorn-api';

export interface FixtureUser {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly orgs: readonly string[];
  readonly idp: string;
}

export const USERS: readonly FixtureUser[] = [
  { sub: 'u_keller', name: 'A. Keller', email: 'a.keller@northwind.example', roles: ['operator'], orgs: ['org_northwind'], idp: 'entra' },
  { sub: 'u_osei', name: 'K. Osei', email: 'k.osei@northwind.example', roles: ['controls-engineer'], orgs: ['org_northwind'], idp: 'entra' },
  { sub: 'u_brandt', name: 'L. Brandt', email: 'l.brandt@audit.example', roles: ['auditor'], orgs: ['org_northwind'], idp: 'saml-auditfirm' },
  { sub: 'u_admin', name: 'R. Novak', email: 'r.novak@northwind.example', roles: ['org-admin', 'controls-engineer'], orgs: ['org_northwind', 'org_harbor'], idp: 'ad-ldap' },
];

export const IDP_LABEL: Readonly<Record<string, { displayName: string; protocol: 'oidc' | 'saml' | 'ldap' }>> = {
  entra: { displayName: 'Microsoft Entra ID (via Keycloak)', protocol: 'oidc' },
  'saml-auditfirm': { displayName: 'Audit firm SAML IdP (via Keycloak)', protocol: 'saml' },
  'ad-ldap': { displayName: 'Active Directory (Keycloak LDAP federation)', protocol: 'ldap' },
};

interface Config {
  readonly publicUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUris: readonly string[];
  readonly postLogoutRedirectUris: readonly string[];
  readonly accessTokenTtlSeconds: number;
}

interface PendingCode {
  readonly user: FixtureUser;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly nonce: string | undefined;
  readonly authTime: number;
  readonly acr: string;
  readonly expiresAt: number;
}

interface RefreshGrant {
  readonly user: FixtureUser;
  readonly authTime: number;
  readonly acr: string;
  readonly sid: string;
}

const codes = new Map<string, PendingCode>();
const refreshTokens = new Map<string, RefreshGrant>();
const ssoSessions = new Map<string, { user: FixtureUser; authTime: number; acr: string }>();

export async function createIssuer(config: Config) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'fixture-1', alg: 'RS256', use: 'sig' };
  const issuer = `${config.publicUrl}/oidc`;

  async function sign(payload: JWTPayload, audience: string, ttl: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(privateKey);
  }

  async function issueTokens(grant: RefreshGrant, nonce: string | undefined) {
    const u = grant.user;
    const common = { sub: u.sub, auth_time: grant.authTime, acr: grant.acr, sid: grant.sid };
    const accessToken = await sign(
      { ...common, name: u.name, roles: u.roles, orgs: u.orgs, idp: u.idp, azp: config.clientId },
      API_AUDIENCE,
      config.accessTokenTtlSeconds,
    );
    const idToken = await sign(
      { ...common, name: u.name, email: u.email, ...(nonce ? { nonce } : {}), amr: grant.acr === ACR_MFA ? ['pwd', 'otp'] : ['pwd'] },
      config.clientId,
      3600,
    );
    const refreshToken = randomBytes(32).toString('base64url');
    refreshTokens.set(refreshToken, grant);
    return {
      access_token: accessToken,
      id_token: idToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: config.accessTokenTtlSeconds,
      scope: 'openid profile email',
    };
  }

  function discovery() {
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      end_session_endpoint: `${issuer}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      acr_values_supported: [ACR_PASSWORD, ACR_MFA],
      claims_supported: ['sub', 'name', 'email', 'auth_time', 'acr', 'amr', 'sid'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    };
  }

  function loginPage(params: URLSearchParams, error?: string): string {
    const wantsMfa = (params.get('acr_values') ?? '').split(' ').includes(ACR_MFA);
    const hidden = [...params.entries()]
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
      .join('');
    const users = USERS.map(
      (u) =>
        `<li><button type="submit" name="user" value="${u.sub}">Sign in as ${escapeHtml(u.name)} — ${escapeHtml(u.roles.join(', '))} <small>(${escapeHtml(IDP_LABEL[u.idp]?.displayName ?? u.idp)})</small></button></li>`,
    ).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture identity provider</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:14px system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#16191c;background:#eceeef}
.banner{background:#fdf3dc;border:1px solid #8a5a00;color:#5c3a00;padding:8px 12px;margin-bottom:16px}
ul{list-style:none;padding:0}li{margin:6px 0}button{font:inherit;width:100%;text-align:left;padding:10px 12px;border:1px solid #9aa1a8;background:#fbfbfb;cursor:pointer;min-height:44px}
button:focus-visible{outline:2px solid #0b57d0;outline-offset:2px}fieldset{border:1px solid #9aa1a8;padding:12px;margin:12px 0}label{display:block;margin-bottom:4px}
input[type=text]{font:inherit;padding:6px;width:10ch}.error{color:#b3261e}</style></head><body>
<p class="banner" role="note"><strong>DEVELOPMENT FIXTURE IDENTITY PROVIDER.</strong> Stands in for Keycloak. No passwords. Never deploy.</p>
<h1>Sign in to Waylorn</h1>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="${issuer}/authorize">${hidden}
${wantsMfa ? `<fieldset><legend>Step-up authentication requested (${ACR_MFA})</legend><label for="otp">One-time code (fixture accepts any 6 digits)</label><input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></fieldset>` : ''}
<ul>${users}</ul></form></body></html>`;
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/oidc')) return false;
    const path = url.pathname.slice('/oidc'.length);

    if (path === '/.well-known/openid-configuration' && req.method === 'GET') return json(res, 200, discovery());
    if (path === '/jwks' && req.method === 'GET') return json(res, 200, { keys: [jwk] });

    if (path === '/authorize' && (req.method === 'GET' || req.method === 'POST')) {
      const params = req.method === 'GET' ? url.searchParams : new URLSearchParams(await readBody(req));
      const clientId = params.get('client_id');
      const redirectUri = params.get('redirect_uri') ?? '';
      if (clientId !== config.clientId || !config.redirectUris.includes(redirectUri)) {
        return text(res, 400, 'invalid client_id or unregistered redirect_uri');
      }
      if (params.get('response_type') !== 'code' || params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) {
        return redirectError(res, redirectUri, params.get('state'), 'invalid_request', 'PKCE S256 and response_type=code are required');
      }
      const wantsMfa = (params.get('acr_values') ?? '').split(' ').includes(ACR_MFA);
      const maxAge = params.get('max_age');
      const forceLogin = params.get('prompt')?.split(' ').some((p) => p === 'login' || p === 'select_account') ?? false;

      let user: FixtureUser | undefined;
      let authTime = Math.floor(Date.now() / 1000);
      let acr = ACR_PASSWORD;

      if (req.method === 'GET') {
        const sso = ssoSessions.get(cookie(req, 'fixture_sso') ?? '');
        const ssoUsable =
          sso && !forceLogin && (!wantsMfa || sso.acr === ACR_MFA) && (maxAge === null || authTime - sso.authTime <= Number(maxAge));
        if (!ssoUsable) return html(res, 200, loginPage(params));
        user = sso.user;
        authTime = sso.authTime;
        acr = sso.acr;
      } else {
        user = USERS.find((u) => u.sub === params.get('user'));
        if (!user) return html(res, 400, loginPage(params, 'Choose a fixture user.'));
        if (wantsMfa) {
          if (!/^[0-9]{6}$/.test(params.get('otp') ?? '')) return html(res, 400, loginPage(params, 'Enter a 6-digit code.'));
          acr = ACR_MFA;
        }
        const sid = randomBytes(16).toString('base64url');
        ssoSessions.set(sid, { user, authTime, acr });
        res.setHeader('set-cookie', `fixture_sso=${sid}; Path=/oidc; HttpOnly; SameSite=Lax`);
      }

      const code = randomBytes(24).toString('base64url');
      codes.set(code, {
        user,
        clientId: config.clientId,
        redirectUri,
        codeChallenge: params.get('code_challenge') ?? '',
        nonce: params.get('nonce') ?? undefined,
        authTime,
        acr,
        expiresAt: Date.now() + 60_000,
      });
      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      const state = params.get('state');
      if (state) target.searchParams.set('state', state);
      target.searchParams.set('iss', issuer);
      res.writeHead(303, { location: target.toString() });
      res.end();
      return true;
    }

    if (path === '/token' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req));
      const auth = clientAuth(req, body);
      if (!auth || auth.id !== config.clientId || !safeEqual(auth.secret, config.clientSecret)) {
        return json(res, 401, { error: 'invalid_client' });
      }
      const grantType = body.get('grant_type');
      if (grantType === 'authorization_code') {
        const code = codes.get(body.get('code') ?? '');
        codes.delete(body.get('code') ?? '');
        if (!code || code.expiresAt < Date.now() || code.redirectUri !== body.get('redirect_uri')) {
          return json(res, 400, { error: 'invalid_grant' });
        }
        const verifier = body.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!safeEqual(challenge, code.codeChallenge)) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        const sid = randomBytes(16).toString('base64url');
        return json(res, 200, await issueTokens({ user: code.user, authTime: code.authTime, acr: code.acr, sid }, code.nonce));
      }
      if (grantType === 'refresh_token') {
        const token = body.get('refresh_token') ?? '';
        const grant = refreshTokens.get(token);
        refreshTokens.delete(token); // rotation
        if (!grant) return json(res, 400, { error: 'invalid_grant' });
        return json(res, 200, await issueTokens(grant, undefined));
      }
      return json(res, 400, { error: 'unsupported_grant_type' });
    }

    if (path === '/logout' && req.method === 'GET') {
      const sid = cookie(req, 'fixture_sso');
      if (sid) ssoSessions.delete(sid);
      const redirect = url.searchParams.get('post_logout_redirect_uri');
      res.setHeader('set-cookie', 'fixture_sso=; Path=/oidc; Max-Age=0');
      if (redirect && config.postLogoutRedirectUris.includes(redirect)) {
        res.writeHead(303, { location: redirect });
        res.end();
        return true;
      }
      return html(res, 200, '<!doctype html><title>Signed out</title><p>Signed out of the fixture identity provider.</p>');
    }

    return text(res, 404, 'not found');
  }

  async function verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, () => publicKey, { issuer, audience: API_AUDIENCE, algorithms: ['RS256'] });
    const user = USERS.find((u) => u.sub === payload.sub);
    if (!user) throw new Error('unknown subject');
    const authTime = typeof payload['auth_time'] === 'number' ? payload['auth_time'] : 0;
    const acr = typeof payload['acr'] === 'string' ? payload['acr'] : ACR_PASSWORD;
    return { user, authTime, acr };
  }

  return { handle, verifyAccessToken, issuer };
}

export type AuthenticatedCaller = Awaited<ReturnType<Awaited<ReturnType<typeof createIssuer>>['verifyAccessToken']>>;

function clientAuth(req: IncomingMessage, body: URLSearchParams): { id: string; secret: string } | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return undefined;
    return { id: decodeURIComponent(decoded.slice(0, idx)), secret: decodeURIComponent(decoded.slice(idx + 1)) };
  }
  const id = body.get('client_id');
  const secret = body.get('client_secret');
  return id && secret ? { id, secret } : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

export function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
  return true;
}

function text(res: ServerResponse, status: number, body: string): true {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
  return true;
}

function html(res: ServerResponse, status: number, body: string): true {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  });
  res.end(body);
  return true;
}

function redirectError(res: ServerResponse, redirectUri: string, state: string | null, error: string, description: string): true {
  const u = new URL(redirectUri);
  u.searchParams.set('error', error);
  u.searchParams.set('error_description', description);
  if (state) u.searchParams.set('state', state);
  res.writeHead(303, { location: u.toString() });
  res.end();
  return true;
}
