import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClass } from './Button';
import styles from './Table.module.css';

export const tableStyles = styles;

export function DataTable({ caption, children, label }: { caption?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <div className={styles.wrap} role="region" aria-label={label} tabIndex={0}>
      <table className={styles.table} aria-label={label}>
        {caption ? <caption>{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

/** Column header that re-sorts via URL (server-side sorting). */
export function SortHeader({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <th scope="col" aria-sort={active ? 'ascending' : 'none'}>
      <Link className={styles.sortLink} href={href} scroll={false}>
        {label}
        {active ? ' ▲' : ''}
      </Link>
    </th>
  );
}

/** Cursor pagination: servers return opaque cursors, so navigation is first/next. */
export function CursorPagination({
  shown,
  totalEstimate,
  nextHref,
  firstHref,
  isFirstPage,
}: {
  shown: number;
  totalEstimate: number | undefined;
  nextHref: string | undefined;
  firstHref: string;
  isFirstPage: boolean;
}) {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span aria-live="polite">
        Showing {shown}
        {totalEstimate !== undefined ? ` of about ${totalEstimate.toLocaleString('en-GB')}` : ''}
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        {isFirstPage ? null : (
          <Link className={buttonClass('default', true)} href={firstHref}>
            First page
          </Link>
        )}
        {nextHref ? (
          <Link className={buttonClass('default', true)} href={nextHref}>
            Next page
          </Link>
        ) : (
          <span className="muted">End of results</span>
        )}
      </span>
    </nav>
  );
}

/** Filters are plain GET forms: they work without JavaScript and produce linkable URLs. */
export function FilterBar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <form className={styles.filters} method="get" role="search" aria-label={label}>
      {children}
    </form>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor: string }) {
  return (
    <label className={styles.field} htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}
