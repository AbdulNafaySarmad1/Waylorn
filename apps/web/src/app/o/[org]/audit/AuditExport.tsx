'use client';

import { useState } from 'react';
import type { ActionAvailability } from '@waylorn/contracts';
import { humanizeToken, presentProblem } from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { bff } from '@/lib/bff';
import { useSession } from '@/lib/session-context';

/** Requests an export; the backend decides whether it is allowed and whether it needs approval. */
export function AuditExport({ permitted, filters }: { permitted: ActionAvailability | undefined; filters: Record<string, string> }) {
  const { orgId } = useSession();
  const [status, setStatus] = useState<string | undefined>();
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv');
  if (permitted && !permitted.available) {
    return <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Export unavailable: {permitted.reason}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <label className="visually-hidden" htmlFor="export-format">
        Export format
      </label>
      <select id="export-format" value={format} onChange={(e) => setFormat(e.target.value === 'jsonl' ? 'jsonl' : 'csv')}>
        <option value="csv">CSV</option>
        <option value="jsonl">JSON Lines</option>
      </select>
      <Button
        small
        onClick={() => {
          setStatus('Requesting…');
          void bff()
            .POST('/orgs/{orgId}/audit/exports', { params: { path: { orgId } }, body: { format, filters } })
            .then(({ data, error, response }) => {
              setStatus(data ? `Export ${data.id}: ${humanizeToken(data.state)}${data.detail ? ` — ${data.detail}` : ''}` : presentProblem(error, response.status).message);
            });
        }}
      >
        Request export
      </Button>
      {status ? (
        <span role="status" style={{ fontSize: 'var(--text-sm)' }}>
          {status}
        </span>
      ) : null}
    </span>
  );
}
