import 'server-only';

/**
 * Runtime configuration, validated once. Misconfiguration fails closed at startup rather
 * than producing a partially secure deployment.
 */
export interface ServerConfig {
  readonly publicOrigin: string;
  readonly apiBaseUrl: string;
  readonly oidc: {
    readonly issuer: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly scope: string;
    readonly stepUpAcr: string;
    readonly allowInsecureIssuer: boolean;
  };
  readonly session: {
    readonly store: 'memory';
    readonly idleTimeoutSeconds: number;
    readonly absoluteTimeoutSeconds: number;
  };
  readonly production: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`Missing required environment variable ${name}`);
  return value.trim();
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
}

function origin(name: string): string {
  const url = new URL(required(name));
  return url.origin;
}

function isLoopback(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

let cached: ServerConfig | undefined;

export function serverConfig(): ServerConfig {
  if (cached) return cached;
  const production = process.env.NODE_ENV === 'production';
  const issuer = required('WAYLORN_OIDC_ISSUER');
  const apiBaseUrl = required('WAYLORN_API_BASE_URL').replace(/\/+$/, '');
  const publicOrigin = origin('WAYLORN_PUBLIC_ORIGIN');

  // Plain HTTP is only tolerated for loopback development/test issuers.
  const insecure = new URL(issuer).protocol === 'http:';
  if (insecure && !isLoopback(issuer)) throw new Error('WAYLORN_OIDC_ISSUER must use https');
  if (new URL(apiBaseUrl).protocol === 'http:' && !isLoopback(apiBaseUrl)) throw new Error('WAYLORN_API_BASE_URL must use https');

  const store = process.env['WAYLORN_SESSION_STORE'] ?? 'memory';
  if (store !== 'memory') throw new Error(`Unsupported WAYLORN_SESSION_STORE "${store}" (a Valkey adapter is planned, see ADR 0009)`);
  if (production && process.env['WAYLORN_ALLOW_SINGLE_INSTANCE_SESSIONS'] !== 'true') {
    throw new Error(
      'The in-memory session store is single-instance only. Set WAYLORN_ALLOW_SINGLE_INSTANCE_SESSIONS=true to acknowledge this for a single-replica deployment or test run.',
    );
  }

  cached = {
    publicOrigin,
    apiBaseUrl,
    oidc: {
      issuer,
      clientId: required('WAYLORN_OIDC_CLIENT_ID'),
      clientSecret: required('WAYLORN_OIDC_CLIENT_SECRET'),
      scope: process.env['WAYLORN_OIDC_SCOPE'] ?? 'openid profile email',
      stepUpAcr: process.env['WAYLORN_OIDC_STEP_UP_ACR'] ?? 'urn:waylorn:acr:mfa',
      allowInsecureIssuer: insecure,
    },
    session: {
      store: 'memory',
      idleTimeoutSeconds: int('WAYLORN_SESSION_IDLE_SECONDS', 30 * 60, 60, 24 * 3600),
      absoluteTimeoutSeconds: int('WAYLORN_SESSION_ABSOLUTE_SECONDS', 12 * 3600 + 30 * 60, 300, 7 * 24 * 3600),
    },
    production,
  };
  return cached;
}
