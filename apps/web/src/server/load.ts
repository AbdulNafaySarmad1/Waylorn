import 'server-only';
import { presentProblem, type ProblemPresentation } from '@waylorn/domain';

export type Loaded<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly problem: ProblemPresentation };

/**
 * Normalises an API call into data or an operator-facing problem. Network failures are
 * reported as an unavailable control plane, never as an empty result.
 */
export async function load<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<Loaded<T>> {
  try {
    const { data, error, response } = await request;
    if (data !== undefined && response.ok) return { ok: true, data };
    return { ok: false, status: response.status, problem: presentProblem(error, response.status) };
  } catch {
    return { ok: false, status: 502, problem: presentProblem(undefined, 502) };
  }
}
