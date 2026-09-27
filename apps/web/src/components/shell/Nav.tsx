'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { orgPath } from '@waylorn/domain';
import { NAVIGATION } from '@/lib/navigation';
import styles from './Shell.module.css';

function isCurrent(pathname: string, href: string): boolean {
  if (href.endsWith('/ai')) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  return (
    <>
      {NAVIGATION.map((group) => (
        <div key={group.id} className={styles.navGroup}>
          <div className={styles.navGroupLabel} id={`nav-${group.id}`}>
            {group.label}
          </div>
          <ul className={styles.navList} aria-labelledby={`nav-${group.id}`}>
            {group.items.map((item) => {
              const href = orgPath(orgSlug, ...item.segment.split('/'));
              return (
                <li key={item.segment}>
                  <Link className={styles.navLink} href={href} aria-current={isCurrent(pathname, href) ? 'page' : undefined}>
                    <span>{item.label}</span>
                    {item.available ? null : <span className={styles.navPlanned}>planned</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function SideNav({ orgSlug }: { orgSlug: string }) {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <NavLinks orgSlug={orgSlug} />
    </nav>
  );
}
