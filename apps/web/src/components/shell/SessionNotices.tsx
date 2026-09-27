'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDuration } from '@waylorn/domain';
import { Banner } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/session-context';
import { useNow } from '@/lib/use-now';

const WARN_MS = 3 * 60_000;

/**
 * Warns before idle or absolute session expiry, and tells the operator plainly when the
 * session has ended. Nothing is silently lost: the sign-in link returns to this page.
 */
export function SessionNotices() {
  const session = useSession();
  const now = useNow();
  const pathname = usePathname();
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === 'session_ended') setEnded(true);
    };
    window.addEventListener('waylorn:reachability', onEvent);
    return () => window.removeEventListener('waylorn:reachability', onEvent);
  }, []);

  const login = `/auth/login?returnTo=${encodeURIComponent(pathname)}`;
  if (ended || now >= session.idleExpiresAt) {
    return (
      <Banner tone="fault">
        Your session has ended. Views are no longer updating. <a href={login}>Sign in again</a> to continue on this page.
      </Banner>
    );
  }
  if (session.absoluteExpiresAt - now < WARN_MS) {
    return (
      <Banner tone="degraded">
        Your session reaches its maximum length in {formatDuration(session.absoluteExpiresAt - now)}. <a href={login}>Sign in again</a> to
        continue without interruption.
      </Banner>
    );
  }
  if (session.idleExpiresAt - now < WARN_MS) {
    return (
      <Banner tone="degraded">
        Your session will end in {formatDuration(session.idleExpiresAt - now)} due to inactivity.{' '}
        <Button small onClick={() => void fetch('/api/bff/v0/me', { cache: 'no-store' }).then(() => window.dispatchEvent(new Event('waylorn:session-poll')))}>
          Stay signed in
        </Button>
      </Banner>
    );
  }
  return null;
}
