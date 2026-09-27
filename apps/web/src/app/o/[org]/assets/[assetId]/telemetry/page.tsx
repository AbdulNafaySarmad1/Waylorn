import type { Metadata } from 'next';
import { assertSeriesWithinBudget, DEFAULT_SERIES_POINTS, formatTimestamp, humanizeToken, parseTimeRange, rangeBounds, SeriesBudgetError, TIME_RANGES } from '@waylorn/domain';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, ProvenanceNote, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Field, FilterBar } from '@/components/ui/Table';
import { param, type SearchParams } from '@/lib/search-params';
import { assetContext } from '@/server/asset';
import { load } from '@/server/load';
import { requestTime } from '@/server/time';

export const metadata: Metadata = { title: 'Telemetry' };

export default async function Telemetry({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; assetId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { org: slug, assetId } = await params;
  const sp = await searchParams;
  const { api, org, asset } = await assetContext(slug, assetId);
  const signals = await load(api.GET('/orgs/{orgId}/assets/{assetId}/telemetry/signals', { params: { path: { orgId: org.id, assetId } } }));
  if (!signals.ok) {
    return (
      <PageBody>
        <LoadError status={signals.status} problem={signals.problem} />
      </PageBody>
    );
  }
  if (signals.data.items.length === 0) {
    return (
      <PageBody>
        <EmptyState title="No telemetry history">This asset has no historised numeric signals.</EmptyState>
      </PageBody>
    );
  }
  const requested = param(sp, 'signal');
  const signal = signals.data.items.find((s) => s.key === requested) ?? signals.data.items[0];
  if (!signal) return null;
  const range = parseTimeRange(param(sp, 'range'));
  const bounds = rangeBounds(range, requestTime());
  const series = await load(
    api.GET('/orgs/{orgId}/assets/{assetId}/telemetry/series', {
      params: { path: { orgId: org.id, assetId }, query: { signal: signal.key, from: bounds.from, to: bounds.to, maxPoints: DEFAULT_SERIES_POINTS } },
    }),
  );
  let budgetError: SeriesBudgetError | undefined;
  if (series.ok) {
    try {
      assertSeriesWithinBudget(series.data);
    } catch (e) {
      if (e instanceof SeriesBudgetError) budgetError = e;
      else throw e;
    }
  }
  const tz = 'UTC';

  return (
    <PageBody>
      <Section title="History" meta={asset.ok ? `${asset.data.tag} · times in ${tz}` : undefined} flush>
        <FilterBar label="Telemetry selection">
          <Field label="Signal" htmlFor="signal">
            <select id="signal" name="signal" defaultValue={signal.key}>
              {signals.data.items.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.unit ? ` (${s.unit})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Range" htmlFor="range">
            <select id="range" name="range" defaultValue={range}>
              {TIME_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  Last {r.label}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={buttonClass('primary')}>
            Show
          </button>
        </FilterBar>
        {!series.ok ? (
          <LoadError status={series.status} problem={series.problem} />
        ) : budgetError ? (
          <ErrorState problem={{ title: 'Series too large to display', message: budgetError.message, action: 'none', correlationId: undefined }} />
        ) : (
          <>
            <TelemetryChart series={series.data} from={bounds.from} to={bounds.to} timeZone={tz} />
            <div style={{ padding: '0 16px 16px' }}>
              <ProvenanceNote>
                Server-aggregated (min / mean / max) at {series.data.resolutionSeconds} s resolution from {series.data.provenance.source}
                {series.data.provenance.computedAt ? `, computed ${formatTimestamp(series.data.provenance.computedAt, tz)}` : ''}. Retention{' '}
                {signal.retention}.
              </ProvenanceNote>
              {series.data.gaps.map((g) => (
                <ProvenanceNote key={g.from}>
                  Gap {formatTimestamp(g.from, tz)} – {formatTimestamp(g.to, tz)}: {humanizeToken(g.reason)}
                </ProvenanceNote>
              ))}
            </div>
          </>
        )}
      </Section>
    </PageBody>
  );
}
