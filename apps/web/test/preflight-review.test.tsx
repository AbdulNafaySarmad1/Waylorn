import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreflightReview } from '@/components/commands/PreflightReview';
import { seriousViolations } from './axe';
import { preflight } from './fixtures';

const base = { nowMs: Date.now(), typedConfirmation: '', authTimeMs: Date.now() - 3_600_000, acr: 'urn:waylorn:acr:pwd' };

describe('PreflightReview', () => {
  it('shows what, where, target, who, why and policy exactly as evaluated', () => {
    render(<PreflightReview preflight={preflight()} state={base} onTypedConfirmation={vi.fn()} onStepUp={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Request summary' });
    for (const label of ['WHAT', 'WHERE', 'TARGET', 'WHO', 'WHY', 'POLICY']) {
      expect(within(table).getByRole('rowheader', { name: label })).toBeInTheDocument();
    }
    expect(table).toHaveTextContent('150 bar → 160 bar');
    expect(table).toHaveTextContent('Munich Plant 3 (DE-MUC-P3)');
    expect(table).toHaveTextContent('PRODUCTION');
    expect(table).toHaveTextContent('ast_plc203');
    expect(table).toHaveTextContent('K. Osei via Entra ID');
    expect(table).toHaveTextContent('CHG-7');
    expect(table).toHaveTextContent('pol_ot_change v12');
  });

  it('focuses the review heading, not a confirm control', () => {
    render(<PreflightReview preflight={preflight()} state={base} onTypedConfirmation={vi.fn()} onStepUp={vi.fn()} />);
    expect(document.activeElement?.tagName).toBe('H3');
  });

  it('lists every blocker for RED until step-up and typed confirmation are satisfied', () => {
    const { rerender } = render(<PreflightReview preflight={preflight()} state={base} onTypedConfirmation={vi.fn()} onStepUp={vi.fn()} />);
    expect(screen.getByText(/Re-authenticate to confirm your identity/)).toBeInTheDocument();
    expect(screen.getByText(/Type the target tag PLC-203 exactly/)).toBeInTheDocument();
    expect(screen.getByText(/A second authorized person must approve/)).toBeInTheDocument();
    rerender(
      <PreflightReview
        preflight={preflight()}
        state={{ ...base, typedConfirmation: 'PLC-203', authTimeMs: Date.now() - 1000, acr: 'urn:waylorn:acr:mfa' }}
        onTypedConfirmation={vi.fn()}
        onStepUp={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Submission is not possible yet/)).not.toBeInTheDocument();
  });

  it('shows the policy denial and its reasons', () => {
    render(
      <PreflightReview
        preflight={preflight({ decision: 'deny', reasons: [{ code: 'capability_not_site_approved', message: 'Write is not site-approved.' }] })}
        state={base}
        onTypedConfirmation={vi.fn()}
        onStepUp={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Policy denied this request.');
    expect(screen.getByRole('alert')).toHaveTextContent('Write is not site-approved.');
  });

  it('treats a missing safety class as RED', () => {
    const p = preflight({ safetyClass: undefined as never, requirements: { stepUp: { required: false }, changeTicket: false, secondApprover: false, typedConfirmation: false } });
    render(<PreflightReview preflight={p} state={base} onTypedConfirmation={vi.fn()} onStepUp={vi.fn()} />);
    expect(screen.getByText(/RED · Physical process impact/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type the target tag/)).toBeInTheDocument();
  });

  it('has no serious accessibility violations', async () => {
    const { container } = render(<PreflightReview preflight={preflight()} state={base} onTypedConfirmation={vi.fn()} onStepUp={vi.fn()} />);
    expect(await seriousViolations(container)).toEqual([]);
  });
});
