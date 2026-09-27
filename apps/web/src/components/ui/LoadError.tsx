import { ErrorState, PermissionState } from './States';
import type { ProblemPresentation } from '@waylorn/domain';

/** Chooses the correct state for a failed load: permission vs. failure. */
export function LoadError({ status, problem }: { status: number; problem: ProblemPresentation }) {
  if (status === 403) return <PermissionState reason={problem.message} />;
  return <ErrorState problem={problem} />;
}
