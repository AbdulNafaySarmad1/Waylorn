'use client';

import { useEffect, useRef } from 'react';
import type { PreflightResult } from '@waylorn/contracts';
import {
  confirmBlockers,
  contextPath,
  effectiveSafetyClass,
  formatTimestamp,
  requiredCeremony,
  SAFETY_CLASS,
  stepUpSatisfied,
  type ConfirmationState,
} from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { Button } from '@/components/ui/Button';
import { EnvironmentBadge, SafetyClassBadge } from '@/components/ui/Status';
import styles from './CommandLauncher.module.css';

export interface PreflightReviewProps {
  readonly preflight: PreflightResult;
  readonly state: ConfirmationState;
  readonly onTypedConfirmation: (value: string) => void;
  readonly onStepUp: () => void;
}

/**
 * The review shown before any consequential submission: WHAT, WHERE, TARGET, WHO, WHY and
 * POLICY exactly as evaluated by the backend, plus the ceremony still required.
 */
export function PreflightReview({ preflight, state, onTypedConfirmation, onStepUp }: PreflightReviewProps) {
  const cls = effectiveSafetyClass(preflight.safetyClass);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = requiredCeremony(preflight);
  // A denial is already explained above with the backend's reasons.
  const blockers = confirmBlockers(preflight, state).filter((b) => b.code !== 'denied');
  const t = preflight.target;

  useEffect(() => {
    // Focus the review, never the confirm control.
    heading.current?.focus();
  }, [preflight.preflightId]);

  return (
    <div className={styles.form}>
      <div className={`${styles.classBanner} ${styles[cls]}`}>
        <h3 ref={heading} tabIndex={-1}>
          <SafetyClassBadge value={cls} long /> Review before submitting
        </h3>
        <p>{SAFETY_CLASS[cls].description}</p>
      </div>

      {preflight.decision !== 'permit' ? (
        <div className={styles.denied} role="alert">
          <strong>{preflight.decision === 'deny' ? 'Policy denied this request.' : 'Policy requires approval before execution.'}</strong>
          {preflight.reasons.length > 0 ? (
            <ul className={styles.blockers}>
              {preflight.reasons.map((r) => (
                <li key={r.code}>
                  {r.message} <span className="muted">({r.code})</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <table className={styles.review}>
        <caption className="visually-hidden">Request summary</caption>
        <tbody>
          <tr>
            <th scope="row">WHAT</th>
            <td>
              <div>{preflight.effect.summary}</div>
              {preflight.effect.parameters.map((p) => (
                <div key={p.label} className={styles.change}>
                  {p.label}: {p.previousValue ? `${p.previousValue} → ` : ''}
                  <strong>{p.value}</strong>
                </div>
              ))}
            </td>
          </tr>
          <tr>
            <th scope="row">WHERE</th>
            <td>
              <EnvironmentBadge environment={t.context.site.environment} /> {contextPath(t.context)}
            </td>
          </tr>
          <tr>
            <th scope="row">TARGET</th>
            <td>
              <strong className="mono">{t.tag}</strong> — {t.name}
              <div className="muted">
                {[t.manufacturer, t.model].filter(Boolean).join(' ')} · ID <span className="mono">{t.id}</span>
              </div>
            </td>
          </tr>
          <tr>
            <th scope="row">WHO</th>
            <td>
              {preflight.requestedBy.displayName}
              {preflight.requestedBy.identityProvider ? ` via ${preflight.requestedBy.identityProvider.displayName}` : ''}
            </td>
          </tr>
          <tr>
            <th scope="row">WHY</th>
            <td>
              {preflight.reason}
              {preflight.changeTicket ? <div>Change ticket: {preflight.changeTicket}</div> : null}
            </td>
          </tr>
          <tr>
            <th scope="row">POLICY</th>
            <td>
              {preflight.policy ? (
                <>
                  {preflight.policy.name} <span className="muted">({preflight.policy.id} v{preflight.policy.version})</span>
                  {preflight.policy.rule ? <div className="mono muted">{preflight.policy.rule}</div> : null}
                </>
              ) : (
                <span className="muted">No policy reference returned</span>
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">VALID UNTIL</th>
            <td>{formatTimestamp(preflight.expiresAt, 'UTC')} — the check must be repeated after this time.</td>
          </tr>
        </tbody>
      </table>

      {preflight.decision === 'permit' ? (
        <ul className={styles.checklist} aria-label="Required before submission">
          {steps.includes('step_up') ? (
            <li>
              <Glyph shape={stepUpSatisfied(preflight, state) ? 'check' : 'triangle'} />
              <div>
                <strong>Recent strong authentication</strong>{' '}
                {stepUpSatisfied(preflight, state) ? (
                  <span>— satisfied.</span>
                ) : (
                  <>
                    <span>— required. You will return here after re-authenticating.</span>{' '}
                    <Button small onClick={onStepUp}>
                      Re-authenticate
                    </Button>
                  </>
                )}
              </div>
            </li>
          ) : null}
          {steps.includes('typed_confirmation') ? (
            <li>
              <Glyph shape={state.typedConfirmation.trim() === t.tag ? 'check' : 'triangle'} />
              <label className={styles.field}>
                <strong>
                  Type the target tag <span className="mono">{t.tag}</span> to confirm the asset
                </strong>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={state.typedConfirmation}
                  onChange={(e) => onTypedConfirmation(e.target.value)}
                  aria-describedby="typed-hint"
                />
                <span id="typed-hint" className="hint">
                  Must match exactly, including case.
                </span>
              </label>
            </li>
          ) : null}
          {steps.includes('second_approver') ? (
            <li>
              <Glyph shape="dot" />
              <div>A second authorized person must approve after you submit. Nothing is dispatched before approval.</div>
            </li>
          ) : null}
        </ul>
      ) : null}

      {blockers.length > 0 ? (
        <div>
          <strong>Submission is not possible yet:</strong>
          <ul className={styles.blockers}>
            {blockers.map((b) => (
              <li key={b.code}>{b.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
