import type { Metadata } from 'next';
import { LiveSignals } from '@/components/live/LiveSignals';
import { PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Live state' };

export default async function LiveState({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const snapshot = await load(api.GET('/orgs/{orgId}/assets/{assetId}/live', { params: { path: { orgId: org.id, assetId } } }));
  return (
    <PageBody>
      <Section title="Live signals" meta="Updates stream from the site agent via the control plane" flush>
        {!snapshot.ok ? (
          <LoadError status={snapshot.status} problem={snapshot.problem} />
        ) : (
          <LiveSignals
            url={`/api/bff/v0/orgs/${encodeURIComponent(org.id)}/assets/${encodeURIComponent(assetId)}/live/stream`}
            initial={snapshot.data.signals}
            serverNow={Date.parse(snapshot.data.serverTime)}
          />
        )}
      </Section>
    </PageBody>
  );
}
