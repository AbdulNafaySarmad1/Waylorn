import type { Metadata } from 'next';
import type { DomainStep } from '@waylorn/contracts';
import { humanizeToken } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { KeyValue, PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { DataTable } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Domains and edge' };

const STEP_LABEL: Record<DomainStep['step'], string> = {
  request: 'Request recorded',
  dns_verification: 'DNS ownership verified',
  certificate: 'Certificate issued or installed',
  ingress_binding: 'Ingress / edge bound',
  idp_redirect: 'Keycloak redirect URIs registered',
  activation: 'Active',
};

const STATE_GLYPH = { complete: 'check', in_progress: 'dot', pending: 'question', failed: 'cross', blocked: 'triangle' } as const;

export default async function Domains({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const res = await load(api.GET('/orgs/{orgId}/domains', { params: { path: { orgId: org.id } } }));
  return (
    <>
      <PageHeader
        title="Domains and edge"
        eyebrow={org.name}
        subtitle="Where operators reach this control plane. Each step is confirmed by the provisioning backend; nothing is marked complete by the browser."
      />
      <PageBody>
        {!res.ok ? (
          <LoadError status={res.status} problem={res.problem} />
        ) : res.data.items.length === 0 ? (
          <EmptyState title="No domains configured" />
        ) : (
          res.data.items.map((d) => (
            <Section key={d.id} title={d.hostname} meta={humanizeToken(d.kind)}>
              <KeyValue
                items={[
                  ['Certificate', d.certificateMode === 'managed' ? 'Managed by the platform' : 'Customer-provided'],
                  ['Edge / ingress', d.edge ?? '—'],
                ]}
              />
              <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 6 }} aria-label="Provisioning steps">
                {d.steps.map((s) => (
                  <li key={s.step} style={{ display: 'grid', gridTemplateColumns: '20px 280px 1fr', gap: 8, alignItems: 'baseline' }}>
                    <Glyph shape={STATE_GLYPH[s.state]} />
                    <span>
                      <strong>{STEP_LABEL[s.step]}</strong> <span className="muted">— {humanizeToken(s.state)}</span>
                    </span>
                    <span className="muted">
                      {s.detail ?? ''} {s.updatedAt ? <Timestamp iso={s.updatedAt} seconds={false} /> : null}
                    </span>
                  </li>
                ))}
              </ol>
              {d.dnsRecords.length > 0 ? (
                <DataTable label={`DNS records for ${d.hostname}`} caption="Create these records at your DNS provider.">
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Name</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.dnsRecords.map((r) => (
                      <tr key={`${r.type}-${r.name}`}>
                        <td>{r.type}</td>
                        <td className="mono">{r.name}</td>
                        <td className="mono">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              ) : null}
            </Section>
          ))
        )}
        <Section title="Human verification">
          <p>
            Challenges such as Cloudflare Turnstile apply only to the human sign-in pages served by the identity provider. Machine-to-machine
            APIs, live streams and OT communication never carry web challenges.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
