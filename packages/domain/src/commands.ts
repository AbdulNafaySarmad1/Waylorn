import type { CommandState } from '@waylorn/contracts';

export interface CommandStatePresentation {
  readonly label: string;
  readonly description: string;
  /** True only for outcomes reconciled by the backend. */
  readonly terminal: boolean;
  readonly tone: 'neutral' | 'progress' | 'success' | 'failure' | 'warning';
}

export const COMMAND_STATE: Readonly<Record<CommandState, CommandStatePresentation>> = {
  submitted: {
    label: 'Submitted — outcome not confirmed',
    description: 'The control plane accepted the request. Nothing has been confirmed at the site.',
    terminal: false,
    tone: 'progress',
  },
  pending_approval: {
    label: 'Awaiting approval',
    description: 'A second authorized person must approve before dispatch.',
    terminal: false,
    tone: 'progress',
  },
  dispatched: {
    label: 'Dispatched — awaiting site acknowledgement',
    description: 'Sent to the site gateway. The site re-authorizes before execution.',
    terminal: false,
    tone: 'progress',
  },
  acknowledged: {
    label: 'Acknowledged by site — outcome pending',
    description: 'The site received the command. Physical outcome is not yet confirmed.',
    terminal: false,
    tone: 'progress',
  },
  succeeded: {
    label: 'Succeeded (confirmed by site)',
    description: 'The site reported a reconciled successful outcome.',
    terminal: true,
    tone: 'success',
  },
  failed: {
    label: 'Failed',
    description: 'The site reported failure. Review the audit record before any retry.',
    terminal: true,
    tone: 'failure',
  },
  rejected: {
    label: 'Rejected',
    description: 'Rejected by policy or by site-side re-authorization. Nothing was executed.',
    terminal: true,
    tone: 'failure',
  },
  expired: {
    label: 'Expired — not executed',
    description: 'The command expired before execution.',
    terminal: true,
    tone: 'warning',
  },
  unknown: {
    label: 'Unknown outcome — reconcile before retrying',
    description:
      'The outcome could not be determined (timeout or partition). Verify state at the asset before any further action.',
    terminal: true,
    tone: 'warning',
  },
};

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
