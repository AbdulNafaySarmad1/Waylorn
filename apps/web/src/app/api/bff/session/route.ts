import { NextResponse } from 'next/server';
import { readSession, toPublic } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

/** Session metadata for the browser (expiry warnings, step-up freshness). Never tokens. */
export async function GET(): Promise<NextResponse> {
  // Polling this endpoint must not extend the idle timeout.
  const session = await readSession({ touch: false });
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'cache-control': 'no-store' } });
  return NextResponse.json({ authenticated: true, ...toPublic(session) }, { headers: { 'cache-control': 'no-store' } });
}
