/** Normalised access to Next.js search params (string | string[] | undefined). */
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === '' ? undefined : s;
}

export function withParams(base: string, sp: SearchParams, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s !== undefined && s !== '') params.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) params.delete(k);
    else params.set(k, v);
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}
