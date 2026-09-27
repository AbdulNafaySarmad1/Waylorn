import { router } from 'expo-router';
import { formatAge, SEVERITY } from '@waylorn/domain';
import { useOrgQuery } from '@/api';
import { useNow } from '@/use-now';
import { Body, Card, LoadState, Screen, StatusText } from '@/ui';

export default function Alerts() {
  const now = useNow();
  const q = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/incidents', { params: { path: { orgId }, query: { limit: 50 } } }));
  const open = q.data?.items.filter((i) => i.status !== 'resolved') ?? [];
  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <LoadState loading={q.loading && !q.data} problem={q.problem} empty={open.length === 0 && 'No open incidents.'}>
        {open.map((i) => (
          <Card
            key={i.id}
            accessibilityLabel={`${SEVERITY[i.severity].label}: ${i.title}`}
            {...(i.primaryAsset ? { onPress: () => router.push({ pathname: '/asset/[id]', params: { id: i.primaryAsset?.id ?? '' } }) } : {})}
          >
            <StatusText status={SEVERITY[i.severity]} />
            <Body>{i.title}</Body>
            <Body muted>
              {i.context.site.code} · {i.status} · opened {formatAge(i.openedAt, now)}
            </Body>
          </Card>
        ))}
      </LoadState>
    </Screen>
  );
}
