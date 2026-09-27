'use client';

import { createControlPlaneClient, type ControlPlaneClient } from '@waylorn/contracts';
import { CSRF_HEADER } from './cookies';
import { csrfToken } from './session-context';

let client: ControlPlaneClient | undefined;

/**
 * Browser-side API client. Same generated types as the server; requests go to the BFF,
 * which attaches the access token. Mutations carry the session-bound CSRF token.
 */
export function bff(): ControlPlaneClient {
  if (client) return client;
  client = createControlPlaneClient({ baseUrl: '/api/bff/v0' });
  client.use({
    onRequest({ request }) {
      if (request.method !== 'GET') {
        const token = csrfToken();
        if (token) request.headers.set(CSRF_HEADER, token);
      }
      return request;
    },
    onResponse({ response }) {
      if (response.status === 401) window.dispatchEvent(new CustomEvent('waylorn:reachability', { detail: 'session_ended' }));
      if (response.status === 502 || response.status === 503) {
        window.dispatchEvent(new CustomEvent('waylorn:reachability', { detail: 'unreachable' }));
      }
      return response;
    },
  });
  return client;
}

export function stepUpUrl(returnTo: string): string {
  return `/auth/login?stepUp=1&returnTo=${encodeURIComponent(returnTo)}`;
}
