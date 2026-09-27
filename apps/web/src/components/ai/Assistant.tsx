'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AiDataPolicy, AiProvider, AssistantTurn, ProvenanceLink } from '@waylorn/contracts';
import { DATA_CATEGORY, LOCALITY, orgPath, presentProblem, PROVIDER_CLASS, type ProblemPresentation } from '@waylorn/domain';
import { Button } from '@/components/ui/Button';
import { Glyph } from '@/components/ui/Glyph';
import { Banner, ErrorState } from '@/components/ui/States';
import { bff } from '@/lib/bff';
import { useSession } from '@/lib/session-context';
import styles from './Assistant.module.css';

type Entry = { readonly kind: 'user'; readonly id: string; readonly text: string } | { readonly kind: 'assistant'; readonly turn: AssistantTurn };

function provenanceHref(orgSlug: string, p: ProvenanceLink): string {
  switch (p.kind) {
    case 'asset':
      return orgPath(orgSlug, 'assets', p.id);
    case 'analytics':
      return p.assetId ? orgPath(orgSlug, 'assets', p.assetId, 'reliability') : orgPath(orgSlug, 'reliability');
    case 'telemetry':
      return p.assetId ? orgPath(orgSlug, 'assets', p.assetId, 'telemetry') : orgPath(orgSlug, 'assets');
    case 'event':
      return p.assetId ? orgPath(orgSlug, 'assets', p.assetId, 'events') : orgPath(orgSlug, 'assets');
    case 'audit':
      return `${orgPath(orgSlug, 'audit')}?q=${encodeURIComponent(p.id)}`;
    case 'incident':
      return orgPath(orgSlug, 'incidents');
  }
}

const TOOL_STATUS = { ok: 'Answered by service', denied: 'Denied by policy', error: 'Service error', no_data: 'No data' } as const;

/**
 * Operator assistant. Operational figures come only from backend tool calls, shown with
 * provenance. Assistant text is rendered as plain text (never HTML or Markdown).
 */
export function Assistant({ providers, policies }: { providers: readonly AiProvider[]; policies: readonly AiDataPolicy[] }) {
  const { orgId, orgSlug } = useSession();
  const usable = providers.filter((p) => p.status === 'enabled');
  const [providerId, setProviderId] = useState(usable[0]?.id ?? '');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const provider = usable.find((p) => p.id === providerId);
  const policy = policies.find((p) => p.providerId === providerId);

  const send = async () => {
    const message = draft.trim();
    if (!message || !provider) return;
    setBusy(true);
    setProblem(undefined);
    setEntries((e) => [...e, { kind: 'user', id: crypto.randomUUID(), text: message }]);
    setDraft('');
    const { data, error, response } = await bff().POST('/orgs/{orgId}/ai/assistant/turns', {
      params: { path: { orgId } },
      body: { message, providerId: provider.id, ...(conversationId ? { conversationId } : {}) },
    });
    setBusy(false);
    if (data) {
      setConversationId(data.conversationId);
      setEntries((e) => [...e, { kind: 'assistant', turn: data }]);
    } else {
      setProblem(presentProblem(error, response.status));
    }
  };

  if (usable.length === 0) {
    return <Banner tone="degraded">No model provider is enabled for this organization. An administrator can configure one in AI governance.</Banner>;
  }

  return (
    <div className={styles.layout}>
      <div>
        {provider && LOCALITY[provider.locality].egress ? (
          <Banner tone="degraded">
            <strong>{provider.displayName}</strong> is outside your network ({LOCALITY[provider.locality].label}). Only the data categories
            permitted by policy are sent, after redaction and pseudonymisation.
          </Banner>
        ) : null}
        <div className={styles.transcript} aria-live="polite" aria-label="Conversation">
          {entries.length === 0 ? (
            <p className="muted">
              Ask about assets, events or reliability, for example “What was PLC-203’s MTBF last year?”. Figures are retrieved from the analytics
              and asset services, never calculated by the model. The assistant cannot change equipment or configuration.
            </p>
          ) : null}
          {entries.map((e) =>
            e.kind === 'user' ? (
              <div key={e.id} className={styles.user}>
                <span className="visually-hidden">You: </span>
                {e.text}
              </div>
            ) : (
              <div key={e.turn.id} className={styles.turn}>
                {e.turn.blocks.map((b, i) =>
                  b.type === 'text' ? (
                    <div key={i} className={styles.text}>
                      {b.text}
                    </div>
                  ) : (
                    <div key={i} className={styles.tool}>
                      <span className={styles.toolName}>
                        Tool call · {b.tool} · {TOOL_STATUS[b.status]}
                      </span>
                      <span>{b.summary}</span>
                      {b.provenance.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {b.provenance.map((p) => (
                            <li key={`${p.kind}-${p.id}`}>
                              <Link href={provenanceHref(orgSlug, p)}>{p.label}</Link> <span className="muted">({p.kind})</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ),
                )}
                <div className={styles.meta}>
                  {e.turn.provider.displayName} · {e.turn.provider.model} · {LOCALITY[e.turn.provider.locality].label}
                  {e.turn.egress.categories.length > 0
                    ? ` · sent: ${e.turn.egress.categories.map((c) => DATA_CATEGORY[c].label.toLowerCase()).join(', ')}`
                    : ' · no operational data sent'}
                  {e.turn.egress.redactedFieldCount > 0 ? ` · ${e.turn.egress.redactedFieldCount} field(s) redacted` : ''}
                </div>
              </div>
            ),
          )}
          {busy ? <p role="status">Waiting for the assistant…</p> : null}
        </div>
        {problem ? <ErrorState problem={problem} /> : null}
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="assistant-input" className="visually-hidden">
            Message
          </label>
          <textarea
            id="assistant-input"
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask a question (Ctrl+Enter to send)"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className={styles.meta}>Conversations are retained locally for {policy?.retention.localTranscriptDays ?? '—'} days under policy.</span>
            <Button type="submit" variant="primary" disabled={busy || draft.trim().length === 0}>
              Send
            </Button>
          </div>
        </form>
      </div>
      <aside className={styles.side} aria-label="Model and data policy">
        <label style={{ display: 'grid', gap: 4 }}>
          Model provider
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        {provider ? (
          <div>
            <div>
              {PROVIDER_CLASS[provider.providerClass]} · <span className="mono">{provider.model}</span>
            </div>
            <div>
              <Glyph shape={LOCALITY[provider.locality].egress ? 'triangle' : 'check'} /> {LOCALITY[provider.locality].label}
            </div>
          </div>
        ) : null}
        {policy ? (
          <div>
            <strong>May be sent</strong>
            <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
              {policy.allowedCategories.map((c) => (
                <li key={c}>{DATA_CATEGORY[c].label}</li>
              ))}
            </ul>
            <strong>Never sent</strong>
            <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
              {policy.prohibitedCategories.map((c) => (
                <li key={c}>{DATA_CATEGORY[c].label}</li>
              ))}
            </ul>
            <div className={styles.meta}>
              Policy {policy.id} v{policy.version} · redaction {policy.redaction.enabled ? 'on' : 'off'} · pseudonymisation{' '}
              {policy.pseudonymization.enabled ? 'on' : 'off'}
            </div>
          </div>
        ) : null}
        <Link href={orgPath(orgSlug, 'ai', 'governance')}>AI governance</Link>
      </aside>
    </div>
  );
}
