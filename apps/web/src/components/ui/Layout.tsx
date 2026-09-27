import type { ReactNode } from 'react';
import styles from './Layout.module.css';

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function Columns({ children }: { children: ReactNode }) {
  return <div className={styles.columns}>{children}</div>;
}

export function Section({
  title,
  meta,
  actions,
  flush = false,
  children,
  id,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-h`;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHeader}>
        <h2 id={headingId}>{title}</h2>
        {meta || actions ? (
          <div className={styles.actions}>
            {meta ? <span className={styles.sectionMeta}>{meta}</span> : null}
            {actions}
          </div>
        ) : null}
      </div>
      <div className={flush ? styles.flush : styles.sectionBody}>{children}</div>
    </section>
  );
}

export function KeyValue({ items }: { items: readonly (readonly [string, ReactNode] | false | null | undefined)[] }) {
  return (
    <dl className={styles.kv}>
      {items.filter((i): i is readonly [string, ReactNode] => Boolean(i)).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProvenanceNote({ children }: { children: ReactNode }) {
  return <span className={styles.provenance}>{children}</span>;
}
