import Link from 'next/link';
import type { Metadata } from 'next';
import { orgPath } from '@waylorn/domain';
import { Age } from '@/components/ui/Age';
import { Glyph } from '@/components/ui/Glyph';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { ConnectivityStatus, EnvironmentBadge, SeverityStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Overview' };

function Count({ n, shape, label }: { n: number; shape: 'cross' | 'triangle' | 'question'; label: string }) {
  if (n === 0) return <span className="muted">0</span>;
  return (
    <span className="nowrap" title={label}>
      <Glyph shape={shape} /> {n.toLocaleString('en-GB')}
      <span className="visually-hidden"> {label}</span>
    </span>
  );
}

export default async function Overview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const [overview, incidents] = await Promise.all([
    load(api.GET('/orgs/{orgId}/overview', { params: { path: { orgId: org.id } } })),
    load(api.GET('/orgs/{orgId}/incidents', { params: { path: { orgId: org.id }, query: { limit: 8 } } })),
  ]);

  return (
    <>
      <PageHeader title="Overview" eyebrow={org.name} subtitle="Per-site operational state. Sites needing attention sort first." />
      <PageBody>
        <Section title="Sites" meta={overview.ok ? <>Generated <Timestamp iso={overview.data.generatedAt} /></> : null} flush>
          {!overview.ok ? (
            <LoadError status={overview.status} problem={overview.problem} />
          ) : (
            <DataTable
              label="Site status"
              caption="Asset counts reflect the last state reported by each site. A disconnected site's counts are stale."
            >
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Environment</th>
                  <th scope="col">Site link</th>
                  <th scope="col" className={tableStyles.num}>
                    Faults
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Warnings
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Unknown
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Normal
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Stale
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Open incidents
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...overview.data.sites]
                  .sort(
                    (a, b) =>
                      Number(b.site.connectivity.state !== 'connected') - Number(a.site.connectivity.state !== 'connected') ||
                      b.openIncidents.critical - a.openIncidents.critical ||
                      b.assetHealth.fault - a.assetHealth.fault ||
                      a.site.code.localeCompare(b.site.code),
                  )
                  .map(({ site, assetHealth, openIncidents, staleAssets }) => (
                    <tr
                      key={site.id}
                      className={
                        site.connectivity.state === 'disconnected' || assetHealth.fault > 0
                          ? tableStyles.rowFault
                          : site.connectivity.state === 'degraded' || assetHealth.warning > 0
                            ? tableStyles.rowWarning
                            : undefined
                      }
                    >
                      <th scope="row" className={tableStyles.primaryCell}>
                        <Link href={`${orgPath(slug, 'assets')}?site=${site.id}`}>{site.name}</Link>
                        <span className={tableStyles.sub}>
                          {site.code} · {site.regionName}
                        </span>
                      </th>
                      <td>
                        <EnvironmentBadge environment={site.environment} />
                      </td>
                      <td>
                        <ConnectivityStatus state={site.connectivity.state} />
                        <span className={tableStyles.sub}>
                          last contact <Age iso={site.connectivity.lastContactAt} />
                        </span>
                      </td>
                      <td className={tableStyles.num}>
                        <Count n={assetHealth.fault} shape="cross" label="faults" />
                      </td>
                      <td className={tableStyles.num}>
                        <Count n={assetHealth.warning} shape="triangle" label="warnings" />
                      </td>
                      <td className={tableStyles.num}>
                        <Count n={assetHealth.unknown} shape="question" label="unknown" />
                      </td>
                      <td className={tableStyles.num}>{assetHealth.ok.toLocaleString('en-GB')}</td>
                      <td className={tableStyles.num}>
                        <Count n={staleAssets} shape="question" label="stale" />
                      </td>
                      <td className={tableStyles.num}>
                        {openIncidents.critical + openIncidents.warning + openIncidents.notice === 0 ? (
                          <span className="muted">0</span>
                        ) : (
                          <span className="nowrap">
                            {openIncidents.critical > 0 ? <Count n={openIncidents.critical} shape="cross" label="critical" /> : null}{' '}
                            {openIncidents.warning > 0 ? <Count n={openIncidents.warning} shape="triangle" label="warning" /> : null}{' '}
                            {openIncidents.notice > 0 ? `${openIncidents.notice} notice` : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          )}
        </Section>

        <Section
          title="Open incidents"
          flush
          actions={<Link href={orgPath(slug, 'incidents')}>All incidents</Link>}
          meta={overview.ok && overview.data.pendingApprovals > 0 ? `${overview.data.pendingApprovals} approval(s) waiting for you` : null}
        >
          {!incidents.ok ? (
            <LoadError status={incidents.status} problem={incidents.problem} />
          ) : (
            <DataTable label="Open incidents">
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Incident</th>
                  <th scope="col">Location</th>
                  <th scope="col">Status</th>
                  <th scope="col">Opened</th>
                </tr>
              </thead>
              <tbody>
                {incidents.data.items
                  .filter((i) => i.status !== 'resolved')
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <SeverityStatus severity={i.severity} />
                      </td>
                      <td className={tableStyles.primaryCell}>
                        {i.primaryAsset ? <Link href={orgPath(slug, 'assets', i.primaryAsset.id)}>{i.title}</Link> : i.title}
                        <span className={tableStyles.sub}>{i.id}</span>
                      </td>
                      <td>
                        {i.context.site.code}
                        {i.context.line ? ` · ${i.context.line.name}` : i.context.zone ? ` · ${i.context.zone.name}` : ''}
                      </td>
                      <td>{i.status}</td>
                      <td>
                        <Age iso={i.openedAt} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      </PageBody>
    </>
  );
}
