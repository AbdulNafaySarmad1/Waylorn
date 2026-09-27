'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ClientSession {
  readonly subject: string;
  readonly displayName: string;
  readonly authTime: number;
  readonly acr: string | undefined;
  readonly csrfToken: string;
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly orgId: string;
  readonly orgSlug: string;
  readonly orgName: string;
}

const Ctx = createContext<ClientSession | undefined>(undefined);

let currentCsrf: string | undefined;
export function csrfToken(): string | undefined {
  return currentCsrf;
}

export type ControlPlaneReachability = 'reachable' | 'unreachable' | 'session_ended';

/**
 * Holds non-secret session metadata in the browser and polls the BFF so expiry warnings and
 * step-up freshness stay accurate. Tokens are never present client-side.
 */
export function SessionProvider({ value, children }: { value: ClientSession; children: ReactNode }) {
  const [session, setSession] = useState(value);

  useEffect(() => {
    currentCsrf = session.csrfToken;
  }, [session.csrfToken]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/bff/session', { cache: 'no-store' });
        if (cancelled) return;
        if (r.status === 401) {
          window.dispatchEvent(new CustomEvent<ControlPlaneReachability>('waylorn:reachability', { detail: 'session_ended' }));
          return;
        }
        const body = (await r.json()) as Omit<ClientSession, 'orgId' | 'orgSlug' | 'orgName'>;
        setSession((s) => ({ ...s, ...body }));
        window.dispatchEvent(new CustomEvent<ControlPlaneReachability>('waylorn:reachability', { detail: 'reachable' }));
      } catch {
        if (!cancelled) window.dispatchEvent(new CustomEvent<ControlPlaneReachability>('waylorn:reachability', { detail: 'unreachable' }));
      }
    };
    const id = setInterval(() => void poll(), 30_000);
    const onRequest = () => void poll();
    window.addEventListener('waylorn:session-poll', onRequest);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('waylorn:session-poll', onRequest);
    };
  }, []);

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession(): ClientSession {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
