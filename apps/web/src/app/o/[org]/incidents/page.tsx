import Link from 'next/link';
import type { Metadata } from 'next';
import { incidentStatusValues } from '@waylorn/contracts';
import { humanizeToken, orgPath } from '@waylorn/domain';
import { Age } from '@/components/ui/Age';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { EnvironmentBadge, SeverityStatus } from '@/components/ui/Status';
import { CursorPagination, DataTable, Field, FilterBar, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { param, withParams, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Incidents' };

export default async function Incidents({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { api, org } = await orgContext(slug);
  const status = incidentStatusValues.find((s) => s === param(sp, 'status'));
  const cursor = param(sp, 'cursor');
  const res = await load(
    api.GET('/orgs/{orgId}/incidents', {
      params: { path: { orgId: org.id }, query: { limit: 50, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) } },
    }),
  );
  const base = orgPath(slug, 'incidents');
  return (
    <>
      <PageHeader title="Incidents" eyebrow={org.name} />
      <PageBody>
        <Section title="Incidents" flush>
          <FilterBar label="Filter incidents">
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" defaultValue={status ?? ''}>
                <option value="">Any status</option>
                {incidentStatusValues.map((s) => (
                  <option key={s} value={s}>
                    {humanizeToken(s)}
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
            <EmptyState title="No incidents match" />
          ) : (
            <>
              <DataTable label="Incidents">
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th scope="col">Incident</th>
                    <th scope="col">Site</th>
                    <th scope="col">Status</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Opened (UTC)</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.items.map((i) => (
                    <tr key={i.id} className={i.status !== 'resolved' && i.severity === 'critical' ? tableStyles.rowFault : undefined}>
                      <td>
                        <SeverityStatus severity={i.severity} />
                      </td>
                      <th scope="row" className={tableStyles.primaryCell}>
                        {i.title}
                        <span className={tableStyles.sub}>
                          <span className="mono">{i.id}</span> · {i.assetCount} asset(s)
                          {i.primaryAsset ? (
                            <>
                              {' · '}
                              <Link href={orgPath(slug, 'assets', i.primaryAsset.id)}>{i.primaryAsset.tag}</Link>
                            </>
                          ) : null}
                        </span>
                      </th>
                      <td>
                        <EnvironmentBadge environment={i.context.site.environment} /> {i.context.site.code}
                      </td>
                      <td>{humanizeToken(i.status)}</td>
                      <td>{i.owner ?? <span className="muted">Unassigned</span>}</td>
                      <td>
                        <Timestamp iso={i.openedAt} seconds={false} />
                      </td>
                      <td>
                        <Age iso={i.updatedAt ?? i.openedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
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
