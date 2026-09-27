import type { ConnectivityState, Environment, HealthState, SafetyClass, Severity } from '@waylorn/contracts';
import {
  CONNECTIVITY,
  effectiveSafetyClass,
  ENVIRONMENT,
  FRESHNESS_DESCRIPTION,
  FRESHNESS_LABEL,
  HEALTH,
  SAFETY_CLASS,
  SEVERITY,
  type Freshness,
  type StatusPresentation,
} from '@waylorn/domain';
import { Glyph } from './Glyph';
import styles from './Status.module.css';

function StatusText({ p, label, title }: { p: StatusPresentation; label?: string; title?: string }) {
  return (
    <span className={`${styles.status} ${styles[p.tone]}`} title={title}>
      <Glyph shape={p.glyph} />
      <span className={styles.label}>{label ?? p.label}</span>
    </span>
  );
}

export function HealthStatus({ state, reason }: { state: HealthState; reason?: string | undefined }) {
  return <StatusText p={HEALTH[state]} {...(reason ? { title: reason } : {})} />;
}

export function SeverityStatus({ severity }: { severity: Severity }) {
  return <StatusText p={SEVERITY[severity]} />;
}

export function ConnectivityStatus({ state, label }: { state: ConnectivityState; label?: string }) {
  return <StatusText p={CONNECTIVITY[state]} {...(label ? { label } : {})} />;
}

const FRESH_GLYPH = { fresh: 'check', delayed: 'triangle', stale: 'cross', unknown: 'question' } as const;
const FRESH_CLASS = { fresh: styles.fresh, delayed: styles.delayed, stale: styles.stale, unknown: styles.unknownFresh } as const;

export function FreshnessStatus({ freshness }: { freshness: Freshness }) {
  return (
    <span className={`${styles.status} ${FRESH_CLASS[freshness]}`} title={FRESHNESS_DESCRIPTION[freshness]}>
      <Glyph shape={FRESH_GLYPH[freshness]} />
      <span>{FRESHNESS_LABEL[freshness]}</span>
    </span>
  );
}

/** Safety class as label + band, never colour alone. Missing class renders as RED. */
export function SafetyClassBadge({ value, long = false }: { value: SafetyClass | undefined; long?: boolean }) {
  const cls = effectiveSafetyClass(value);
  const p = SAFETY_CLASS[cls];
  return (
    <span className={`${styles.chip} ${styles[cls]}`} title={p.description}>
      <Glyph shape={cls === 'GREEN' ? 'dot' : cls === 'AMBER' ? 'triangle' : 'diamond'} size={10} />
      {long ? p.label : p.shortLabel}
    </span>
  );
}

export function EnvironmentBadge({ environment }: { environment: Environment }) {
  return (
    <span className={`${styles.env} ${styles[environment]}`} title={`Environment: ${environment}`}>
      {ENVIRONMENT[environment].label}
    </span>
  );
}
