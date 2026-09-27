import type { PreflightResult, SafetyClass } from '@waylorn/contracts';

/**
 * Safety-class presentation (ADR 0002, ADR 0011). The UI never assigns a class; it renders
 * what the backend returns. A missing class is treated as RED.
 */
export function effectiveSafetyClass(value: SafetyClass | undefined | null): SafetyClass {
  return value === 'GREEN' || value === 'AMBER' || value === 'RED' ? value : 'RED';
}

export interface SafetyClassPresentation {
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export const SAFETY_CLASS: Readonly<Record<SafetyClass, SafetyClassPresentation>> = {
  GREEN: {
    label: 'GREEN · Observation',
    shortLabel: 'GREEN',
    description: 'Read-only discovery or observation. Does not change asset or process state.',
  },
  AMBER: {
    label: 'AMBER · Controlled administration',
    shortLabel: 'AMBER',
    description:
      'Administrative change subject to policy evaluation and change control. Does not directly act on the physical process.',
  },
  RED: {
    label: 'RED · Physical process impact',
    shortLabel: 'RED',
    description:
      'Can affect a physical process. Requires explicit authorization, fresh re-authentication, target confirmation and an immutable audit record.',
  },
};

export type CeremonyStep = 'reason' | 'change_ticket' | 'step_up' | 'typed_confirmation' | 'second_approver';

/** Steps the operator must complete before a command can be submitted. */
export function requiredCeremony(preflight: PreflightResult): readonly CeremonyStep[] {
  const cls = effectiveSafetyClass(preflight.safetyClass);
  const steps: CeremonyStep[] = ['reason'];
  if (preflight.requirements.changeTicket) steps.push('change_ticket');
  // RED always needs fresh step-up and typed confirmation, even if a misconfigured
  // policy omits them. The backend still decides; this only prevents a weaker UI.
  if (preflight.requirements.stepUp.required || cls === 'RED') steps.push('step_up');
  if (preflight.requirements.typedConfirmation || cls === 'RED') steps.push('typed_confirmation');
  if (preflight.requirements.secondApprover) steps.push('second_approver');
  return steps;
}

export interface ConfirmationState {
  readonly nowMs: number;
  readonly typedConfirmation: string;
  /** Epoch ms of the most recent authentication, from the BFF session. */
  readonly authTimeMs: number | undefined;
  readonly acr: string | undefined;
}

export type ConfirmBlocker =
  | { readonly code: 'denied'; readonly message: string }
  | { readonly code: 'expired'; readonly message: string }
  | { readonly code: 'step_up'; readonly message: string }
  | { readonly code: 'typed_confirmation'; readonly message: string };

/**
 * Reasons the confirm control must stay disabled. An empty list does not mean the
 * command is authorized — the backend re-evaluates on submission.
 */
export function confirmBlockers(preflight: PreflightResult, state: ConfirmationState): ConfirmBlocker[] {
  const blockers: ConfirmBlocker[] = [];
  if (preflight.decision === 'deny') {
    blockers.push({ code: 'denied', message: 'Policy denied this request.' });
  }
  const expires = Date.parse(preflight.expiresAt);
  if (Number.isNaN(expires) || expires <= state.nowMs) {
    blockers.push({ code: 'expired', message: 'The policy evaluation has expired. Run the check again.' });
  }
  const steps = requiredCeremony(preflight);
  if (steps.includes('step_up') && !stepUpSatisfied(preflight, state)) {
    blockers.push({ code: 'step_up', message: 'Re-authenticate to confirm your identity for this action.' });
  }
  if (steps.includes('typed_confirmation') && state.typedConfirmation.trim() !== preflight.target.tag) {
    blockers.push({
      code: 'typed_confirmation',
      message: `Type the target tag ${preflight.target.tag} exactly to confirm.`,
    });
  }
  return blockers;
}

/** Default freshness window for RED when the policy does not specify one. */
export const RED_STEP_UP_MAX_AGE_SECONDS = 300;

export function stepUpSatisfied(preflight: PreflightResult, state: ConfirmationState): boolean {
  if (state.authTimeMs === undefined) return false;
  const required = preflight.requirements.stepUp;
  const maxAge =
    required.maxAgeSeconds ??
    (effectiveSafetyClass(preflight.safetyClass) === 'RED' ? RED_STEP_UP_MAX_AGE_SECONDS : undefined);
  if (maxAge !== undefined && state.nowMs - state.authTimeMs > maxAge * 1000) return false;
  if (required.acr !== undefined && required.acr !== state.acr) return false;
  return true;
}
