import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { orgPath } from '@waylorn/domain';
import { PageBody, PageHeader } from '@/components/ui/Layout';
import { NotYetAvailable } from '@/components/ui/States';
import { orgContext } from '@/server/api';

/**
 * Product areas in the information architecture whose backend capability does not exist
 * yet. Each page states precisely what is missing and where related data lives today.
 */
const PLANNED: Record<string, { title: string; requires: string; meanwhile?: { label: string; segment: string[] } }> = {
  maintenance: {
    title: 'Maintenance',
    requires: 'an organization-wide work-order API from the CMMS integration',
    meanwhile: { label: 'Per-asset work orders are on each asset’s Maintenance view.', segment: ['assets'] },
  },
  telemetry: {
    title: 'Telemetry explorer',
    requires: 'a cross-asset signal catalogue and query API',
    meanwhile: { label: 'Per-asset history is on each asset’s Telemetry view.', segment: ['assets'] },
  },
  security: {
    title: 'Security posture',
    requires: 'an organization-wide findings, zone and conduit API',
    meanwhile: { label: 'Per-asset advisories and conduits are on each asset’s Security view.', segment: ['assets'] },
  },
  policies: { title: 'Policies', requires: 'a policy administration API (RBAC/ABAC rules, versions, simulation)' },
  access: { title: 'Access', requires: 'an access administration API (principals, roles, site scopes, access reviews)' },
  reports: { title: 'Reports', requires: 'a report definition and scheduling API' },
  integrations: { title: 'Integrations', requires: 'the connector registry API (ERP, MES, CMMS, SIEM, cloud connectors)' },
  administration: { title: 'Administration', requires: 'organization settings and licensing APIs' },
};

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  return { title: PLANNED[area]?.title ?? 'Not found' };
}

export default async function PlannedArea({ params }: { params: Promise<{ org: string; area: string }> }) {
  const { org: slug, area } = await params;
  const entry = PLANNED[area];
  if (!entry) notFound();
  const { org } = await orgContext(slug);
  return (
    <>
      <PageHeader title={entry.title} eyebrow={org.name} />
      <PageBody>
        <NotYetAvailable
          area={entry.title}
          requires={entry.requires}
          meanwhile={entry.meanwhile ? <Link href={orgPath(slug, ...entry.meanwhile.segment)}>{entry.meanwhile.label}</Link> : undefined}
        />
      </PageBody>
    </>
  );
}
