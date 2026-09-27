import Link from 'next/link';
import styles from './standalone.module.css';

export default function NotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Not found</h1>
      <p>This page does not exist, or the resource is outside the organizations and sites you can access.</p>
      <Link href="/">Go to your default organization</Link>
    </main>
  );
}
