import Link from 'next/link';
import type { AuditRecord } from '@waylorn/contracts';
import { humanizeToken, orgPath } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { SafetyClassBadge } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';

const RESULT: Record<AuditRecord['result']['status'], string> = {
  success: 'Succeeded',
  failure: 'Failed',
  unknown: 'Unknown outcome',
  pending: 'Pending',
  not_executed: 'Not executed',
};

const ACTOR_TYPE: Record<AuditRecord['actor']['type'], string> = {
  human: 'Person',
  service: 'Service',
  connector: 'Connector',
  ai_assistant: 'AI assistant',
};

/** Audit records with every field required by the audit experience (actor … correlation ID). */
export function AuditTable({ records, orgSlug }: { records: readonly AuditRecord[]; orgSlug: string }) {
  return (
    <DataTable label="Audit records">
      <thead>
        <tr>
          <th scope="col">Time (UTC)</th>
          <th scope="col">Actor</th>
          <th scope="col">Action</th>
          <th scope="col">Target</th>
          <th scope="col">Decision</th>
          <th scope="col">Result</th>
          <th scope="col">Detail</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id} className={r.decision.outcome === 'deny' ? tableStyles.rowWarning : undefined}>
            <td>
              <Timestamp iso={r.occurredAt} />
            </td>
            <td>
              {r.actor.displayName}
              <span className={tableStyles.sub}>
                {ACTOR_TYPE[r.actor.type]}
                {r.actor.identityProvider ? ` · ${r.actor.identityProvider.displayName}` : ''}
              </span>
            </td>
            <td>
              <span className="mono">{r.action}</span> {r.safetyClass ? <SafetyClassBadge value={r.safetyClass} /> : null}
              <span className={tableStyles.sub}>{r.request.summary}</span>
            </td>
            <td>
              {r.asset ? (
                <Link href={orgPath(orgSlug, 'assets', r.asset.id)} className="mono">
                  {r.asset.tag}
                </Link>
              ) : (
                <span className="muted">—</span>
              )}
              <span className={tableStyles.sub}>{r.site?.code ?? 'Organization-wide'}</span>
            </td>
            <td className="nowrap">
              <Glyph shape={r.decision.outcome === 'permit' ? 'check' : 'slash'} /> {r.decision.outcome === 'permit' ? 'Permitted' : 'Denied'}
              {r.decision.policy ? (
                <span className={tableStyles.sub}>
                  {r.decision.policy.id} v{r.decision.policy.version}
                </span>
              ) : null}
            </td>
            <td>{RESULT[r.result.status]}</td>
            <td>
              <details>
                <summary>
                  <span className="mono">{r.correlationId}</span>
                </summary>
                <dl style={{ margin: '4px 0', fontSize: 'var(--text-xs)' }}>
                  <dt>Organization</dt>
                  <dd>{r.organization.name}</dd>
                  <dt>Record</dt>
                  <dd className="mono">{r.id}</dd>
                  <dt>Request digest</dt>
                  <dd className="mono" style={{ overflowWrap: 'anywhere' }}>
                    {r.request.digest}
                  </dd>
                  {r.decision.policy?.rule ? (
                    <>
                      <dt>Policy rule</dt>
                      <dd className="mono">{r.decision.policy.rule}</dd>
                    </>
                  ) : null}
                  {r.decision.reasons && r.decision.reasons.length > 0 ? (
                    <>
                      <dt>Reasons</dt>
                      <dd>{r.decision.reasons.join('; ')}</dd>
                    </>
                  ) : null}
                  {r.result.detail ? (
                    <>
                      <dt>Result detail</dt>
                      <dd>{r.result.detail}</dd>
                    </>
                  ) : null}
                  <dt>Integrity</dt>
                  <dd>
                    {r.integrity ? humanizeToken(r.integrity.state) : 'Not reported'}
                    {r.integrity?.chainPosition !== undefined ? ` (chain position ${r.integrity.chainPosition})` : ''}
                  </dd>
                </dl>
              </details>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
