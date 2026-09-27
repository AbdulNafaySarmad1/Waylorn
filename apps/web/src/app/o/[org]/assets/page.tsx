import Link from 'next/link';
import type { Metadata } from 'next';
import { assetKindValues, healthStateValues } from '@waylorn/contracts';
import { ASSET_KIND_LABEL, HEALTH, LIFECYCLE_LABEL, orgPath, parseAssetQuery } from '@waylorn/domain';
import { Age } from '@/components/ui/Age';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { ConnectivityStatus, HealthStatus } from '@/components/ui/Status';
import { CursorPagination, DataTable, Field, FilterBar, SortHeader, tableStyles } from '@/components/ui/Table';
import { withParams, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Assets' };

const IDENTITY_LABEL = { confirmed: 'Confirmed', probable: 'Probable', unverified: 'Unverified' } as const;

export default async function Assets({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const query = parseAssetQuery(sp);
  const { api, org } = await orgContext(slug);
  const base = orgPath(slug, 'assets');

  const [page, sites] = await Promise.all([
    load(
      api.GET('/orgs/{orgId}/assets', {
        params: {
          path: { orgId: org.id },
          query: {
            limit: 50,
            ...(query.q ? { q: query.q } : {}),
            ...(query.siteId ? { siteId: query.siteId } : {}),
            ...(query.kind ? { kind: query.kind } : {}),
            ...(query.health ? { health: query.health } : {}),
            ...(query.lifecycle ? { lifecycle: query.lifecycle } : {}),
            ...(query.sort ? { sort: query.sort } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
          },
        },
      }),
    ),
    load(api.GET('/orgs/{orgId}/sites', { params: { path: { orgId: org.id } } })),
  ]);

  const facet = (name: 'kind' | 'health', value: string) =>
    page.ok ? page.data.facets?.[name]?.find((f) => f.value === value)?.count : undefined;
  const sortHref = (sort: string) => withParams(base, sp, { sort, cursor: undefined });
  const activeSort = query.sort ?? 'tag';
  const siteName = sites.ok ? sites.data.items.find((s) => s.id === query.siteId)?.name : undefined;

  return (
    <>
      <PageHeader
        title="Assets"
        eyebrow={siteName ? `${org.name} › ${siteName}` : org.name}
        subtitle="Industrial, compute, network, cloud, storage, application and security assets in one inventory. Filtering and sorting run on the server."
      />
      <PageBody>
        <Section title="Inventory" flush>
          <FilterBar label="Filter assets">
            <Field label="Search tag, name, serial, model" htmlFor="q">
              <input id="q" name="q" type="search" defaultValue={query.q ?? ''} maxLength={200} />
            </Field>
            <Field label="Site" htmlFor="site">
              <select id="site" name="site" defaultValue={query.siteId ?? ''}>
                <option value="">All sites</option>
                {sites.ok
                  ? sites.data.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))
                  : null}
              </select>
            </Field>
            <Field label="Kind" htmlFor="kind">
              <select id="kind" name="kind" defaultValue={query.kind ?? ''}>
                <option value="">All kinds</option>
                {assetKindValues.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                    {facet('kind', k) !== undefined ? ` (${facet('kind', k)})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Health" htmlFor="health">
              <select id="health" name="health" defaultValue={query.health ?? ''}>
                <option value="">Any health</option>
                {healthStateValues.map((h) => (
                  <option key={h} value={h}>
                    {HEALTH[h].label}
                    {facet('health', h) !== undefined ? ` (${facet('health', h)})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}
            <button type="submit" className={buttonClass('primary')}>
              Apply
            </button>
            <Link href={base} className={buttonClass('quiet')}>
              Reset
            </Link>
          </FilterBar>
          {!page.ok ? (
            <LoadError status={page.status} problem={page.problem} />
          ) : page.data.items.length === 0 ? (
            <EmptyState title="No assets match these filters">Clear a filter or search for a different tag.</EmptyState>
          ) : (
            <>
              <DataTable label="Assets">
                <thead>
                  <tr>
                    <SortHeader label="Tag / name" href={sortHref('tag')} active={activeSort === 'tag'} />
                    <th scope="col">Kind</th>
                    <th scope="col">Manufacturer / model</th>
                    <th scope="col">Location</th>
                    <SortHeader label="Installed" href={sortHref('installedYear')} active={activeSort === 'installedYear'} />
                    <SortHeader label="Health" href={sortHref('health')} active={activeSort === 'health'} />
                    <SortHeader label="Link" href={sortHref('lastSeen')} active={activeSort === 'lastSeen'} />
                    <th scope="col">Identity</th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.items.map((a) => (
                    <tr
                      key={a.id}
                      className={a.health.state === 'fault' ? tableStyles.rowFault : a.health.state === 'warning' ? tableStyles.rowWarning : undefined}
                    >
                      <th scope="row" className={tableStyles.primaryCell}>
                        <Link href={orgPath(slug, 'assets', a.id)} className="mono">
                          {a.tag}
                        </Link>
                        <span className={tableStyles.sub}>{a.name}</span>
                      </th>
                      <td>
                        {ASSET_KIND_LABEL[a.kind]}
                        {a.lifecycle !== 'in_service' ? <span className={tableStyles.sub}>{LIFECYCLE_LABEL[a.lifecycle]}</span> : null}
                      </td>
                      <td>
                        {a.manufacturer ?? <span className="muted">—</span>}
                        {a.model ? <span className={tableStyles.sub}>{a.model}</span> : null}
                      </td>
                      <td>
                        {a.context.site.code}
                        <span className={tableStyles.sub}>{a.context.line?.name ?? a.context.zone?.name ?? ''}</span>
                      </td>
                      <td className={tableStyles.num}>{a.installedYear ?? <span className="muted">—</span>}</td>
                      <td>
                        <HealthStatus state={a.health.state} reason={a.health.reason} />
                      </td>
                      <td>
                        <ConnectivityStatus state={a.connectivity.state} />
                        <span className={tableStyles.sub}>
                          seen <Age iso={a.connectivity.lastSeenAt} />
                        </span>
                      </td>
                      <td>{IDENTITY_LABEL[a.identityConfidence]}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <CursorPagination
                shown={page.data.items.length}
                totalEstimate={page.data.page.totalEstimate}
                nextHref={page.data.page.nextCursor ? withParams(base, sp, { cursor: page.data.page.nextCursor }) : undefined}
                firstHref={withParams(base, sp, { cursor: undefined })}
                isFirstPage={!query.cursor}
              />
            </>
          )}
        </Section>
      </PageBody>
    </>
  );
}
