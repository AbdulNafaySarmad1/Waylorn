import Link from 'next/link';
import type { Metadata } from 'next';
import { orgPath } from '@waylorn/domain';
import { TopologyExplorer } from '@/components/topology/TopologyExplorer';
import { PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Asset topology' };

export default async function AssetTopology({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const graph = await load(
    api.GET('/orgs/{orgId}/topology/neighborhood', { params: { path: { orgId: org.id }, query: { focus: assetId, depth: 1, nodeLimit: 80 } } }),
  );
  return (
    <PageBody>
      <Section
        title="Direct relationships"
        actions={<Link href={`${orgPath(slug, 'topology')}?focus=${encodeURIComponent(assetId)}&depth=2`}>Open in topology explorer</Link>}
        flush
      >
        {graph.ok ? (
          <TopologyExplorer key={`${graph.data.focusId}-${graph.data.computedAt}`} orgId={org.id} orgSlug={slug} initial={graph.data} compact />
        ) : (
          <LoadError status={graph.status} problem={graph.problem} />
        )}
      </Section>
    </PageBody>
  );
}
