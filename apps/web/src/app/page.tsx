import { redirect } from 'next/navigation';
import { orgPath } from '@waylorn/domain';
import { requestContext } from '@/server/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { principal } = await requestContext();
  const first = principal.organizations[0];
  if (!first) {
    return (
      <main style={{ padding: 32 }}>
        <h1>No organization access</h1>
        <p>You are signed in, but the control plane grants you no organization. Ask your administrator for access.</p>
      </main>
    );
  }
  redirect(orgPath(first.slug, 'overview'));
}
