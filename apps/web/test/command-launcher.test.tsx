import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, asset, preflight } from './fixtures';

const GET = vi.fn();
const POST = vi.fn();

vi.mock('@/lib/bff', () => ({
  bff: () => ({ GET, POST }),
  stepUpUrl: (r: string) => `/auth/login?stepUp=1&returnTo=${encodeURIComponent(r)}`,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/o/northwind/assets/ast_plc203',
  useSearchParams: () => new URLSearchParams(),
}));

const { CommandLauncher } = await import('@/components/commands/CommandLauncher');
const { SessionProvider } = await import('@/lib/session-context');

const session = {
  subject: 'u1',
  displayName: 'A. Keller',
  authTime: Date.now() - 60_000,
  acr: 'urn:waylorn:acr:pwd',
  csrfToken: 'csrf',
  idleExpiresAt: Date.now() + 3_600_000,
  absoluteExpiresAt: Date.now() + 3_600_000,
  orgId: 'org_1',
  orgSlug: 'northwind',
  orgName: 'Northwind',
};

function renderLauncher() {
  return render(
    <SessionProvider value={session}>
      <CommandLauncher asset={asset} />
    </SessionProvider>,
  );
}

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });

beforeEach(() => {
  GET.mockReset();
  POST.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))));
});

describe('CommandLauncher authorization UX', () => {
  it('shows unavailable actions with the backend reason instead of hiding them', async () => {
    GET.mockResolvedValue(ok({ items: actions }));
    renderLauncher();
    await userEvent.click(screen.getByRole('button', { name: 'Request action…' }));
    const red = await screen.findByRole('radio', { name: /Write ram pressure setpoint/ });
    expect(red).toBeDisabled();
    expect(screen.getByText(/Requires the controls-engineer role/)).toBeInTheDocument();
    expect(screen.getByText(/decided by the control plane/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Capture configuration snapshot/ })).toBeEnabled();
  });

  it('never offers submission when the backend denies the preflight', async () => {
    GET.mockResolvedValue(ok({ items: [{ ...actions[0]!, safetyClass: 'AMBER' as const }] }));
    POST.mockResolvedValue(ok(preflight({ safetyClass: 'AMBER', decision: 'deny', reasons: [{ code: 'rbac', message: 'Not permitted for this site.' }] })));
    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Request action…' }));
    await user.click(await screen.findByRole('radio', { name: /Capture configuration snapshot/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Routine snapshot before shift change');
    await user.click(screen.getByRole('button', { name: 'Check policy' }));
    await screen.findByText('Policy denied this request.');
    expect(screen.getByText(/Not permitted for this site/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit AMBER request/ })).toBeDisabled();
  });

  it('requires a reason before policy evaluation', async () => {
    GET.mockResolvedValue(ok({ items: [actions[0]!] }));
    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Request action…' }));
    await user.click(await screen.findByRole('radio', { name: /Capture configuration snapshot/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Check policy' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'short');
    expect(screen.getByRole('button', { name: 'Check policy' })).toBeDisabled();
    await waitFor(() => expect(POST).not.toHaveBeenCalled());
  });
});
