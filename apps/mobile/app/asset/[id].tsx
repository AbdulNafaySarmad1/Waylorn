import { Stack, useLocalSearchParams } from 'expo-router';
import { classifyFreshness, contextPath, formatAge, formatWithUnit, FRESHNESS_LABEL, HEALTH, humanizeToken } from '@waylorn/domain';
import { useOrgQuery } from '@/api';
import { useNow } from '@/use-now';
import { Body, Card, LoadState, Screen, StatusText, Title } from '@/ui';

export default function AssetDetail() {
  const now = useNow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asset = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/assets/{assetId}', { params: { path: { orgId, assetId: id } } }), [id]);
  const live = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/assets/{assetId}/live', { params: { path: { orgId, assetId: id } } }), [id]);
  const work = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/assets/{assetId}/maintenance', { params: { path: { orgId, assetId: id } } }), [id]);
  const a = asset.data;
  return (
    <Screen refreshing={live.loading} onRefresh={() => { asset.reload(); live.reload(); work.reload(); }}>
      <Stack.Screen options={{ title: a?.tag ?? 'Asset' }} />
      <LoadState loading={asset.loading && !a} problem={asset.problem}>
        {a ? (
          <Card>
            <Title>
              {a.tag} — {a.name}
            </Title>
            <Body muted>{contextPath(a.context)}</Body>
            <StatusText status={HEALTH[a.health.state]} label={`${HEALTH[a.health.state].label}${a.health.reason ? ` — ${a.health.reason}` : ''}`} />
            <Body muted>{[a.manufacturer, a.model].filter(Boolean).join(' ')}</Body>
          </Card>
        ) : null}
      </LoadState>
      <Title>Current values</Title>
      <Body muted>Snapshot at load time. Pull to refresh; values do not update live on mobile.</Body>
      <LoadState loading={live.loading && !live.data} problem={live.problem}>
        {live.data?.signals.map((s) => {
          const f = classifyFreshness({ observedAt: s.observedAt, expectedIntervalMs: s.expectedIntervalMs, streamConnected: true }, now);
          return (
            <Card key={s.key}>
              <Body>{s.label}</Body>
              <Title>{typeof s.value === 'number' ? formatWithUnit(s.value, s.unit) : String(s.value ?? '—')}</Title>
              <Body muted>
                {FRESHNESS_LABEL[f]} · observed {formatAge(s.observedAt, now)}
              </Body>
            </Card>
          );
        })}
      </LoadState>
      <Title>Maintenance</Title>
      <LoadState loading={work.loading && !work.data} problem={work.problem} empty={work.data?.items.length === 0 && 'No work orders.'}>
        {work.data?.items.map((w) => (
          <Card key={w.id}>
            <Body mono>{w.id}</Body>
            <Body>{w.title}</Body>
            <Body muted>
              {humanizeToken(w.type)} · {humanizeToken(w.status)} · {w.system}
            </Body>
          </Card>
        ))}
      </LoadState>
    </Screen>
  );
}
