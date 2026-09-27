import Link from 'next/link';
import type { Metadata } from 'next';
import { humanizeToken, orgPath } from '@waylorn/domain';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Reliability' };

export default async function ReliabilityReviews({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { api, org } = await orgContext(slug);
  const res = await load(api.GET('/orgs/{orgId}/reliability/reviews', { params: { path: { orgId: org.id } } }));
  return (
    <>
      <PageHeader
        title="Reliability"
        eyebrow={org.name}
        subtitle="Periodic asset reviews for management: ageing equipment, reliability trends and replacement candidates. Per-asset metrics are on each asset's Reliability view."
      />
      <PageBody>
        <Section title="Asset reviews" flush>
          {!res.ok ? (
            <LoadError status={res.status} problem={res.problem} />
          ) : res.data.items.length === 0 ? (
            <EmptyState title="No reviews scheduled" />
          ) : (
            <DataTable label="Asset reviews">
              <thead>
                <tr>
                  <th scope="col">Review</th>
                  <th scope="col">Period</th>
                  <th scope="col">Scope</th>
                  <th scope="col" className={tableStyles.num}>
                    Candidates
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Due</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className={tableStyles.primaryCell}>
                      <Link href={orgPath(slug, 'reliability', 'reviews', r.id)}>{r.title}</Link>
                    </th>
                    <td>{r.periodLabel}</td>
                    <td>{r.scope}</td>
                    <td className={tableStyles.num}>{r.candidateCount}</td>
                    <td>{humanizeToken(r.status)}</td>
                    <td>
                      <Timestamp iso={r.dueAt} seconds={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      </PageBody>
    </>
  );
}
