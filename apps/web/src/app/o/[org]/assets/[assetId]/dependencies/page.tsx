import Link from 'next/link';
import type { Metadata } from 'next';
import type { ImpactAnalysis } from '@waylorn/contracts';
import { ASSET_KIND_LABEL, orgPath, RELATION_LABEL } from '@waylorn/domain';
import { Columns, PageBody, ProvenanceNote, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { HealthStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Dependencies' };

function ImpactTable({ impact, slug }: { impact: ImpactAnalysis; slug: string }) {
  if (impact.affected.length === 0) return <EmptyState title="None found over dependency relations" />;
  return (
    <DataTable label={`${impact.direction} dependencies`}>
      <thead>
        <tr>
          <th scope="col" className={tableStyles.num}>
            Hops
          </th>
          <th scope="col">Asset</th>
          <th scope="col">Kind</th>
          <th scope="col">Health</th>
        </tr>
      </thead>
      <tbody>
        {impact.affected.map((a) => (
          <tr key={a.node.id}>
            <td className={tableStyles.num}>{a.distance}</td>
            <th scope="row" className={tableStyles.primaryCell}>
              <Link href={orgPath(slug, 'assets', a.node.id)} className="mono">
                {a.node.tag}
              </Link>
              <span className={tableStyles.sub}>
                {a.node.name}
                {a.node.siteCode ? ` · ${a.node.siteCode}` : ''}
              </span>
            </th>
            <td>{ASSET_KIND_LABEL[a.node.kind]}</td>
            <td>
              <HealthStatus state={a.node.health} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default async function Dependencies({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const [down, up] = await Promise.all([
    load(api.GET('/orgs/{orgId}/topology/impact', { params: { path: { orgId: org.id }, query: { assetId, direction: 'downstream' } } })),
    load(api.GET('/orgs/{orgId}/topology/impact', { params: { path: { orgId: org.id }, query: { assetId, direction: 'upstream' } } })),
  ]);
  return (
    <PageBody>
      <Columns>
        <Section title="Impact if this asset fails" meta="Downstream: assets that depend on, are controlled by, or receive data from it" flush>
          {down.ok ? <ImpactTable impact={down.data} slug={slug} /> : <LoadError status={down.status} problem={down.problem} />}
        </Section>
        <Section title="This asset depends on" meta="Upstream: assets whose failure affects it" flush>
          {up.ok ? <ImpactTable impact={up.data} slug={slug} /> : <LoadError status={up.status} problem={up.problem} />}
        </Section>
      </Columns>
      {down.ok ? (
        <ProvenanceNote>
          Traversed relations: {down.data.relations.map((r) => RELATION_LABEL[r]).join(', ')}. Computed <Timestamp iso={down.data.computedAt} /> by the
          topology service. Relationships marked “discovered” have not been reviewed and may be incomplete.{' '}
          <Link href={`${orgPath(slug, 'topology')}?focus=${encodeURIComponent(assetId)}`}>Open in topology</Link>
        </ProvenanceNote>
      ) : null}
    </PageBody>
  );
}
