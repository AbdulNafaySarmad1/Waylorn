import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/cookies';
import { serverConfig } from '../config';
import { client, oidcConfiguration } from './oidc';
import { memoryStore } from './store';

export interface Session {
  readonly id: string;
  readonly subject: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly absoluteExpiresAt: number;
  readonly lastSeenAt: number;
  /** Epoch ms of the most recent interactive authentication (OIDC auth_time). */
  readonly authTime: number;
  readonly acr: string | undefined;
  readonly csrfToken: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string | undefined;
  readonly idToken: string | undefined;
}

/** Fields safe to hand to the browser. No tokens. */
export interface PublicSession {
  readonly subject: string;
  readonly displayName: string;
  readonly authTime: number;
  readonly acr: string | undefined;
  readonly csrfToken: string;
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
}

const sessions = memoryStore<Session>('session');

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function toPublic(session: Session): PublicSession {
  const { idleTimeoutSeconds } = serverConfig().session;
  return {
    subject: session.subject,
    displayName: session.displayName,
    authTime: session.authTime,
    acr: session.acr,
    csrfToken: session.csrfToken,
    idleExpiresAt: Math.min(session.lastSeenAt + idleTimeoutSeconds * 1000, session.absoluteExpiresAt),
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

type TokenResponse = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

export function sessionFromTokens(tokens: TokenResponse, previous?: Session): Omit<Session, 'id'> {
  const claims = tokens.claims();
  if (!claims) throw new Error('ID token missing from token response');
  const now = Date.now();
  const cfg = serverConfig().session;
  if (previous && previous.subject !== claims.sub) throw new Error('Re-authentication returned a different subject');
  const name = typeof claims['name'] === 'string' ? claims['name'] : claims.sub;
  return {
    subject: claims.sub,
    displayName: name,
    createdAt: previous?.createdAt ?? now,
    absoluteExpiresAt: previous?.absoluteExpiresAt ?? now + cfg.absoluteTimeoutSeconds * 1000,
    lastSeenAt: now,
    authTime: typeof claims.auth_time === 'number' ? claims.auth_time * 1000 : now,
    acr: typeof claims.acr === 'string' ? claims.acr : undefined,
    // Rotated on every (re-)authentication.
    csrfToken: randomToken(),
    accessToken: tokens.access_token,
    accessTokenExpiresAt: now + (tokens.expiresIn() ?? 60) * 1000,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
  };
}

/** Stores a session under a fresh identifier (prevents session fixation) and sets the cookie. */
export async function establishSession(data: Omit<Session, 'id'>, replaces?: string): Promise<Session> {
  if (replaces) await sessions.delete(replaces);
  const session: Session = { ...data, id: randomToken() };
  await persist(session);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    // Session cookie (no Max-Age): closing the browser ends it; the server enforces limits.
  });
  return session;
}

async function persist(session: Session): Promise<void> {
  const ttl = Math.max(1, Math.ceil((session.absoluteExpiresAt - Date.now()) / 1000));
  await sessions.set(session.id, session, ttl);
}

export async function destroySession(id: string | undefined): Promise<void> {
  if (id) await sessions.delete(id);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Reads the current session, enforcing idle and absolute timeouts. Returns undefined when
 * the session is missing or expired.
 */
export async function readSession(options: { touch?: boolean } = {}): Promise<Session | undefined> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id || id.length > 128) return undefined;
  const session = await sessions.get(id);
  if (!session) return undefined;
  const now = Date.now();
  const { idleTimeoutSeconds } = serverConfig().session;
  if (now > session.absoluteExpiresAt || now - session.lastSeenAt > idleTimeoutSeconds * 1000) {
    await sessions.delete(id);
    return undefined;
  }
  if (options.touch !== false && now - session.lastSeenAt > 15_000) {
    const touched = { ...session, lastSeenAt: now };
    await persist(touched);
    return touched;
  }
  return session;
}

export async function requireSession(returnTo: string): Promise<Session> {
  const session = await readSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session;
}

const refreshing = new Map<string, Promise<Session | undefined>>();

/**
 * Returns a usable access token, refreshing it shortly before expiry. Refreshes are
 * single-flight per session because refresh tokens rotate.
 */
export async function accessTokenFor(session: Session, force = false): Promise<Session | undefined> {
  if (!force && session.accessTokenExpiresAt - Date.now() > 30_000) return session;
  const inflight = refreshing.get(session.id);
  if (inflight) return inflight;
  const task = (async () => {
    if (!session.refreshToken) return undefined;
    try {
      const config = await oidcConfiguration();
      const tokens = await client.refreshTokenGrant(config, session.refreshToken);
      const next: Session = {
        ...session,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: Date.now() + (tokens.expiresIn() ?? 60) * 1000,
        refreshToken: tokens.refresh_token ?? session.refreshToken,
        idToken: tokens.id_token ?? session.idToken,
      };
      await persist(next);
      return next;
    } catch {
      // Refresh failure ends the session; the operator must sign in again.
      await sessions.delete(session.id);
      return undefined;
    }
  })();
  refreshing.set(session.id, task);
  try {
    return await task;
  } finally {
    refreshing.delete(session.id);
  }
}

export function csrfMatches(session: Session, provided: string | null | undefined): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(session.csrfToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Same-origin check for unsafe methods, always combined with the session-bound CSRF token.
 * Fetch Metadata (`Sec-Fetch-Site`) is set by the browser and cannot be forged by page
 * script, so it is authoritative when present. Browsers send `Origin: null` for form posts
 * under `Referrer-Policy: no-referrer`, so Origin is only the fallback for older clients.
 */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  const origin = headers.get('origin');
  return origin !== null && origin !== 'null' && origin === serverConfig().publicOrigin;
}
