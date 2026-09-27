import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createControlPlaneClient, DATA_SOURCE_HEADER, type ControlPlaneClient, type Principal } from '@waylorn/contracts';
import { serverConfig } from './config';
import { accessTokenFor, readSession, toPublic, type PublicSession, type Session } from './auth/session';

export interface RequestContext {
  readonly session: Session;
  readonly api: ControlPlaneClient;
  readonly principal: Principal;
  readonly publicSession: PublicSession;
  /** True when the backend identifies itself as development fixture data. */
  readonly fixtureData: boolean;
}

async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get('x-invoke-path') ?? '/';
}

function clientFor(token: string): ControlPlaneClient {
  const api = createControlPlaneClient({ baseUrl: `${serverConfig().apiBaseUrl}/api/v0` });
  api.use({
    onRequest({ request }) {
      request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
  });
  return api;
}

async function fetchMe(api: ControlPlaneClient) {
  try {
    return await api.GET('/me', { cache: 'no-store' });
  } catch {
    return undefined;
  }
}

/**
 * Per-request context for Server Components: validated session, token-bearing API client,
 * and the principal as the backend sees it. Memoised for the duration of one render.
 */
export const requestContext = cache(async (): Promise<RequestContext> => {
  let session = await readSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(await currentPath())}`);
  session = await accessTokenFor(session);
  if (!session) redirect('/auth/login');
  const api = clientFor(session.accessToken);
  const me = await fetchMe(api);
  if (!me) throw new Error('Control plane unavailable');
  const { data, response } = me;
  if (!data) {
    if (response.status === 401) redirect('/auth/login');
    throw new Error('Control plane unavailable');
  }
  return {
    session,
    api,
    principal: data,
    publicSession: toPublic(session),
    fixtureData: response.headers.get(DATA_SOURCE_HEADER) === 'fixture',
  };
});

export interface OrgContext extends RequestContext {
  readonly org: Principal['organizations'][number];
}

/** Resolves the URL's organization slug against the principal's organizations (tenant boundary). */
export const orgContext = cache(async (slug: string): Promise<OrgContext> => {
  const ctx = await requestContext();
  const org = ctx.principal.organizations.find((o) => o.slug === slug);
  if (!org) notFound();
  return { ...ctx, org };
});
