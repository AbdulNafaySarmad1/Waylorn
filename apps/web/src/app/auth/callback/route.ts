import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_TX_COOKIE } from '@/lib/cookies';
import { serverConfig } from '@/server/config';
import { callbackUrl, client, oidcConfiguration } from '@/server/auth/oidc';
import { establishSession, readSession, sessionFromTokens } from '@/server/auth/session';
import { transactions } from '@/server/auth/transaction';

export const dynamic = 'force-dynamic';

function fail(reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, serverConfig().publicOrigin), 303);
  response.cookies.delete(AUTH_TX_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cfg = serverConfig();
  const txId = request.cookies.get(AUTH_TX_COOKIE)?.value;
  const tx = txId ? await transactions.get(txId) : undefined;
  if (!txId || !tx) return fail('expired');
  await transactions.delete(txId); // single use

  if (request.nextUrl.searchParams.has('error')) return fail('denied');

  // Rebuild the callback URL on the configured public origin; never trust the Host header.
  const current = new URL(callbackUrl());
  current.search = request.nextUrl.search;

  const previous = tx.stepUp ? await readSession({ touch: false }) : undefined;
  if (tx.stepUp && !previous) return fail('expired');

  let tokens;
  try {
    const config = await oidcConfiguration();
    tokens = await client.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: tx.codeVerifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
      ...(tx.maxAge !== undefined ? { maxAge: tx.maxAge } : {}),
    });
  } catch {
    return fail('exchange_failed');
  }

  let data;
  try {
    data = sessionFromTokens(tokens, previous);
  } catch {
    return fail(tx.stepUp ? 'subject_mismatch' : 'exchange_failed');
  }
  if (tx.stepUp && data.acr !== cfg.oidc.stepUpAcr) return fail('step_up_insufficient');

  // New session identifier on every authentication, including step-up.
  await establishSession(data, previous?.id);
  const response = NextResponse.redirect(new URL(tx.returnTo, cfg.publicOrigin), 303);
  response.cookies.delete(AUTH_TX_COOKIE);
  response.headers.set('cache-control', 'no-store');
  return response;
}
