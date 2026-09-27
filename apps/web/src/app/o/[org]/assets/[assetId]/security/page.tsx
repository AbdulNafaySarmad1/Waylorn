import type { Metadata } from 'next';
import { humanizeToken } from '@waylorn/domain';
import { KeyValue, PageBody, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { SeverityStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Security' };

export default async function Security({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { api, org } = await assetContext(slug, assetId);
  const res = await load(api.GET('/orgs/{orgId}/assets/{assetId}/security', { params: { path: { orgId: org.id, assetId } } }));
  if (!res.ok) {
    return (
      <PageBody>
        <LoadError status={res.status} problem={res.problem} />
      </PageBody>
    );
  }
  const s = res.data;
  return (
    <PageBody>
      <Section title="Zone and assessment">
        <KeyValue
          items={[
            ['Security zone', s.zone],
            ['Target security level', s.targetSecurityLevel ?? '—'],
            ['Last assessed', <Timestamp key="t" iso={s.assessedAt} />],
            ['Source', s.provenance.source],
          ]}
        />
      </Section>
      <Section title="Vulnerabilities and advisories" meta={`${s.vulnerabilities.filter((v) => v.status === 'open').length} open`} flush>
        {s.vulnerabilities.length === 0 ? (
          <p style={{ padding: 16 }} className="muted">
            No known advisories apply to this asset.
          </p>
        ) : (
          <DataTable label="Vulnerabilities">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Advisory</th>
                <th scope="col" className={tableStyles.num}>
                  CVSS
                </th>
                <th scope="col">Status</th>
                <th scope="col">Compensating control</th>
              </tr>
            </thead>
            <tbody>
              {s.vulnerabilities.map((v) => (
                <tr key={v.id}>
                  <td>
                    <SeverityStatus severity={v.severity} />
                  </td>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    {v.title}
                    <span className={`${tableStyles.sub} mono`}>
                      {v.id} · {v.source}
                    </span>
                  </th>
                  <td className={tableStyles.num}>{v.cvss ?? '—'}</td>
                  <td>{humanizeToken(v.status)}</td>
                  <td>{v.compensatingControl ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
      <Section title="Conduits and exposure" flush>
        <DataTable label="Exposures">
          <thead>
            <tr>
              <th scope="col">Conduit</th>
              <th scope="col">Exposure</th>
            </tr>
          </thead>
          <tbody>
            {s.exposures.map((e) => (
              <tr key={e.conduit}>
                <th scope="row">{e.conduit}</th>
                <td>{e.description}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>
    </PageBody>
  );
}
