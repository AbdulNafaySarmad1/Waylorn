import { isProblem, type Problem } from '@waylorn/contracts';

export type ProblemAction = 'reauthenticate' | 'login' | 'retry' | 'none';

export interface ProblemPresentation {
  readonly title: string;
  readonly message: string;
  readonly action: ProblemAction;
  readonly correlationId: string | undefined;
}

/** Maps backend problem details to operator-facing text. Never invents authorization. */
export function presentProblem(value: unknown, fallbackStatus = 500): ProblemPresentation {
  const problem: Problem | undefined = isProblem(value) ? value : undefined;
  const status = problem?.status ?? fallbackStatus;
  const correlationId = problem?.correlationId;
  if (problem?.code === 'step_up_required') {
    return {
      title: 'Re-authentication required',
      message: 'This action requires recent strong authentication.',
      action: 'reauthenticate',
      correlationId,
    };
  }
  if (status === 401) {
    return { title: 'Session ended', message: 'Sign in again to continue.', action: 'login', correlationId };
  }
  if (status === 403) {
    return {
      title: 'Not permitted',
      message: problem?.detail ?? 'The control plane denied access for your identity and scope.',
      action: 'none',
      correlationId,
    };
  }
  if (status === 404) {
    return {
      title: 'Not found',
      message: problem?.detail ?? 'The resource does not exist or is outside your scope.',
      action: 'none',
      correlationId,
    };
  }
  if (status === 409 || status === 412) {
    return {
      title: 'Changed by someone else',
      message: problem?.detail ?? 'The resource changed since it was loaded. Reload and review before retrying.',
      action: 'retry',
      correlationId,
    };
  }
  if (status >= 500) {
    return {
      title: 'Control plane unavailable',
      message: problem?.detail ?? 'The service did not respond successfully. Data shown may be out of date.',
      action: 'retry',
      correlationId,
    };
  }
  return {
    title: problem?.title ?? 'Request failed',
    message: problem?.detail ?? `The request failed with status ${status}.`,
    action: 'none',
    correlationId,
  };
}
