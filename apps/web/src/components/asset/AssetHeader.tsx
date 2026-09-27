import type { ReactNode } from 'react';
import type { AssetDetail } from '@waylorn/contracts';
import { ASSET_KIND_LABEL, contextSegments, LIFECYCLE_LABEL } from '@waylorn/domain';
import { Age } from '@/components/ui/Age';
import { ConnectivityStatus, EnvironmentBadge, HealthStatus } from '@/components/ui/Status';
import { AssetTabs } from './AssetTabs';
import styles from './AssetHeader.module.css';

const IDENTITY = {
  confirmed: 'Identity confirmed',
  probable: 'Identity probable — not fully reconciled',
  unverified: 'Identity unverified — discovered claim only',
} as const;

/**
 * Persistent asset header. The full tenancy path and environment are always visible so the
 * operator can never mistake which plant and asset a view or action refers to.
 */
export function AssetHeader({ asset, base, actions }: { asset: AssetDetail; base: string; actions?: ReactNode }) {
  return (
    <div className={styles.header}>
      <div className={styles.context}>
        <EnvironmentBadge environment={asset.context.site.environment} />
        <ol className={styles.path} aria-label="Location">
          {contextSegments(asset.context).map((s) => (
            <li key={s.level}>
              <span className="visually-hidden">{s.level}: </span>
              {s.label}
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.main}>
        <div>
          <h1 className={styles.title}>
            <span className={styles.tag}>{asset.tag}</span>
            <span className={styles.name}>{asset.name}</span>
          </h1>
          <div className={styles.facts}>
            <span>{ASSET_KIND_LABEL[asset.kind]}</span>
            {asset.manufacturer ? (
              <span>
                {asset.manufacturer}
                {asset.model ? ` ${asset.model}` : ''}
              </span>
            ) : null}
            <span>
              <HealthStatus state={asset.health.state} reason={asset.health.reason} />
              {asset.health.reason ? <span>— {asset.health.reason}</span> : null}
            </span>
            <span>
              <ConnectivityStatus state={asset.connectivity.state} /> seen <Age iso={asset.connectivity.lastSeenAt} />
            </span>
            <span>{LIFECYCLE_LABEL[asset.lifecycle]}</span>
            <span>{IDENTITY[asset.identityConfidence]}</span>
            <span className="mono muted" title="Stable asset identifier">
              {asset.id}
            </span>
          </div>
        </div>
        {actions}
      </div>
      <AssetTabs base={base} />
    </div>
  );
}
