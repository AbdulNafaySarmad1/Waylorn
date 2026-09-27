import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { HEALTH } from '@waylorn/domain';
import { useOrgQuery } from '@/api';
import { Body, Card, LoadState, Screen, StatusText, useTheme } from '@/ui';

export default function AssetLookup() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const term = q.trim();
  const res = useOrgQuery(
    (api, orgId) => api.GET('/orgs/{orgId}/assets', { params: { path: { orgId }, query: { limit: 25, ...(term.length >= 2 ? { q: term } : { sort: 'health' }) } } }),
    [term],
  );
  return (
    <Screen>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Tag, name or serial"
        accessibilityLabel="Search assets"
        autoCapitalize="characters"
        autoCorrect={false}
        style={{ minHeight: 44, borderWidth: 1, borderColor: t.borderSubtle, paddingHorizontal: 12, color: t.textPrimary, backgroundColor: t.surface1 }}
      />
      <LoadState loading={res.loading && !res.data} problem={res.problem} empty={res.data?.items.length === 0 && 'No matching assets.'}>
        {res.data?.items.map((a) => (
          <Card key={a.id} onPress={() => router.push({ pathname: '/asset/[id]', params: { id: a.id } })} accessibilityLabel={`${a.tag}, ${a.name}`}>
            <Body mono>{a.tag}</Body>
            <Body>{a.name}</Body>
            <StatusText status={HEALTH[a.health.state]} />
            <Body muted>
              {a.context.site.code}
              {a.context.line ? ` · ${a.context.line.name}` : ''}
            </Body>
          </Card>
        ))}
      </LoadState>
    </Screen>
  );
}
