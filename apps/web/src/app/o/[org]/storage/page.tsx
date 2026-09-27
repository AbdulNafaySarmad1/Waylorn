import Link from 'next/link';
import type { Metadata } from 'next';
import { formatBytes, formatPercent, humanizeToken, orgPath } from '@waylorn/domain';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { HealthStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Storage' };

export default async function Storage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const list = await load(api.GET('/orgs/{orgId}/assets', { params: { path: { orgId: org.id }, query: { kind: 'StorageAsset', limit: 25 } } }));
  const details = list.ok
    ? await Promise.all(list.data.items.map((a) => load(api.GET('/orgs/{orgId}/assets/{assetId}', { params: { path: { orgId: org.id, assetId: a.id } } }))))
    : [];
  return (
    <>
      <PageHeader title="Storage" eyebrow={org.name} subtitle="Object stores, file systems and databases that hold telemetry history and evidence." />
      <PageBody>
        <Section title="Storage assets" flush>
          {!list.ok ? (
            <LoadError status={list.status} problem={list.problem} />
          ) : list.data.items.length === 0 ? (
            <EmptyState title="No storage assets" />
          ) : (
            <DataTable label="Storage assets">
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col">Type</th>
                  <th scope="col" className={tableStyles.num}>Capacity</th>
                  <th scope="col" className={tableStyles.num}>Used</th>
                  <th scope="col" className={tableStyles.num}>Utilisation</th>
                  <th scope="col">Write-once (WORM)</th>
                  <th scope="col">Health</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d) => {
                  if (!d.ok) return null;
                  const a = d.data;
                  const ext = a.extension?.kind === 'StorageAsset' ? a.extension : undefined;
                  return (
                    <tr key={a.id}>
                      <th scope="row" className={tableStyles.primaryCell}>
                        <Link href={orgPath(slug, 'assets', a.id)} className="mono">
                          {a.tag}
                        </Link>
                        <span className={tableStyles.sub}>
                          {a.name} · {a.context.site.code}
                        </span>
                      </th>
                      <td>{ext ? humanizeToken(ext.storageType) : '—'}</td>
                      <td className={tableStyles.num}>{formatBytes(ext?.capacityBytes)}</td>
                      <td className={tableStyles.num}>{formatBytes(ext?.usedBytes)}</td>
                      <td className={tableStyles.num}>
                        {ext?.capacityBytes && ext.usedBytes !== undefined ? formatPercent(ext.usedBytes / ext.capacityBytes, 0) : '—'}
                      </td>
                      <td>{ext?.worm === undefined ? '—' : ext.worm ? 'Enabled' : 'Disabled'}</td>
                      <td>
                        <HealthStatus state={a.health.state} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </Section>
      </PageBody>
    </>
  );
}
