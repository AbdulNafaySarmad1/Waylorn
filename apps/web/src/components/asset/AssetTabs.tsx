'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import styles from './AssetHeader.module.css';

export const ASSET_VIEWS = [
  { segment: null, label: 'Overview' },
  { segment: 'live', label: 'Live state' },
  { segment: 'telemetry', label: 'Telemetry' },
  { segment: 'reliability', label: 'Reliability' },
  { segment: 'topology', label: 'Topology' },
  { segment: 'dependencies', label: 'Dependencies' },
  { segment: 'configuration', label: 'Configuration' },
  { segment: 'security', label: 'Security' },
  { segment: 'maintenance', label: 'Maintenance' },
  { segment: 'events', label: 'Events' },
  { segment: 'access', label: 'Access history' },
  { segment: 'audit', label: 'Audit' },
  { segment: 'integrations', label: 'Integrations' },
] as const;

/** Views are separate routes: each loads only its own data (progressive disclosure). */
export function AssetTabs({ base }: { base: string }) {
  const current = useSelectedLayoutSegment();
  return (
    <nav className={styles.tabs} aria-label="Asset views">
      {ASSET_VIEWS.map((v) => (
        <Link
          key={v.label}
          className={styles.tab}
          href={v.segment ? `${base}/${v.segment}` : base}
          aria-current={current === v.segment ? 'page' : undefined}
          scroll={false}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
