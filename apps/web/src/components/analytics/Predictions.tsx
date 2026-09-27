import type { Prediction } from '@waylorn/contracts';
import { formatAge, formatPercent, formatTimestamp, PREDICTION_CAVEAT, presentPrediction } from '@waylorn/domain';
import { Glyph } from '@/components/ui/Glyph';
import { DataTable, tableStyles } from '@/components/ui/Table';

/**
 * ML-plane estimates. Always shows model and version, inference time, input freshness,
 * uncertainty and contributing signals; never presented as fact.
 */
export function Predictions({ items, now }: { items: readonly Prediction[]; now: number }) {
  if (items.length === 0) return <p style={{ padding: 16 }} className="muted">No current model estimates for this asset.</p>;
  return (
    <DataTable label="Model estimates" caption={PREDICTION_CAVEAT}>
      <thead>
        <tr>
          <th scope="col">Estimate</th>
          <th scope="col">Uncertainty</th>
          <th scope="col">Contributing signals</th>
          <th scope="col">Model</th>
          <th scope="col">Inputs</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => {
          const view = presentPrediction(p);
          return (
            <tr key={p.id}>
              <th scope="row" style={{ fontWeight: 400, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                <strong>{view.headline}</strong>
                <span className={tableStyles.sub}>{p.summary}</span>
                {view.stale ? (
                  <span className={tableStyles.sub} style={{ color: 'var(--status-warning)' }}>
                    <Glyph shape="triangle" /> {view.statusText}
                  </span>
                ) : null}
              </th>
              <td style={{ verticalAlign: 'top', paddingTop: 8 }}>
                {view.intervalText ?? <span className="muted">No interval reported</span>}
                {view.confidenceText ? <span className={tableStyles.sub}>{view.confidenceText}</span> : null}
              </td>
              <td style={{ verticalAlign: 'top', paddingTop: 8 }}>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {p.contributingSignals.map((s) => (
                    <li key={s.signal}>
                      {s.label} <span className="muted">({formatPercent(s.contribution, 0)})</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td style={{ verticalAlign: 'top', paddingTop: 8 }} className="nowrap">
                <span className="mono">
                  {p.model.name} {p.model.version}
                </span>
                <span className={tableStyles.sub}>inferred {formatAge(p.inferredAt, now)}</span>
                <span className={tableStyles.sub}>{formatTimestamp(p.inferredAt, 'UTC')}</span>
              </td>
              <td style={{ verticalAlign: 'top', paddingTop: 8 }} className="nowrap">
                latest input {formatAge(p.dataFreshness.latestInputAt, now)}
                <span className={tableStyles.sub}>coverage {formatPercent(p.dataFreshness.coverage, 0)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
