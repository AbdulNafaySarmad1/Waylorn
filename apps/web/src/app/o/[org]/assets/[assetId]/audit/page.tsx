import type { Metadata } from 'next';
import Link from 'next/link';
import { orgPath } from '@waylorn/domain';
import { AuditTable } from '@/components/audit/AuditTable';
import { PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Audit' };

export default async function AssetAuditView({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const res = await load(api.GET('/orgs/{orgId}/audit', { params: { path: { orgId: org.id }, query: { assetId, limit: 50 } } }));
  const records = res.ok ? res.data.items : [];
  return (
    <PageBody>
      <Section
        title="Audit"
        meta="Every audited decision and action for this asset"
        actions={<Link href={`${orgPath(slug, 'audit')}?assetId=${encodeURIComponent(assetId)}`}>Search in audit</Link>}
        flush
      >
        {!res.ok ? <LoadError status={res.status} problem={res.problem} /> : records.length === 0 ? <EmptyState title="No records" /> : <AuditTable records={records} orgSlug={slug} />}
      </Section>
    </PageBody>
  );
}
