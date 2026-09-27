import { NextResponse, type NextRequest } from 'next/server';
import { serverConfig } from '@/server/config';
import { client, oidcConfiguration } from '@/server/auth/oidc';
import { csrfMatches, destroySession, isSameOrigin, readSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

/** RP-initiated logout. POST only, CSRF-protected, so a third-party page cannot log users out. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cfg = serverConfig();
  const session = await readSession({ touch: false });
  const form = await request.formData();
  const token = form.get('csrf');
  if (session && (!isSameOrigin(request.headers) || !csrfMatches(session, typeof token === 'string' ? token : undefined))) {
    return new NextResponse('Invalid logout request', { status: 403 });
  }
  await destroySession(session?.id);
  const signedOut = `${cfg.publicOrigin}/signed-out`;
  try {
    const config = await oidcConfiguration();
    const endSession = client.buildEndSessionUrl(config, {
      post_logout_redirect_uri: signedOut,
      ...(session?.idToken ? { id_token_hint: session.idToken } : {}),
    });
    return NextResponse.redirect(endSession, 303);
  } catch {
    // IdP unreachable: the local session is gone regardless.
    return NextResponse.redirect(signedOut, 303);
  }
}
