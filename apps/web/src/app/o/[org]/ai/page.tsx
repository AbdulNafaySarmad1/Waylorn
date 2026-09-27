import type { Metadata } from 'next';
import { Assistant } from '@/components/ai/Assistant';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'AI assistant' };

export default async function AssistantPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const [providers, policies] = await Promise.all([
    load(api.GET('/orgs/{orgId}/ai/providers', { params: { path: { orgId: org.id } } })),
    load(api.GET('/orgs/{orgId}/ai/policies', { params: { path: { orgId: org.id } } })),
  ]);
  return (
    <>
      <PageHeader
        title="AI assistant"
        eyebrow={org.name}
        subtitle="Optional. Answers operational questions through authorized, read-only tools with links to the underlying records."
      />
      <PageBody>
        <Section title="Conversation" flush>
          {!providers.ok ? (
            <LoadError status={providers.status} problem={providers.problem} />
          ) : (
            <Assistant providers={providers.data.items} policies={policies.ok ? policies.data.items : []} />
          )}
        </Section>
      </PageBody>
    </>
  );
}
