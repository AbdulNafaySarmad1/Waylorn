import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_HEADER } from '@/lib/cookies';
import { serverConfig } from '@/server/config';
import { accessTokenFor, csrfMatches, isSameOrigin, readSession } from '@/server/auth/session';
import { FORWARDED_REQUEST_HEADERS, FORWARDED_RESPONSE_HEADERS, isAllowedPath, MAX_BODY_BYTES } from '@/server/bff';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path: string[] }> };

function problem(status: number, title: string, correlationId: string, code?: string): NextResponse {
  return NextResponse.json(
    { type: `about:blank`, title, status, correlationId, ...(code ? { code } : {}) },
    { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
  );
}

async function forward(request: NextRequest, { params }: Params): Promise<Response> {
  const correlationId = randomUUID();
  const path = (await params).path.map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');
  if (!isAllowedPath(path)) return problem(404, 'Unknown BFF route', correlationId);

  let session = await readSession();
  if (!session) return problem(401, 'Session ended', correlationId, 'session_ended');

  const unsafe = request.method !== 'GET' && request.method !== 'HEAD';
  if (unsafe && (!isSameOrigin(request.headers) || !csrfMatches(session, request.headers.get(CSRF_HEADER)))) {
    return problem(403, 'Cross-site request rejected', correlationId, 'csrf');
  }

  let body: ArrayBuffer | undefined;
  if (unsafe) {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) return problem(413, 'Request too large', correlationId);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return problem(413, 'Request too large', correlationId);
  }

  const upstreamUrl = `${serverConfig().apiBaseUrl}/api/v0/${path}${request.nextUrl.search}`;
  const send = async (token: string): Promise<Response> => {
    const headers = new Headers({ authorization: `Bearer ${token}`, 'x-correlation-id': correlationId });
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const v = request.headers.get(name);
      if (v !== null) headers.set(name, v);
    }
    return fetch(upstreamUrl, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      signal: request.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
  };

  session = await accessTokenFor(session);
  if (!session) return problem(401, 'Session ended', correlationId, 'session_ended');

  let upstream: Response;
  try {
    upstream = await send(session.accessToken);
    if (upstream.status === 401) {
      const refreshed = await accessTokenFor(session, true);
      if (!refreshed) return problem(401, 'Session ended', correlationId, 'session_ended');
      upstream = await send(refreshed.accessToken);
    }
  } catch {
    return problem(502, 'Control plane unreachable', correlationId, 'upstream_unreachable');
  }

  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  if (!headers.has('x-correlation-id')) headers.set('x-correlation-id', correlationId);
  const sse = headers.get('content-type')?.startsWith('text/event-stream') ?? false;
  if (sse) headers.set('x-accel-buffering', 'no');
  // Body is streamed through unchanged. An SSE upstream that dies ends the stream cleanly so
  // the browser's EventSource sees the disconnect and reconnects.
  return new Response(sse && upstream.body ? endOnError(upstream.body) : upstream.body, { status: upstream.status, headers });
}

function endOnError(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch {
        controller.close();
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => undefined);
    },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
