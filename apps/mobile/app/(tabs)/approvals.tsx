import { contextPath, effectiveSafetyClass, formatAge, SAFETY_CLASS } from '@waylorn/domain';
import { useOrgQuery } from '@/api';
import { useNow } from '@/use-now';
import { Body, Card, LoadState, Screen, Title } from '@/ui';

/**
 * Review-only (ADR 0013). Approving consequential commands needs device-bound step-up
 * authentication, which is not designed yet; approvals are completed on a workstation.
 */
export default function Approvals() {
  const now = useNow();
  const q = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/approvals', { params: { path: { orgId } } }));
  const items = q.data?.items ?? [];
  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <Body muted>Review requests waiting for you. Approve or reject them at a workstation, where the full target and policy context is shown.</Body>
      <LoadState loading={q.loading && !q.data} problem={q.problem} empty={items.length === 0 && 'Nothing waiting for your approval.'}>
        {items.map((c) => {
          const cls = SAFETY_CLASS[effectiveSafetyClass(c.safetyClass)];
          return (
            <Card key={c.id}>
              <Title>{cls.label}</Title>
              <Body>{c.actionLabel ?? c.action}</Body>
              <Body mono>{c.target.tag}</Body>
              <Body muted>{contextPath(c.target.context)}</Body>
              <Body>Reason: {c.reason ?? '—'}</Body>
              <Body muted>
                Requested by {c.requestedBy.displayName} {formatAge(c.requestedAt, now)}
              </Body>
            </Card>
          );
        })}
      </LoadState>
    </Screen>
  );
}
