import styles from '../standalone.module.css';

export default function SignedOut() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Signed out</h1>
      <p>Your Waylorn session has ended. Local equipment and site operations are unaffected.</p>
      <ul className={styles.links}>
        <li>
          <a href="/auth/login">Sign in again</a>
        </li>
        <li>
          <a href="/auth/login?prompt=select_account">Sign in with a different account</a>
        </li>
      </ul>
    </main>
  );
}
