import type { Metadata } from 'next';
import { computePlatformValues } from '@waylorn/contracts';
import { humanizeToken } from '@waylorn/domain';
import { HostTable } from '@/components/infra/HostTable';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { Field, FilterBar } from '@/components/ui/Table';
import { param, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Infrastructure' };

export default async function Infrastructure({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { api, org } = await orgContext(slug);
  const platform = computePlatformValues.find((p) => p === param(sp, 'platform'));
  const res = await load(
    api.GET('/orgs/{orgId}/infrastructure/hosts', { params: { path: { orgId: org.id }, query: { limit: 100, ...(platform ? { platform } : {}) } } }),
  );
  return (
    <>
      <PageHeader
        title="Infrastructure"
        eyebrow={org.name}
        subtitle="Servers, Kubernetes nodes and Podman hosts supporting the control plane and site services — bare metal, Hetzner, AWS, Azure, GCP, private cloud and customer datacenters."
      />
      <PageBody>
        <Section title="Hosts" flush>
          <FilterBar label="Filter hosts">
            <Field label="Platform" htmlFor="platform">
              <select id="platform" name="platform" defaultValue={platform ?? ''}>
                <option value="">All platforms</option>
                {computePlatformValues.map((p) => (
                  <option key={p} value={p}>
                    {humanizeToken(p)}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={buttonClass('primary')}>
              Apply
            </button>
          </FilterBar>
          {!res.ok ? (
            <LoadError status={res.status} problem={res.problem} />
          ) : res.data.items.length === 0 ? (
            <EmptyState title="No hosts report to this organization" />
          ) : (
            <HostTable hosts={res.data.items} orgSlug={slug} />
          )}
        </Section>
      </PageBody>
    </>
  );
}
