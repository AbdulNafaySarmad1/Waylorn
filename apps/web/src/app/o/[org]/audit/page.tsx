import Link from 'next/link';
import type { Metadata } from 'next';
import { orgPath } from '@waylorn/domain';
import { AuditTable } from '@/components/audit/AuditTable';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { CursorPagination, Field, FilterBar } from '@/components/ui/Table';
import { param, withParams, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';
import { AuditExport } from './AuditExport';

export const metadata: Metadata = { title: 'Audit' };

function toIso(local: string | undefined): string | undefined {
  if (!local) return undefined;
  const t = Date.parse(`${local}Z`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export default async function Audit({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { api, org } = await orgContext(slug);
  const q = param(sp, 'q');
  const decision = param(sp, 'decision') === 'deny' ? 'deny' : param(sp, 'decision') === 'permit' ? 'permit' : undefined;
  const correlationId = param(sp, 'correlationId');
  const assetId = param(sp, 'assetId');
  const from = toIso(param(sp, 'from'));
  const to = toIso(param(sp, 'to'));
  const cursor = param(sp, 'cursor');
  const filters: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(decision ? { decision } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const res = await load(
    api.GET('/orgs/{orgId}/audit', { params: { path: { orgId: org.id }, query: { limit: 50, ...filters, ...(cursor ? { cursor } : {}) } } }),
  );
  const base = orgPath(slug, 'audit');
  return (
    <>
      <PageHeader
        title="Audit"
        eyebrow={org.name}
        subtitle="Decisions and actions by people, services, connectors and the AI assistant. Records are immutable; search runs on the server."
        actions={res.ok ? <AuditExport permitted={res.data.exportPermitted} filters={filters} /> : null}
      />
      <PageBody>
        <Section title="Records" flush>
          <FilterBar label="Search audit">
            <Field label="Text (actor, asset tag, action, summary)" htmlFor="q">
              <input id="q" name="q" type="search" defaultValue={q ?? ''} />
            </Field>
            <Field label="Decision" htmlFor="decision">
              <select id="decision" name="decision" defaultValue={decision ?? ''}>
                <option value="">Any</option>
                <option value="permit">Permitted</option>
                <option value="deny">Denied</option>
              </select>
            </Field>
            <Field label="Correlation ID" htmlFor="correlationId">
              <input id="correlationId" name="correlationId" type="text" defaultValue={correlationId ?? ''} className="mono" />
            </Field>
            <Field label="From (UTC)" htmlFor="from">
              <input id="from" name="from" type="datetime-local" defaultValue={param(sp, 'from') ?? ''} />
            </Field>
            <Field label="To (UTC)" htmlFor="to">
              <input id="to" name="to" type="datetime-local" defaultValue={param(sp, 'to') ?? ''} />
            </Field>
            {assetId ? <input type="hidden" name="assetId" value={assetId} /> : null}
            <button type="submit" className={buttonClass('primary')}>
              Search
            </button>
            <Link href={base} className={buttonClass('quiet')}>
              Reset
            </Link>
          </FilterBar>
          {!res.ok ? (
            <LoadError status={res.status} problem={res.problem} />
          ) : res.data.items.length === 0 ? (
            <EmptyState title="No audit records match" />
          ) : (
            <>
              <AuditTable records={res.data.items} orgSlug={slug} />
              <CursorPagination
                shown={res.data.items.length}
                totalEstimate={res.data.page.totalEstimate}
                nextHref={res.data.page.nextCursor ? withParams(base, sp, { cursor: res.data.page.nextCursor }) : undefined}
                firstHref={withParams(base, sp, { cursor: undefined })}
                isFirstPage={!cursor}
              />
            </>
          )}
        </Section>
      </PageBody>
    </>
  );
}
