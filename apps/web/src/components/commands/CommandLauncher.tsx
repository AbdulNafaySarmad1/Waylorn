'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ActionDefinition, AssetDetail, CommandRecord, PreflightResult } from '@waylorn/contracts';
import {
  COMMAND_STATE,
  confirmBlockers,
  contextPath,
  effectiveSafetyClass,
  newIdempotencyKey,
  orgPath,
  presentProblem,
  type ProblemPresentation,
} from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { EnvironmentBadge, SafetyClassBadge } from '@/components/ui/Status';
import { bff, stepUpUrl } from '@/lib/bff';
import { useSession } from '@/lib/session-context';
import { useNow } from '@/lib/use-now';
import styles from './CommandLauncher.module.css';
import { saveDraft, takeDraft } from './draft';
import { PreflightReview } from './PreflightReview';

type Step = 'choose' | 'describe' | 'review' | 'outcome';

const STEP_LABELS: Record<Step, string> = {
  choose: '1 Choose action',
  describe: '2 Describe',
  review: '3 Review',
  outcome: '4 Outcome',
};

const RESUME_PARAM = 'resumeAction';
const OUTCOME_POLL_MS = 1500;
const OUTCOME_WAIT_MS = 60_000;

export function CommandLauncher({ asset }: { asset: AssetDetail }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const now = useNow();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [step, setStep] = useState<Step>('choose');
  const [actions, setActions] = useState<readonly ActionDefinition[] | undefined>();
  const [selected, setSelected] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [changeTicket, setChangeTicket] = useState('');
  const [preflight, setPreflight] = useState<PreflightResult | undefined>();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<CommandRecord | undefined>();
  const [submittedAt, setSubmittedAt] = useState(0);
  const [resumePending, setResumePending] = useState(false);
  const idempotencyKey = useRef<string>('');

  const action = actions?.find((a) => a.action === selected);

  const loadActions = useCallback(async () => {
    setProblem(undefined);
    const { data, error, response } = await bff().GET('/orgs/{orgId}/assets/{assetId}/actions', {
      params: { path: { orgId: session.orgId, assetId: asset.id } },
    });
    if (data) setActions(data.items);
    else setProblem(presentProblem(error, response.status));
  }, [asset.id, session.orgId]);

  const reset = () => {
    setStep('choose');
    setSelected('');
    setParameters({});
    setReason('');
    setChangeTicket('');
    setPreflight(undefined);
    setTyped('');
    setProblem(undefined);
    setRecord(undefined);
  };

  const open = () => {
    reset();
    void loadActions();
    dialog.current?.showModal();
  };

  const runPreflight = useCallback(
    async (input: { action: string; parameters: Record<string, string>; reason: string; changeTicket: string }) => {
      setBusy(true);
      setProblem(undefined);
      const def = actions?.find((a) => a.action === input.action);
      const typedParams: Record<string, string | number | boolean> = {};
      for (const p of def?.parameters ?? []) {
        const raw = input.parameters[p.name];
        if (raw === undefined || raw === '') continue;
        typedParams[p.name] = p.type === 'number' ? Number(raw) : p.type === 'boolean' ? raw === 'true' : raw;
      }
      const { data, error, response } = await bff().POST('/orgs/{orgId}/commands/preflight', {
        params: { path: { orgId: session.orgId } },
        body: {
          assetId: asset.id,
          action: input.action,
          parameters: typedParams,
          reason: input.reason.trim(),
          ...(input.changeTicket.trim() ? { changeTicket: input.changeTicket.trim() } : {}),
        },
      });
      setBusy(false);
      if (data) {
        setPreflight(data);
        setTyped('');
        idempotencyKey.current = newIdempotencyKey();
        setStep('review');
      } else {
        setProblem(presentProblem(error, response.status));
      }
    },
    [actions, asset.id, session.orgId],
  );

  // Resume after the step-up redirect: restore the draft and re-evaluate policy.
  useEffect(() => {
    if (search.get(RESUME_PARAM) !== '1') return;
    /* eslint-disable react-hooks/set-state-in-effect -- restores state from sessionStorage and the URL, which are only readable after mount */
    router.replace(pathname, { scroll: false });
    const draft = takeDraft(asset.id);
    if (!draft) return;
    dialog.current?.showModal();
    setSelected(draft.action);
    setParameters(draft.parameters);
    setReason(draft.reason);
    setChangeTicket(draft.changeTicket);
    setStep('describe');
    setResumePending(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void loadActions();
  }, [asset.id, loadActions, pathname, router, search]);

  // After a step-up resume only: once actions are loaded, re-evaluate policy with fresh identity.
  useEffect(() => {
    if (!resumePending || !actions) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot transition after asynchronous action load
    setResumePending(false);
    void runPreflight({ action: selected, parameters, reason, changeTicket });
  }, [actions, changeTicket, parameters, reason, resumePending, runPreflight, selected]);

  const stepUp = () => {
    saveDraft({ assetId: asset.id, action: selected, parameters, reason, changeTicket, savedAt: Date.now() });
    window.location.assign(stepUpUrl(`${pathname}?${RESUME_PARAM}=1`));
  };

  const submit = async () => {
    if (!preflight) return;
    setBusy(true);
    setProblem(undefined);
    const { data, error, response } = await bff().POST('/orgs/{orgId}/commands', {
      params: { path: { orgId: session.orgId }, header: { 'Idempotency-Key': idempotencyKey.current } },
      body: { preflightId: preflight.preflightId, ...(typed ? { typedConfirmation: typed.trim() } : {}) },
    });
    setBusy(false);
    if (data) {
      setRecord(data);
      setSubmittedAt(Date.now());
      setStep('outcome');
      return;
    }
    const p = presentProblem(error, response.status);
    setProblem(p);
    if (response.status === 409) setStep('describe');
  };

  // Track the outcome until the backend reports a reconciled terminal state.
  useEffect(() => {
    if (step !== 'outcome' || !record || COMMAND_STATE[record.state].terminal) return;
    if (Date.now() - submittedAt > OUTCOME_WAIT_MS) return;
    const t = setTimeout(() => {
      void bff()
        .GET('/orgs/{orgId}/commands/{commandId}', { params: { path: { orgId: session.orgId, commandId: record.id } } })
        .then(({ data }) => {
          if (data) setRecord(data);
        });
    }, OUTCOME_POLL_MS);
    return () => clearTimeout(t);
  }, [now, record, session.orgId, step, submittedAt]);

  const confirmationState = { nowMs: now, typedConfirmation: typed, authTimeMs: session.authTime, acr: session.acr };
  const blockers = preflight ? confirmBlockers(preflight, confirmationState) : [];
  const cls = effectiveSafetyClass(preflight?.safetyClass ?? action?.safetyClass);
  const canDescribe = Boolean(action?.availability.available);
  const reasonValid = reason.trim().length >= 10;
  const paramsValid = (action?.parameters ?? []).every((p) => !p.required || (parameters[p.name] ?? '') !== '');

  return (
    <>
      <Button onClick={open} aria-haspopup="dialog">
        Request action…
      </Button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onClose={() => router.refresh()}>
        <div className={styles.head}>
          <div>
            <h2 id={titleId}>
              Request an action on <span className="mono">{asset.tag}</span>
            </h2>
            <div className={styles.context}>
              <EnvironmentBadge environment={asset.context.site.environment} />
              <span>{contextPath(asset.context)}</span>
            </div>
          </div>
          <Button variant="quiet" small onClick={() => dialog.current?.close()} aria-label="Close">
            Close
          </Button>
        </div>

        <div className={styles.body}>
          <ol className={styles.steps} aria-label="Progress">
            {(Object.keys(STEP_LABELS) as Step[]).map((s) => (
              <li key={s} aria-current={s === step ? 'step' : undefined}>
                {STEP_LABELS[s]}
              </li>
            ))}
          </ol>

          {problem ? <ErrorState problem={problem} /> : null}

          {step === 'choose' ? (
            actions === undefined ? (
              <p role="status">Loading actions defined for this asset…</p>
            ) : actions.length === 0 ? (
              <p>No actions are defined for this asset. Observation continues through the site agent.</p>
            ) : (
              <fieldset className={styles.actions}>
                <legend className="visually-hidden">Action</legend>
                {actions.map((a) => (
                  <label key={a.action} className={styles.action}>
                    <input
                      type="radio"
                      name="action"
                      value={a.action}
                      checked={selected === a.action}
                      disabled={!a.availability.available}
                      onChange={() => setSelected(a.action)}
                    />
                    <strong>{a.label}</strong>
                    <SafetyClassBadge value={a.safetyClass} />
                    <span className={styles.actionDesc}>{a.description}</span>
                    {!a.availability.available ? (
                      <span className={styles.unavailable}>
                        Unavailable: {a.availability.reason ?? 'not permitted'}{' '}
                        <span className="muted">(decided by the control plane)</span>
                      </span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
            )
          ) : null}

          {step === 'describe' && action ? (
            <div className={styles.form}>
              <div>
                <strong>{action.label}</strong> <SafetyClassBadge value={action.safetyClass} long />
                <p className="secondary">{action.description}</p>
              </div>
              {action.parameters.map((p) => (
                <label key={p.name} className={styles.field}>
                  <span>
                    {p.label}
                    {p.unit ? ` (${p.unit})` : ''}
                    {p.required ? ' — required' : ''}
                  </span>
                  {p.type === 'enum' ? (
                    <select value={parameters[p.name] ?? ''} onChange={(e) => setParameters({ ...parameters, [p.name]: e.target.value })}>
                      <option value="">Choose…</option>
                      {(p.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={p.type === 'number' ? 'number' : 'text'}
                      value={parameters[p.name] ?? ''}
                      {...(p.min !== undefined ? { min: p.min } : {})}
                      {...(p.max !== undefined ? { max: p.max } : {})}
                      onChange={(e) => setParameters({ ...parameters, [p.name]: e.target.value })}
                    />
                  )}
                  {p.min !== undefined || p.max !== undefined ? (
                    <span className="hint">
                      Allowed range {p.min ?? '−∞'} – {p.max ?? '∞'} {p.unit ?? ''}. The control plane validates the value.
                    </span>
                  ) : null}
                </label>
              ))}
              <label className={styles.field}>
                <span>Reason — required, recorded in the audit trail</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} minLength={10} />
                <span className="hint">{reason.trim().length < 10 ? `At least 10 characters (${reason.trim().length} so far).` : ' '}</span>
              </label>
              {action.safetyClass !== 'GREEN' ? (
                <label className={styles.field}>
                  <span>Change ticket reference</span>
                  <input type="text" value={changeTicket} onChange={(e) => setChangeTicket(e.target.value)} maxLength={100} />
                  <span className="hint">Policy for {action.safetyClass} actions normally requires an approved change ticket.</span>
                </label>
              ) : null}
            </div>
          ) : null}

          {step === 'review' && preflight ? (
            <PreflightReview preflight={preflight} state={confirmationState} onTypedConfirmation={setTyped} onStepUp={stepUp} />
          ) : null}

          {step === 'outcome' && record ? (
            <div className={styles.outcome} role="status" aria-live="polite">
              <strong>{COMMAND_STATE[record.state].label}</strong>
              <span>{record.detail ?? COMMAND_STATE[record.state].description}</span>
              {!COMMAND_STATE[record.state].terminal && now - submittedAt > OUTCOME_WAIT_MS ? (
                <span>
                  <strong>No confirmed outcome after 60 seconds.</strong> Do not assume the action took effect. Verify at the asset before
                  any further action.
                </span>
              ) : null}
              <span className="muted">
                Command <span className="mono">{record.id}</span> · correlation{' '}
                <Link href={`${orgPath(session.orgSlug, 'audit')}?correlationId=${encodeURIComponent(record.correlationId)}`}>
                  {record.correlationId}
                </Link>
              </span>
            </div>
          ) : null}
        </div>

        <div className={styles.foot}>
          <div>
            {step === 'describe' || step === 'review' ? (
              <Button onClick={() => setStep(step === 'review' ? 'describe' : 'choose')} disabled={busy}>
                Back
              </Button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => dialog.current?.close()}>{step === 'outcome' ? 'Close' : 'Cancel'}</Button>
            {step === 'choose' ? (
              <Button variant="primary" disabled={!canDescribe} onClick={() => setStep('describe')}>
                Continue
              </Button>
            ) : null}
            {step === 'describe' ? (
              <Button
                variant="primary"
                disabled={busy || !reasonValid || !paramsValid}
                onClick={() => void runPreflight({ action: selected, parameters, reason, changeTicket })}
              >
                {busy ? 'Checking policy…' : 'Check policy'}
              </Button>
            ) : null}
            {step === 'review' ? (
              <Button
                variant={cls === 'RED' ? 'danger' : 'primary'}
                disabled={busy || blockers.length > 0}
                onClick={() => void submit()}
              >
                {busy ? 'Submitting…' : cls === 'GREEN' ? 'Submit request' : `Submit ${cls} request`}
              </Button>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
