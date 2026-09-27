import { CONNECTIVITY, ENVIRONMENT, formatAge } from '@waylorn/domain';
import { useApi, useOrgQuery } from '@/api';
import { useNow } from '@/use-now';
import { useAuth } from '@/auth';
import { Body, Button, Card, LoadState, Screen, StatusText, Title } from '@/ui';

export default function Health() {
  const now = useNow();
  const { principal, org, selectOrg } = useApi();
  const { signOut } = useAuth();
  const q = useOrgQuery((api, orgId) => api.GET('/orgs/{orgId}/overview', { params: { path: { orgId } } }));
  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <LoadState loading={q.loading && !q.data} problem={q.problem}>
        {q.data?.sites.map(({ site, assetHealth, openIncidents }) => (
          <Card key={site.id} accessibilityLabel={`${site.name}, ${CONNECTIVITY[site.connectivity.state].label}`}>
            <Title>{site.name}</Title>
            <Body muted>
              {site.code} · {ENVIRONMENT[site.environment].label}
            </Body>
            <StatusText status={CONNECTIVITY[site.connectivity.state]} />
            <Body muted>last contact {formatAge(site.connectivity.lastContactAt, now)}</Body>
            <Body>
              {assetHealth.fault} faults · {assetHealth.warning} warnings · {assetHealth.unknown} unknown · {openIncidents.critical} critical incidents
            </Body>
          </Card>
        ))}
      </LoadState>
      {principal && principal.organizations.length > 1 ? (
        <Card>
          <Body muted>Organization</Body>
          {principal.organizations.map((o) => (
            <Button key={o.id} label={o.id === org?.id ? `${o.name} (current)` : o.name} onPress={() => selectOrg(o.id)} disabled={o.id === org?.id} />
          ))}
        </Card>
      ) : null}
      <Button label="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}
