import type { Metadata } from 'next';
import { formatCurrency, humanizeToken } from '@waylorn/domain';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { DataTable, Field, FilterBar, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { param, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Cloud and cost' };

const BASIS = { provider_billing_api: 'Provider billing API', rate_card_estimate: 'Rate-card estimate', manual_allocation: 'Manual allocation' } as const;
const GROUPS = ['provider', 'account', 'site'] as const;

export default async function Cloud({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const groupBy = GROUPS.find((g) => g === param(sp, 'groupBy')) ?? 'provider';
  const { api, org } = await orgContext(slug);
  const res = await load(api.GET('/orgs/{orgId}/cloud/costs', { params: { path: { orgId: org.id }, query: { groupBy } } }));
  return (
    <>
      <PageHeader title="Cloud and cost" eyebrow={org.name} subtitle="Estimated spend from provider billing connectors. Figures are estimates, not invoices." />
      <PageBody>
        <Section title="Estimated spend" flush>
          <FilterBar label="Group costs">
            <Field label="Group by" htmlFor="groupBy">
              <select id="groupBy" name="groupBy" defaultValue={groupBy}>
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {humanizeToken(g)}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={buttonClass('primary')}>
              Apply
            </button>
          </FilterBar>
          {!res.ok ? (
            <LoadError status={res.status} problem={res.problem} />
          ) : (
            <>
              <DataTable label="Estimated spend">
                <thead>
                  <tr>
                    <th scope="col">{humanizeToken(res.data.groupBy)}</th>
                    <th scope="col" className={tableStyles.num}>Per hour</th>
                    <th scope="col" className={tableStyles.num}>Per day</th>
                    <th scope="col" className={tableStyles.num}>Month to date</th>
                    <th scope="col" className={tableStyles.num}>Month forecast</th>
                    <th scope="col">Basis</th>
                    <th scope="col">Source updated</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{r.label}</th>
                      <td className={tableStyles.num}>{formatCurrency(r.hourlyEstimate, res.data.currency)}</td>
                      <td className={tableStyles.num}>{formatCurrency(r.dailyEstimate, res.data.currency)}</td>
                      <td className={tableStyles.num}>{formatCurrency(r.monthToDate, res.data.currency)}</td>
                      <td className={tableStyles.num}>{formatCurrency(r.monthlyForecast, res.data.currency)}</td>
                      <td>{r.basis ? BASIS[r.basis] : '—'}</td>
                      <td>
                        <Timestamp iso={r.sourceUpdatedAt} seconds={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <ul style={{ margin: 0, padding: '12px 32px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {res.data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </PageBody>
    </>
  );
}
