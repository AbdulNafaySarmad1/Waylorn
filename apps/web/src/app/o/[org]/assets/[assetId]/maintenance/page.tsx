import type { Metadata } from 'next';
import { humanizeToken } from '@waylorn/domain';
import { PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Maintenance' };

export default async function Maintenance({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const res = await load(api.GET('/orgs/{orgId}/assets/{assetId}/maintenance', { params: { path: { orgId: org.id, assetId } } }));
  return (
    <PageBody>
      <Section title="Work orders" meta="Read from the maintenance system of record" flush>
        {!res.ok ? (
          <LoadError status={res.status} problem={res.problem} />
        ) : res.data.items.length === 0 ? (
          <EmptyState title="No work orders" />
        ) : (
          <DataTable label="Work orders">
            <thead>
              <tr>
                <th scope="col">Work order</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Due</th>
                <th scope="col">Completed</th>
                <th scope="col">System</th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((w) => (
                <tr key={w.id}>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    <span className="mono">{w.id}</span> {w.title}
                  </th>
                  <td>{humanizeToken(w.type)}</td>
                  <td>{humanizeToken(w.status)}</td>
                  <td>
                    <Timestamp iso={w.dueAt} seconds={false} />
                  </td>
                  <td>
                    <Timestamp iso={w.completedAt} seconds={false} />
                  </td>
                  <td>{w.system}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
    </PageBody>
  );
}
