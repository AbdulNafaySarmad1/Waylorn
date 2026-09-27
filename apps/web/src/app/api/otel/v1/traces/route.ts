import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin, readSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;

/** Relays browser spans to the OTLP collector. Authenticated, same-origin, size-limited. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) return new NextResponse(null, { status: 204 });
  if (!isSameOrigin(request.headers)) return new NextResponse(null, { status: 403 });
  if (!(await readSession({ touch: false }))) return new NextResponse(null, { status: 401 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
  try {
    const upstream = await fetch(`${endpoint.replace(/\/+$/, '')}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
      body,
    });
    return new NextResponse(null, { status: upstream.ok ? 202 : 502 });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
