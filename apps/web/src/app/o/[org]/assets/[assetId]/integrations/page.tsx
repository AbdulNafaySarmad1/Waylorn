import type { Metadata } from 'next';
import { PageBody, Section } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { assetContext } from '@/server/asset';

export const metadata: Metadata = { title: 'Integrations' };

export default async function Integrations({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { asset } = await assetContext(slug, assetId);
  if (!asset.ok) return null;
  const refs = asset.data.externalReferences;
  return (
    <PageBody>
      <Section title="External systems" meta="Identifiers of this asset in ERP, CMMS, CMDB and other systems" flush>
        {refs.length === 0 ? (
          <EmptyState title="Not linked to external systems" />
        ) : (
          <DataTable label="External references">
            <thead>
              <tr>
                <th scope="col">System</th>
                <th scope="col">External ID</th>
                <th scope="col">Last synchronised</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={`${r.system}-${r.externalId}`}>
                  <th scope="row">{r.system}</th>
                  <td className="mono">{r.href ? <a href={r.href} rel="noreferrer noopener">{r.externalId}</a> : r.externalId}</td>
                  <td>
                    <Timestamp iso={r.syncedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
    </PageBody>
  );
}
