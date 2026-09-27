import Link from 'next/link';
import styles from '../../standalone.module.css';

const MESSAGES: Record<string, string> = {
  expired: 'The sign-in attempt expired or was already used. Start again.',
  denied: 'The identity provider did not complete sign-in.',
  exchange_failed: 'Sign-in could not be verified. Start again; if this persists, contact your administrator with the time of the attempt.',
  subject_mismatch: 'Re-authentication was completed by a different account. For safety, the original session was kept unchanged.',
  step_up_insufficient: 'The identity provider did not confirm the stronger authentication required for this action.',
  idp_unavailable: 'The identity provider is unreachable. Operations at the site are not affected.',
};

export default async function AuthError({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ''] ?? 'Sign-in failed.';
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Sign-in problem</h1>
      <p role="alert">{message}</p>
      <p>
        <Link href="/auth/login">Sign in</Link>
      </p>
    </main>
  );
}
