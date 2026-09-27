import type { Metadata } from 'next';
import { formatPercent, formatTimestamp, formatWithUnit, humanizeToken, presentMetric } from '@waylorn/domain';
import { Predictions } from '@/components/analytics/Predictions';
import { buttonClass } from '@/components/ui/Button';
import { Glyph } from '@/components/ui/Glyph';
import { PageBody, ProvenanceNote, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { DataTable, Field, FilterBar, tableStyles } from '@/components/ui/Table';
import { param, type SearchParams } from '@/lib/search-params';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';
import { requestTime } from '@/server/time';

export const metadata: Metadata = { title: 'Reliability' };

const PERIODS = [
  ['P3M', 'Last quarter'],
  ['P1Y', 'Last 12 months'],
  ['P3Y', 'Last 3 years'],
] as const;

const DIMENSION_STATUS = {
  nominal: { label: 'Nominal', glyph: 'check' },
  watch: { label: 'Watch', glyph: 'diamond' },
  degraded: { label: 'Degraded', glyph: 'triangle' },
  insufficient_data: { label: 'Insufficient data', glyph: 'question' },
} as const;

export default async function Reliability({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; assetId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { org: slug, assetId } = await params;
  const sp = await searchParams;
  const period = PERIODS.find(([p]) => p === param(sp, 'period'))?.[0] ?? 'P1Y';
  const { api, org } = await assetContext(slug, assetId);
  const [report, predictions] = await Promise.all([
    load(api.GET('/orgs/{orgId}/assets/{assetId}/reliability', { params: { path: { orgId: org.id, assetId }, query: { period } } })),
    load(api.GET('/orgs/{orgId}/assets/{assetId}/predictions', { params: { path: { orgId: org.id, assetId } } })),
  ]);
  const now = requestTime();

  return (
    <PageBody>
      <Section title="Reliability metrics" meta="Deterministic, computed by the analytics plane" flush>
        <FilterBar label="Reporting period">
          <Field label="Period" htmlFor="period">
            <select id="period" name="period" defaultValue={period}>
              {PERIODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={buttonClass('primary')}>
            Show
          </button>
        </FilterBar>
        {!report.ok ? (
          <LoadError status={report.status} problem={report.problem} />
        ) : (
          <>
            <DataTable
              label="Reliability metrics"
              caption={`Period ${formatTimestamp(report.data.periodStart, 'UTC', { seconds: false })} – ${formatTimestamp(report.data.periodEnd, 'UTC', { seconds: false })}. Computed ${formatTimestamp(report.data.computedAt, 'UTC')} by ${report.data.provenance.source}.`}
            >
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col" className={tableStyles.num}>
                    Value
                  </th>
                  <th scope="col">Confidence interval</th>
                  <th scope="col">Basis</th>
                  <th scope="col">Method</th>
                </tr>
              </thead>
              <tbody>
                {report.data.metrics.map((m) => {
                  const v = presentMetric(m);
                  return (
                    <tr key={m.key}>
                      <th scope="row">{m.label}</th>
                      <td className={tableStyles.num}>
                        {v.insufficient ? (
                          <span title={m.insufficientDataReason}>
                            <Glyph shape="question" /> {v.valueText}
                          </span>
                        ) : (
                          <strong>{v.valueText}</strong>
                        )}
                      </td>
                      <td>{v.intervalText ?? <span className="muted">—</span>}</td>
                      <td>
                        {v.qualifiers.join(' · ')}
                        {m.insufficientDataReason ? <span className={tableStyles.sub}>{m.insufficientDataReason}</span> : null}
                      </td>
                      <td className="mono">
                        {m.method.id} {m.method.version}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            {report.data.notes && report.data.notes.length > 0 ? (
              <div style={{ padding: '12px 16px' }}>
                <strong>Analytic notes</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {report.data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {report.ok && report.data.dimensions.length > 0 ? (
        <Section title="Health dimensions" meta="Separate measures — never combined into one score" flush>
          <DataTable
            label="Health dimensions"
            caption="Controller health, machine health, process, production and energy efficiency describe different things. A healthy controller can run an inefficient process."
          >
            <thead>
              <tr>
                <th scope="col">Dimension</th>
                <th scope="col">Status</th>
                <th scope="col" className={tableStyles.num}>
                  Value
                </th>
                <th scope="col">Method</th>
              </tr>
            </thead>
            <tbody>
              {report.data.dimensions.map((d) => (
                <tr key={d.dimension}>
                  <th scope="row">{d.label}</th>
                  <td className="nowrap">
                    <Glyph shape={DIMENSION_STATUS[d.status].glyph} /> {DIMENSION_STATUS[d.status].label}
                  </td>
                  <td className={tableStyles.num}>
                    {d.value === undefined ? <span className="muted">—</span> : d.unit === 'ratio' ? formatPercent(d.value) : formatWithUnit(d.value, d.unit)}
                  </td>
                  <td>
                    {d.method.description} <span className="muted mono">({d.method.id} {d.method.version})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      ) : null}

      {report.ok ? (
        <Section title="Trend" meta="Per sub-period" flush>
          <DataTable label="Reliability trend">
            <thead>
              <tr>
                <th scope="col">Sub-period starting</th>
                <th scope="col" className={tableStyles.num}>
                  Availability
                </th>
                <th scope="col" className={tableStyles.num}>
                  Failures
                </th>
              </tr>
            </thead>
            <tbody>
              {report.data.trend.map((t) => (
                <tr key={t.periodStart}>
                  <th scope="row">{formatTimestamp(t.periodStart, 'UTC', { seconds: false })}</th>
                  <td className={tableStyles.num}>{formatPercent(t.availability, 2)}</td>
                  <td className={tableStyles.num}>{t.failures}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {report.data.cohort ? (
            <DataTable
              label="Cohort comparison"
              caption={`Cohort: ${report.data.cohort.label} (${report.data.cohort.memberCount} assets). Differences describe position within the cohort; they do not explain cause.`}
            >
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col" className={tableStyles.num}>
                    This asset
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Cohort 25th pct
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Cohort median
                  </th>
                  <th scope="col" className={tableStyles.num}>
                    Cohort 75th pct
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.data.cohort.comparisons.map((c) => (
                  <tr key={c.metricKey}>
                    <th scope="row">{c.label}</th>
                    <td className={tableStyles.num}>
                      <strong>{formatWithUnit(c.assetValue, c.unit, 1)}</strong>
                    </td>
                    <td className={tableStyles.num}>{formatWithUnit(c.cohortP25, c.unit, 1)}</td>
                    <td className={tableStyles.num}>{formatWithUnit(c.cohortMedian, c.unit, 1)}</td>
                    <td className={tableStyles.num}>{formatWithUnit(c.cohortP75, c.unit, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : null}
        </Section>
      ) : null}

      <Section title="Model estimates" meta="Machine-learning plane — estimates, not measurements" flush>
        {!predictions.ok ? <LoadError status={predictions.status} problem={predictions.problem} /> : <Predictions items={predictions.data.items} now={now} />}
        <div style={{ padding: '0 16px 12px' }}>
          <ProvenanceNote>
            Estimates are produced by versioned models from the ML plane. Kinds shown: {predictions.ok ? [...new Set(predictions.data.items.map((p) => humanizeToken(p.kind)))].join(', ') || 'none' : '—'}.
          </ProvenanceNote>
        </div>
      </Section>
    </PageBody>
  );
}
