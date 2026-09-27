import type { Metadata } from 'next';
import { formatBytes } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Configuration' };

export default async function Configuration({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const res = await load(api.GET('/orgs/{orgId}/assets/{assetId}/configuration', { params: { path: { orgId: org.id, assetId } } }));
  return (
    <PageBody>
      <Section title="Configuration snapshots" meta={res.ok ? res.data.storageLocation : undefined} flush>
        {!res.ok ? (
          <LoadError status={res.status} problem={res.problem} />
        ) : res.data.items.length === 0 ? (
          <EmptyState title="No snapshots">
            Configuration cannot be read from this asset, or none has been captured. Legacy equipment often exposes no readable configuration.
          </EmptyState>
        ) : (
          <DataTable
            label="Configuration snapshots"
            caption="Snapshot contents stay in the site-local store. Digests allow change detection without moving configuration off site. Use “Request action…” to capture a new snapshot."
          >
            <thead>
              <tr>
                <th scope="col">Captured</th>
                <th scope="col">Change</th>
                <th scope="col">Digest</th>
                <th scope="col" className={tableStyles.num}>
                  Size
                </th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((s) => (
                <tr key={s.id} className={s.differsFromPrevious ? tableStyles.rowWarning : undefined}>
                  <td>
                    <Timestamp iso={s.capturedAt} />
                  </td>
                  <td>
                    {s.differsFromPrevious ? (
                      <span>
                        <Glyph shape="diamond" /> Changed{s.changeSummary ? `: ${s.changeSummary}` : ''}
                      </span>
                    ) : (
                      <span className="muted">Unchanged</span>
                    )}
                  </td>
                  <td className="mono">{s.digest.slice(0, 23)}…</td>
                  <td className={tableStyles.num}>{formatBytes(s.sizeBytes)}</td>
                  <td className="mono">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
    </PageBody>
  );
}
