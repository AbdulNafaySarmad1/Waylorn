'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatAge, formatTimestamp, orgPath } from '@waylorn/domain';
import type { Principal } from '@waylorn/contracts';
import { Glyph } from '@/components/ui/Glyph';
import type { ThemePreference } from '@/lib/cookies';
import { useSession, type ControlPlaneReachability } from '@/lib/session-context';
import { useDetailsDismiss } from '@/lib/use-dismiss';
import { useNow } from '@/lib/use-now';
import { NavLinks } from './Nav';
import styles from './Shell.module.css';
import { ThemeControl } from './ThemeControl';

function Reachability() {
  const [state, setState] = useState<ControlPlaneReachability | 'offline'>('reachable');
  const [lastOk, setLastOk] = useState<string>(() => new Date().toISOString());
  const now = useNow();
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<ControlPlaneReachability>).detail;
      setState(detail);
      if (detail === 'reachable') setLastOk(new Date().toISOString());
    };
    const offline = () => setState('offline');
    const online = () => setState('reachable');
    window.addEventListener('waylorn:reachability', onEvent);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('waylorn:reachability', onEvent);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);
  const label =
    state === 'reachable'
      ? 'Control plane reachable'
      : state === 'offline'
        ? 'Browser offline'
        : state === 'session_ended'
          ? 'Session ended'
          : `Control plane unreachable (last OK ${formatAge(lastOk, now)})`;
  return (
    <span className={styles.barItem} role="status" aria-live="polite" data-testid="reachability">
      <Glyph shape={state === 'reachable' ? 'check' : state === 'session_ended' ? 'slash' : 'triangle'} />
      <span className={state === 'reachable' ? styles.hideNarrow : undefined}>{label}</span>
    </span>
  );
}

function UtcClock() {
  const now = useNow();
  return (
    <span className={`${styles.barItem} ${styles.hideNarrow} mono`} aria-label="Coordinated Universal Time" suppressHydrationWarning>
      {formatTimestamp(new Date(now).toISOString(), 'UTC', { date: false })}
    </span>
  );
}

export function ContextBar({
  organizations,
  identityProvider,
  roles,
  theme,
}: {
  organizations: Principal['organizations'];
  identityProvider: string;
  roles: readonly string[];
  theme: ThemePreference;
}) {
  const session = useSession();
  const now = useNow();
  const orgMenu = useDetailsDismiss();
  const userMenu = useDetailsDismiss();
  const navMenu = useDetailsDismiss();
  const strong = session.acr?.endsWith(':mfa') === true;
  return (
    <div className={styles.bar}>
      <details className={`${styles.menu} ${styles.mobileNav}`} ref={navMenu}>
        <summary aria-label="Navigation menu">Menu</summary>
        <nav className={styles.menuPanel} aria-label="Primary (compact)">
          <NavLinks orgSlug={session.orgSlug} />
        </nav>
      </details>
      <Link className={styles.brand} href={orgPath(session.orgSlug, 'overview')}>
        WAYLORN
      </Link>
      <span className={styles.divider} aria-hidden="true" />
      <details className={styles.menu} ref={orgMenu}>
        <summary aria-label={`Organization: ${session.orgName}. Change organization`}>
          <span className="visually-hidden">Organization:</span>
          <strong>{session.orgName}</strong>
        </summary>
        <div className={styles.menuPanel}>
          <div className={styles.menuSection}>Organizations you can access</div>
          {organizations.map((o) => (
            <a key={o.id} href={orgPath(o.slug, 'overview')} aria-current={o.slug === session.orgSlug ? 'true' : undefined}>
              {o.name}
            </a>
          ))}
          <div className={styles.menuSection}>Switching organization reloads every view. Open work is not carried over.</div>
        </div>
      </details>
      <button
        type="button"
        className={styles.searchButton}
        onClick={() => window.dispatchEvent(new Event('waylorn:palette'))}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <span className="searchLabel">Go to asset, site or area…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span className={styles.spacer} />
      <Reachability />
      <span className={styles.divider} aria-hidden="true" />
      <UtcClock />
      <details className={styles.menu} ref={userMenu}>
        <summary>
          <span className="visually-hidden">Signed in as</span>
          {session.displayName}
        </summary>
        <div className={`${styles.menuPanel} ${styles.menuPanelRight}`}>
          <div className={styles.menuSection}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>{session.displayName}</strong>
            </div>
            <div>via {identityProvider}</div>
            <div>Roles in {session.orgName}: {roles.join(', ') || 'none'}</div>
            <div suppressHydrationWarning>
              Authenticated {formatAge(new Date(session.authTime).toISOString(), now)}
              {strong ? ' with MFA' : ''}
            </div>
          </div>
          <div className={styles.menuSection}>
            <ThemeControl initial={theme} />
          </div>
          <div className={styles.menuSection} style={{ padding: 0 }}>
            <form method="post" action="/auth/logout">
              <input type="hidden" name="csrf" value={session.csrfToken} />
              <button type="submit" className={styles.menuLink}>
                Sign out
              </button>
            </form>
            <form method="post" action="/auth/logout">
              <input type="hidden" name="csrf" value={session.csrfToken} />
              <input type="hidden" name="intent" value="switch" />
              <button type="submit" className={styles.menuLink}>
                Switch account
              </button>
            </form>
          </div>
        </div>
      </details>
    </div>
  );
}
