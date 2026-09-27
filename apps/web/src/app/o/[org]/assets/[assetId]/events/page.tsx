import type { Metadata } from 'next';
import { EventLog } from '@/components/events/EventLog';
import { PageBody, Section } from '@/components/ui/Layout';
import { assetContext } from '@/server/asset';

export const metadata: Metadata = { title: 'Events' };

export default async function Events({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { org } = await assetContext(slug, assetId);
  return (
    <PageBody>
      <Section title="Events" meta="Newest first. Filtering runs on the server." flush>
        <EventLog orgId={org.id} assetId={assetId} timeZone="UTC" />
      </Section>
    </PageBody>
  );
}
