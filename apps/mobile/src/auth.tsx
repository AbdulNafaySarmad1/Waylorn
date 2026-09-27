import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config } from './config';

WebBrowser.maybeCompleteAuthSession();

/**
 * Mobile authentication (ADR 0014): public OIDC client, Authorization Code + PKCE in the
 * system browser, tokens only in the platform keystore via SecureStore. Authorization is
 * always decided by the control plane.
 */
interface Tokens {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly idToken: string | undefined;
  readonly expiresAt: number;
}

const STORE_KEY = 'waylorn.tokens';

async function loadTokens(): Promise<Tokens | undefined> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    await SecureStore.deleteItemAsync(STORE_KEY);
    return undefined;
  }
}

async function saveTokens(tokens: Tokens | undefined): Promise<void> {
  if (!tokens) await SecureStore.deleteItemAsync(STORE_KEY);
  else await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

function fromResponse(r: AuthSession.TokenResponse, previousRefresh?: string): Tokens {
  return {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken ?? previousRefresh,
    idToken: r.idToken,
    expiresAt: Date.now() + (r.expiresIn ?? 60) * 1000,
  };
}

interface AuthContextValue {
  readonly state: 'loading' | 'signed_out' | 'signed_in';
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Returns a valid access token, refreshing if needed, or undefined if the session ended. */
  readonly accessToken: () => Promise<string | undefined>;
  readonly error: string | undefined;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const discovery = AuthSession.useAutoDiscovery(config.oidcIssuer);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'waylorn', path: 'auth/callback' });
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    { clientId: config.oidcClientId, redirectUri, scopes: ['openid', 'profile', 'email', 'offline_access'], usePKCE: true },
    discovery,
  );
  const [state, setState] = useState<AuthContextValue['state']>('loading');
  const [error, setError] = useState<string | undefined>();
  const tokens = useRef<Tokens | undefined>(undefined);
  const refreshing = useRef<Promise<string | undefined> | undefined>(undefined);

  useEffect(() => {
    void loadTokens().then((t) => {
      tokens.current = t;
      setState(t ? 'signed_in' : 'signed_out');
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!request || !discovery) return;
    setError(undefined);
    const result = await promptAsync();
    if (result.type !== 'success') {
      if (result.type === 'error') setError(result.error?.message ?? 'Sign-in failed');
      return;
    }
    const code = result.params['code'];
    if (!code || !request.codeVerifier) {
      setError('Sign-in response was incomplete');
      return;
    }
    const response = await AuthSession.exchangeCodeAsync(
      { clientId: config.oidcClientId, code, redirectUri, extraParams: { code_verifier: request.codeVerifier } },
      discovery,
    );
    tokens.current = fromResponse(response);
    await saveTokens(tokens.current);
    setState('signed_in');
  }, [discovery, promptAsync, redirectUri, request]);

  const signOut = useCallback(async () => {
    const idToken = tokens.current?.idToken;
    tokens.current = undefined;
    await saveTokens(undefined);
    setState('signed_out');
    if (discovery?.endSessionEndpoint && idToken) {
      await WebBrowser.openAuthSessionAsync(
        `${discovery.endSessionEndpoint}?id_token_hint=${encodeURIComponent(idToken)}`,
        redirectUri,
      ).catch(() => undefined);
    }
  }, [discovery, redirectUri]);

  const accessToken = useCallback(async (): Promise<string | undefined> => {
    const t = tokens.current;
    if (!t) return undefined;
    if (t.expiresAt - Date.now() > 30_000) return t.accessToken;
    if (!t.refreshToken || !discovery) {
      await signOut();
      return undefined;
    }
    // Single-flight: refresh tokens rotate.
    refreshing.current ??= AuthSession.refreshAsync({ clientId: config.oidcClientId, refreshToken: t.refreshToken }, discovery)
      .then(async (r) => {
        tokens.current = fromResponse(r, t.refreshToken);
        await saveTokens(tokens.current);
        return tokens.current.accessToken;
      })
      .catch(async () => {
        await signOut();
        return undefined;
      })
      .finally(() => {
        refreshing.current = undefined;
      });
    return refreshing.current;
  }, [discovery, signOut]);

  const value = useMemo(() => ({ state, signIn, signOut, accessToken, error }), [accessToken, error, signIn, signOut, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
