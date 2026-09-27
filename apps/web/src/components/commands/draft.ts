/**
 * Unsent command draft preserved across the step-up redirect. Contains only operator input
 * (action, parameters, reason, ticket) — no tokens or preflight results — and lives in
 * sessionStorage for this tab only.
 */
export interface CommandDraft {
  readonly assetId: string;
  readonly action: string;
  readonly parameters: Record<string, string>;
  readonly reason: string;
  readonly changeTicket: string;
  readonly savedAt: number;
}

const KEY = 'waylorn:command-draft';
const MAX_AGE_MS = 10 * 60_000;

export function saveDraft(draft: CommandDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the operator re-enters the request after re-authenticating.
  }
}

export function takeDraft(assetId: string, now = Date.now()): CommandDraft | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return undefined;
    const d = JSON.parse(raw) as CommandDraft;
    if (d.assetId !== assetId || now - d.savedAt > MAX_AGE_MS) return undefined;
    return d;
  } catch {
    return undefined;
  }
}
