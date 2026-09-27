import Link from 'next/link';
import type { Metadata } from 'next';
import { formatNumber, formatPercent, humanizeToken, orgPath, presentPrediction } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { PageBody, PageHeader, ProvenanceNote, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { NotYetAvailable } from '@/components/ui/States';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { Timestamp } from '@/components/ui/Time';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Asset review' };

const RECOMMENDATION = {
  retain: { label: 'Retain', glyph: 'check' },
  monitor: { label: 'Monitor', glyph: 'diamond' },
  plan_replacement: { label: 'Plan replacement', glyph: 'triangle' },
  replace: { label: 'Replace', glyph: 'cross' },
} as const;

const TREND = { improving: 'Improving', stable: 'Stable', degrading: 'Degrading', insufficient_data: 'Insufficient data' } as const;

export default async function Review({ params }: { params: Promise<{ org: string; reviewId: string }> }) {
  const { org: slug, reviewId } = await params;
  const { api, org } = await orgContext(slug);
  const res = await load(api.GET('/orgs/{orgId}/reliability/reviews/{reviewId}', { params: { path: { orgId: org.id, reviewId } } }));
  if (!res.ok) {
    return (
      <PageBody>
        <LoadError status={res.status} problem={res.problem} />
      </PageBody>
    );
  }
  const r = res.data;
  return (
    <>
      <PageHeader
        title={r.title}
        eyebrow={<Link href={orgPath(slug, 'reliability')}>Reliability › Reviews</Link>}
        subtitle={`${r.periodLabel} · scope ${r.scope} · ${humanizeToken(r.status)}`}
      />
      <PageBody>
        <Section title="Candidates" meta={`${r.candidates.length} assets screened`} flush>
          <DataTable
            label="Review candidates"
            caption="Recommendations are produced by a rule-based screening for human review. They are not decisions. Failure risk is a model estimate."
          >
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col" className={tableStyles.num}>
                  Age
                </th>
                <th scope="col">Vendor support</th>
                <th scope="col" className={tableStyles.num}>
                  Availability
                </th>
                <th scope="col" className={tableStyles.num}>
                  MTBF
                </th>
                <th scope="col" className={tableStyles.num}>
                  Unplanned downtime
                </th>
                <th scope="col">Trend</th>
                <th scope="col">Failure risk (model)</th>
                <th scope="col">Screening result</th>
              </tr>
            </thead>
            <tbody>
              {r.candidates.map((c) => {
                const rec = RECOMMENDATION[c.recommendation];
                return (
                  <tr key={c.asset.id}>
                    <th scope="row" className={tableStyles.primaryCell}>
                      <Link href={orgPath(slug, 'assets', c.asset.id, 'reliability')} className="mono">
                        {c.asset.tag}
                      </Link>
                      <span className={tableStyles.sub}>
                        {c.asset.manufacturer} {c.asset.model}
                      </span>
                    </th>
                    <td className={tableStyles.num}>{c.ageYears !== undefined ? `${c.ageYears} y` : '—'}</td>
                    <td>{c.vendorSupport ? humanizeToken(c.vendorSupport) : '—'}</td>
                    <td className={tableStyles.num}>{formatPercent(c.availability, 1)}</td>
                    <td className={tableStyles.num}>{c.mtbfHours !== undefined ? `${formatNumber(c.mtbfHours, 0)} h` : '—'}</td>
                    <td className={tableStyles.num}>{c.unplannedDowntimeHours !== undefined ? `${formatNumber(c.unplannedDowntimeHours, 1)} h` : '—'}</td>
                    <td>{TREND[c.trend]}</td>
                    <td>
                      {c.failureRisk ? (
                        <>
                          {presentPrediction(c.failureRisk).headline.replace(/^Estimated [^:]+: /, '')}
                          <span className={tableStyles.sub}>
                            {c.failureRisk.model.name} {c.failureRisk.model.version}
                          </span>
                        </>
                      ) : (
                        <span className="muted">No estimate</span>
                      )}
                    </td>
                    <td>
                      <span className="nowrap">
                        <Glyph shape={rec.glyph} /> <strong>{rec.label}</strong>
                      </span>
                      <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {c.rationale.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <div style={{ padding: '8px 16px 12px' }}>
            <ProvenanceNote>
              Screening method {r.method.id} {r.method.version}: {r.method.description}. Computed <Timestamp iso={r.computedAt} />.
            </ProvenanceNote>
          </div>
        </Section>
        <NotYetAvailable
          area="Recording review decisions"
          requires="a review-decision API (approve, defer, budget reference) with audit"
          meanwhile="Record decisions in your capital-planning process and reference this review ID."
        />
      </PageBody>
    </>
  );
}
