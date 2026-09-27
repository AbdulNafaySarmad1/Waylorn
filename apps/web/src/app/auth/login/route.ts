import { NextResponse, type NextRequest } from 'next/server';
import { safeReturnTo } from '@waylorn/domain';
import { AUTH_TX_COOKIE } from '@/lib/cookies';
import { serverConfig } from '@/server/config';
import { callbackUrl, client, oidcConfiguration } from '@/server/auth/oidc';
import { randomToken } from '@/server/auth/session';
import { AUTH_TX_TTL_SECONDS, transactions } from '@/server/auth/transaction';

export const dynamic = 'force-dynamic';

/**
 * Starts an Authorization Code + PKCE request. `stepUp=1` requests fresh, stronger
 * authentication (max_age=0 plus the configured ACR) for consequential operations.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cfg = serverConfig();
  const params = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(params.get('returnTo'), '/');
  const stepUp = params.get('stepUp') === '1';
  const selectAccount = params.get('prompt') === 'select_account';

  let config;
  try {
    config = await oidcConfiguration();
  } catch {
    return NextResponse.redirect(new URL('/auth/error?reason=idp_unavailable', cfg.publicOrigin), 303);
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const authorizationParams: Record<string, string> = {
    redirect_uri: callbackUrl(),
    scope: cfg.oidc.scope,
    response_type: 'code',
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  };
  if (stepUp) {
    authorizationParams['max_age'] = '0';
    authorizationParams['acr_values'] = cfg.oidc.stepUpAcr;
    authorizationParams['prompt'] = 'login';
  } else if (selectAccount) {
    authorizationParams['prompt'] = 'select_account';
  }

  const txId = randomToken();
  await transactions.set(
    txId,
    { state, nonce, codeVerifier, returnTo, stepUp, maxAge: stepUp ? 0 : undefined, createdAt: Date.now() },
    AUTH_TX_TTL_SECONDS,
  );

  const response = NextResponse.redirect(client.buildAuthorizationUrl(config, authorizationParams), 303);
  response.cookies.set(AUTH_TX_COOKIE, txId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_TX_TTL_SECONDS,
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}
