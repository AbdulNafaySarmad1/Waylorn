import type { ReactNode } from 'react';
import type { ProblemPresentation } from '@waylorn/domain';
import { Glyph } from './Glyph';
import styles from './States.module.css';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <h3>{title}</h3>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

/** Failure to load. Shows the correlation ID so operators can quote it to support. */
export function ErrorState({ problem, children }: { problem: ProblemPresentation; children?: ReactNode }) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <h3>
        <Glyph shape="cross" /> {problem.title}
      </h3>
      <p>{problem.message}</p>
      {children}
      {problem.correlationId ? <p className={styles.meta}>Correlation ID: <code>{problem.correlationId}</code></p> : null}
    </div>
  );
}

/** The backend denied access. Explains; never implies the UI made the decision. */
export function PermissionState({ title = 'Not permitted', reason }: { title?: string; reason: string }) {
  return (
    <div className={`${styles.state} ${styles.permission}`}>
      <h3>
        <Glyph shape="slash" /> {title}
      </h3>
      <p>{reason}</p>
      <p className={styles.meta}>Access decisions are made by the control plane for your identity, role and site scope.</p>
    </div>
  );
}

export function DegradedNotice({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.inline} ${styles.degraded}`} role="status">
      <Glyph shape="triangle" />
      <div>{children}</div>
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'fixture' | 'degraded' | 'fault'; children: ReactNode }) {
  const cls = tone === 'fixture' ? styles.bannerFixture : tone === 'degraded' ? styles.bannerDegraded : styles.bannerFault;
  return (
    <div className={`${styles.banner} ${cls}`} role={tone === 'fault' ? 'alert' : 'note'}>
      <Glyph shape={tone === 'fault' ? 'cross' : 'triangle'} />
      <div>{children}</div>
    </div>
  );
}

/**
 * For product areas whose backend capability does not exist yet. States exactly what is
 * missing instead of rendering placeholder data.
 */
export function NotYetAvailable({ area, requires, meanwhile }: { area: string; requires: string; meanwhile?: ReactNode }) {
  return (
    <div className={`${styles.state} ${styles.permission}`}>
      <h2>{area} is not available in this build</h2>
      <p>
        This area needs <strong>{requires}</strong>, which the control plane does not provide yet. No data is shown rather than
        placeholder values.
      </p>
      {meanwhile ? <div>{meanwhile}</div> : null}
    </div>
  );
}
