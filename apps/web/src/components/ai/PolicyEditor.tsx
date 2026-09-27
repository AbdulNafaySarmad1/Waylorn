'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dataCategoryValues, type AiDataPolicy, type AiDataPolicyUpdate, type DataCategory } from '@waylorn/contracts';
import { conflictingCategories, DATA_CATEGORY, presentProblem, type ProblemPresentation } from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { SafetyClassBadge } from '@/components/ui/Status';
import { bff, stepUpUrl } from '@/lib/bff';
import { useSession } from '@/lib/session-context';

type Treatment = 'allowed' | 'prohibited' | 'unset';

/**
 * Edits one provider's data policy. AMBER administrative change: the backend evaluates
 * authorization, may require step-up, and rejects stale versions (If-Match).
 */
export function PolicyEditor({ policy }: { policy: AiDataPolicy }) {
  const { orgId } = useSession();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [treatment, setTreatment] = useState<Record<DataCategory, Treatment>>(() => {
    const t = {} as Record<DataCategory, Treatment>;
    for (const c of dataCategoryValues) t[c] = policy.allowedCategories.includes(c) ? 'allowed' : policy.prohibitedCategories.includes(c) ? 'prohibited' : 'unset';
    return t;
  });
  const [redaction, setRedaction] = useState(policy.redaction.enabled);
  const [pseudo, setPseudo] = useState(policy.pseudonymization.enabled);
  const [approval, setApproval] = useState(policy.approval.required);
  const [retention, setRetention] = useState(String(policy.retention.localTranscriptDays));
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <Button small onClick={() => setEditing(true)}>
        Edit policy
      </Button>
    );
  }

  const allowed = dataCategoryValues.filter((c) => treatment[c] === 'allowed');
  const prohibited = dataCategoryValues.filter((c) => treatment[c] === 'prohibited');
  const conflicts = conflictingCategories(allowed, prohibited);
  const retentionDays = Number(retention);

  const save = async () => {
    setSaving(true);
    setProblem(undefined);
    const update: AiDataPolicyUpdate = {
      allowedCategories: allowed,
      prohibitedCategories: prohibited,
      redaction: { ...policy.redaction, enabled: redaction },
      pseudonymization: { ...policy.pseudonymization, enabled: pseudo },
      aggregation: policy.aggregation,
      approval: { ...policy.approval, required: approval },
      retention: { ...policy.retention, localTranscriptDays: retentionDays },
    };
    const { data, error, response } = await bff().PUT('/orgs/{orgId}/ai/policies/{policyId}', {
      params: { path: { orgId, policyId: policy.id }, header: { 'If-Match': policy.version } },
      body: update,
    });
    setSaving(false);
    if (data) {
      setEditing(false);
      router.refresh();
    } else {
      setProblem(presentProblem(error, response.status));
    }
  };

  return (
    <form
      style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid var(--border-strong)', background: 'var(--surface-1)' }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <SafetyClassBadge value="AMBER" long /> Changing what may leave your network is an administrative change. It is audited and may require
        re-authentication.
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Data categories</legend>
        <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', paddingRight: 16 }}>Category</th>
              <th scope="col">Allowed</th>
              <th scope="col">Not configured</th>
              <th scope="col">Prohibited</th>
            </tr>
          </thead>
          <tbody>
            {dataCategoryValues.map((c) => (
              <tr key={c}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: 400, paddingRight: 16 }}>
                  {DATA_CATEGORY[c].label}
                  {DATA_CATEGORY[c].sensitive ? <span className="muted"> (sensitive)</span> : null}
                </th>
                {(['allowed', 'unset', 'prohibited'] as const).map((t) => (
                  <td key={t} style={{ textAlign: 'center' }}>
                    <input
                      type="radio"
                      name={`cat-${c}`}
                      aria-label={`${DATA_CATEGORY[c].label}: ${t}`}
                      checked={treatment[c] === t}
                      onChange={() => setTreatment({ ...treatment, [c]: t })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      <label>
        <input type="checkbox" checked={redaction} onChange={(e) => setRedaction(e.target.checked)} /> Redact configured fields before egress
      </label>
      <label>
        <input type="checkbox" checked={pseudo} onChange={(e) => setPseudo(e.target.checked)} /> Pseudonymise people, sites and addresses
      </label>
      <label>
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} /> Require approval for each external request
      </label>
      <label style={{ display: 'grid', gap: 4, maxWidth: 240 }}>
        Local transcript retention (days)
        <input type="number" min={0} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} />
      </label>
      {conflicts.length > 0 ? <p role="alert">A category cannot be both allowed and prohibited.</p> : null}
      {problem ? (
        <ErrorState problem={problem}>
          {problem.action === 'reauthenticate' ? (
            <p>
              <a href={stepUpUrl(window.location.pathname)}>Re-authenticate</a> and apply your changes again.
            </p>
          ) : null}
        </ErrorState>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => setEditing(false)}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving || conflicts.length > 0 || !Number.isInteger(retentionDays) || retentionDays < 0}>
          {saving ? 'Saving…' : `Save as version ${Number(policy.version) + 1}`}
        </Button>
      </div>
    </form>
  );
}
