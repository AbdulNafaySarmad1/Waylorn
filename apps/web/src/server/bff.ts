import 'server-only';

/**
 * Paths the browser may reach through the BFF. Anything else is rejected before a token is
 * attached. The backend still authorizes each request.
 */
const ALLOWED: readonly RegExp[] = [
  /^me$/,
  /^orgs\/[A-Za-z0-9_-]{1,64}\/(assets|topology|infrastructure|cloud|incidents|approvals|commands|audit|ai|domains|reliability|sites|hierarchy|overview)(\/[A-Za-z0-9._:~-]{1,128})*$/,
];

export function isAllowedPath(path: string): boolean {
  if (path.includes('..') || path.includes('//')) return false;
  return ALLOWED.some((re) => re.test(path));
}

export const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'idempotency-key', 'if-match', 'last-event-id'] as const;
export const FORWARDED_RESPONSE_HEADERS = ['content-type', 'etag', 'x-correlation-id', 'x-waylorn-data-source'] as const;
export const MAX_BODY_BYTES = 256 * 1024;
