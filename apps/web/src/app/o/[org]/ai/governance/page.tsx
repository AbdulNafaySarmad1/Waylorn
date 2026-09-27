import type { Metadata } from 'next';
import { CLASSIFICATION, DATA_CATEGORY, humanizeToken, LOCALITY, PROVIDER_CLASS } from '@waylorn/domain';
import { PolicyEditor } from '@/components/ai/PolicyEditor';
import { Age } from '@/components/ui/Age';
import { KeyValue, PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { HealthStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'AI governance' };

export default async function AiGovernance({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const [providers, policies, egress] = await Promise.all([
    load(api.GET('/orgs/{orgId}/ai/providers', { params: { path: { orgId: org.id } } })),
    load(api.GET('/orgs/{orgId}/ai/policies', { params: { path: { orgId: org.id } } })),
    load(api.GET('/orgs/{orgId}/ai/egress', { params: { path: { orgId: org.id }, query: { limit: 50 } } })),
  ]);
  // Usability hint only: the control plane authorizes every policy change.
  const mayEdit = org.roles.includes('org-admin');
  const providerName = (id: string) => (providers.ok ? providers.data.items.find((p) => p.id === id)?.displayName : undefined) ?? id;

  return (
    <>
      <PageHeader
        title="AI governance"
        eyebrow={org.name}
        subtitle="Which model providers may be used, what data may reach them, and a record of what was sent. All model traffic passes through the AI gateway."
      />
      <PageBody>
        <Section title="Providers" flush>
          {!providers.ok ? (
            <LoadError status={providers.status} problem={providers.problem} />
          ) : (
            <DataTable label="Model providers">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Class</th>
                  <th scope="col">Model</th>
                  <th scope="col">Locality</th>
                  <th scope="col">Classification ceiling</th>
                  <th scope="col">Status</th>
                  <th scope="col">Health check</th>
                </tr>
              </thead>
              <tbody>
                {providers.data.items.map((p) => (
                  <tr key={p.id} className={p.locality === 'external' ? tableStyles.rowWarning : undefined}>
                    <th scope="row" className={tableStyles.primaryCell}>
                      {p.displayName}
                      <span className={`${tableStyles.sub} mono`}>{p.endpoint}</span>
                    </th>
                    <td>{PROVIDER_CLASS[p.providerClass]}</td>
                    <td className="mono">{p.model}</td>
                    <td>{LOCALITY[p.locality].label}</td>
                    <td>{CLASSIFICATION[p.classificationCeiling]}</td>
                    <td>{humanizeToken(p.status)}</td>
                    <td>
                      {p.lastHealthCheck ? (
                        <>
                          <HealthStatus state={p.lastHealthCheck.state} /> <Age iso={p.lastHealthCheck.at} />
                        </>
                      ) : (
                        <span className="muted">Not checked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>

        {policies.ok
          ? policies.data.items.map((p) => (
              <Section
                key={p.id}
                title={`Data policy — ${providerName(p.providerId)}`}
                meta={
                  <>
                    v{p.version} · updated <Timestamp iso={p.updatedAt} seconds={false} /> by {p.updatedBy.displayName}
                  </>
                }
                actions={mayEdit ? <PolicyEditor policy={p} /> : null}
              >
                <KeyValue
                  items={[
                    ['Classification', CLASSIFICATION[p.classification]],
                    ['Allowed categories', p.allowedCategories.map((c) => DATA_CATEGORY[c].label).join(', ') || 'None'],
                    ['Prohibited categories', p.prohibitedCategories.map((c) => DATA_CATEGORY[c].label).join(', ') || 'None'],
                    ['Redaction', p.redaction.enabled ? `On: ${p.redaction.fields.join(', ')}` : 'Off'],
                    ['Pseudonymisation', p.pseudonymization.enabled ? `On: ${p.pseudonymization.scopes.map(humanizeToken).join(', ')}` : 'Off'],
                    ['Aggregation', p.aggregation.enabled ? `On, minimum group size ${p.aggregation.minimumGroupSize ?? '—'}` : 'Off'],
                    ['Approval', p.approval.required ? `Required (${p.approval.approverRole ?? 'designated approver'})` : 'Not required'],
                    ['Retention', `Local transcripts ${p.retention.localTranscriptDays} days${p.retention.providerRetention ? `; provider: ${p.retention.providerRetention}` : ''}`],
                  ]}
                />
                {!mayEdit ? <p className="muted" style={{ marginTop: 8 }}>Policy changes require the org-admin role.</p> : null}
              </Section>
            ))
          : <LoadError status={policies.status} problem={policies.problem} />}

        <Section title="Egress record" meta="What left the control plane for a model provider" flush>
          {!egress.ok ? (
            <LoadError status={egress.status} problem={egress.problem} />
          ) : egress.data.items.length === 0 ? (
            <EmptyState title="Nothing sent yet">Assistant requests that include operational data are listed here.</EmptyState>
          ) : (
            <DataTable label="AI egress">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Locality</th>
                  <th scope="col">Categories</th>
                  <th scope="col" className={tableStyles.num}>Redacted fields</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Requested by</th>
                </tr>
              </thead>
              <tbody>
                {egress.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Timestamp iso={e.at} />
                    </td>
                    <td>{providerName(e.providerId)}</td>
                    <td>{LOCALITY[e.locality].label}</td>
                    <td>{e.categories.map((c) => DATA_CATEGORY[c].label).join(', ')}</td>
                    <td className={tableStyles.num}>{e.redactedFieldCount ?? 0}</td>
                    <td>{humanizeToken(e.decision)}</td>
                    <td>{e.actor.displayName}</td>
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
