import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createControlPlaneClient, type ControlPlaneClient, type Principal } from '@waylorn/contracts';
import { presentProblem, type ProblemPresentation } from '@waylorn/domain';
import { useAuth } from './auth';
import { config } from './config';

interface ApiContextValue {
  readonly api: ControlPlaneClient;
  readonly principal: Principal | undefined;
  readonly org: Principal['organizations'][number] | undefined;
  readonly selectOrg: (id: string) => void;
  readonly problem: ProblemPresentation | undefined;
}

const ApiContext = createContext<ApiContextValue | undefined>(undefined);

/** Typed API client (generated contract) with bearer tokens from the keystore. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const api = useMemo(() => {
    const client = createControlPlaneClient({ baseUrl: `${config.apiBaseUrl}/api/v0` });
    client.use({
      async onRequest({ request }) {
        const token = await accessToken();
        if (token) request.headers.set('authorization', `Bearer ${token}`);
        return request;
      },
    });
    return client;
  }, [accessToken]);
  const [principal, setPrincipal] = useState<Principal | undefined>();
  const [orgId, setOrgId] = useState<string | undefined>();
  const [problem, setProblem] = useState<ProblemPresentation | undefined>();

  useEffect(() => {
    void api
      .GET('/me')
      .then(({ data, error, response }) => {
        if (data) {
          setPrincipal(data);
          setOrgId((cur) => cur ?? data.organizations[0]?.id);
        } else setProblem(presentProblem(error, response.status));
      })
      .catch(() => setProblem(presentProblem(undefined, 502)));
  }, [api]);

  const org = principal?.organizations.find((o) => o.id === orgId);
  const value = useMemo(() => ({ api, principal, org, selectOrg: setOrgId, problem }), [api, org, principal, problem]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi outside ApiProvider');
  return ctx;
}

/** Loads data for the selected organization; `reload` re-requests (pull-to-refresh). */
export function useOrgQuery<T>(
  load: (api: ControlPlaneClient, orgId: string) => Promise<{ data?: T; error?: unknown; response: Response }>,
  deps: readonly unknown[] = [],
) {
  const { api, org } = useApi();
  const [version, setVersion] = useState(0);
  const key = `${org?.id ?? ''}|${version}|${JSON.stringify(deps)}`;
  const [result, setResult] = useState<{ key: string; data: T | undefined; problem: ProblemPresentation | undefined }>({
    key: '',
    data: undefined,
    problem: undefined,
  });
  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    load(api, org.id)
      .then(({ data, error, response }) => {
        if (cancelled) return;
        setResult((prev) =>
          data !== undefined
            ? { key, data, problem: undefined }
            : { key, data: prev.data, problem: presentProblem(error, response.status) },
        );
      })
      .catch(() => {
        if (!cancelled) setResult((prev) => ({ key, data: prev.data, problem: presentProblem(undefined, 502) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the request key captures org, version and caller deps
  }, [api, key]);
  return { data: result.data, problem: result.problem, loading: result.key !== key, reload: () => setVersion((v) => v + 1) };
}
