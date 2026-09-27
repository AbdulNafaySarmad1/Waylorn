import 'server-only';

/**
 * Request time for Server Components. Server Components render once per request, so reading
 * the clock here is deterministic for that response (unlike client re-renders).
 */
export function requestTime(): number {
  return Date.now();
}
