import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { SESSION_COOKIE } from './lib/cookies';

/**
 * Runs before every page request: sets the nonce-based CSP and redirects requests without
 * a session cookie to login. The cookie's presence is only a routing hint; every server
 * component validates the session against the store, and the backend authorizes each call.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/o/') && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL('/auth/login', request.nextUrl.origin);
    login.searchParams.set('returnTo', `${pathname}${search}`);
    return NextResponse.redirect(login, 303);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const issuer = process.env['WAYLORN_OIDC_ISSUER'];
  const publicOrigin = process.env['WAYLORN_PUBLIC_ORIGIN'] ?? '';
  const csp = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    identityOrigin: issuer ? new URL(issuer).origin : undefined,
    upgradeInsecure: publicOrigin.startsWith('https://'),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
