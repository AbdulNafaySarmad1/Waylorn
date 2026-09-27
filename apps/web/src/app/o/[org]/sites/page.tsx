import Link from 'next/link';
import type { Metadata } from 'next';
import type { HierarchyNode } from '@waylorn/contracts';
import { orgPath } from '@waylorn/domain';
import { Age } from '@/components/ui/Age';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { ConnectivityStatus, EnvironmentBadge } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { orgContext, type OrgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Sites' };

const LEVEL_LABEL = { region: 'Region', site: 'Site', zone: 'Zone', line: 'Production line' } as const;

/** Organization → region → site → zone → line, loaded level by level from the server. */
async function HierarchyLevel({ ctx, parentId, slug }: { ctx: OrgContext; parentId?: string; slug: string }) {
  const res = await load(
    ctx.api.GET('/orgs/{orgId}/hierarchy', { params: { path: { orgId: ctx.org.id }, query: parentId ? { parentId } : {} } }),
  );
  if (!res.ok) return <LoadError status={res.status} problem={res.problem} />;
  return (
    <ul style={{ listStyle: 'none', margin: 0, paddingLeft: parentId ? 20 : 0 }}>
      {res.data.items.map((n: HierarchyNode) => {
        const filter = n.level === 'site' ? `?site=${n.id}` : '';
        const label = (
          <>
            <span className="muted" style={{ fontSize: 'var(--text-xs)', marginRight: 6 }}>
              {LEVEL_LABEL[n.level]}
            </span>
            <strong>{n.name}</strong>
            {n.code ? <span className="mono muted"> {n.code}</span> : null}
            {n.assetCount !== undefined ? <span className="muted"> · {n.assetCount.toLocaleString('en-GB')} assets</span> : null}
            {filter ? (
              <>
                {' · '}
                <Link href={`${orgPath(slug, 'assets')}${filter}`}>View assets</Link>
              </>
            ) : null}
          </>
        );
        return (
          <li key={n.id} style={{ padding: '2px 0' }}>
            {n.childCount > 0 ? (
              <details open={n.level === 'region'}>
                <summary style={{ cursor: 'pointer', padding: '4px 0' }}>{label}</summary>
                <HierarchyLevel ctx={ctx} parentId={n.id} slug={slug} />
              </details>
            ) : (
              <div style={{ padding: '4px 0 4px 16px' }}>{label}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function Sites({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await orgContext(slug);
  const sites = await load(ctx.api.GET('/orgs/{orgId}/sites', { params: { path: { orgId: ctx.org.id } } }));
  return (
    <>
      <PageHeader title="Sites" eyebrow={ctx.org.name} subtitle="Plants, datacenters and labs in this organization, and their link to the control plane." />
      <PageBody>
        <Section title="Sites" flush>
          {!sites.ok ? (
            <LoadError status={sites.status} problem={sites.problem} />
          ) : (
            <DataTable label="Sites" caption="Each site remains operable without the control plane. Link state concerns monitoring and administration only.">
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Environment</th>
                  <th scope="col">Region</th>
                  <th scope="col">Local time zone</th>
                  <th scope="col">Link to control plane</th>
                </tr>
              </thead>
              <tbody>
                {sites.data.items.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className={tableStyles.primaryCell}>
                      <Link href={`${orgPath(slug, 'assets')}?site=${s.id}`}>{s.name}</Link>
                      <span className={`${tableStyles.sub} mono`}>{s.code}</span>
                    </th>
                    <td>
                      <EnvironmentBadge environment={s.environment} />
                    </td>
                    <td>{s.regionName}</td>
                    <td>{s.timezone}</td>
                    <td>
                      <ConnectivityStatus state={s.connectivity.state} />{' '}
                      <span className="muted">
                        last contact <Age iso={s.connectivity.lastContactAt} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
        <Section title="Hierarchy" meta="Organization › region › site › zone › production line">
          <HierarchyLevel ctx={ctx} slug={slug} />
        </Section>
      </PageBody>
    </>
  );
}
