import type { ConfidenceInterval, Prediction, ReliabilityMetric } from '@waylorn/contracts';
import { formatNumber, formatPercent, formatWithUnit } from './format';

/**
 * Presentation of analytics-plane and ML-plane outputs. Nothing here computes metrics;
 * it only formats values supplied by the backend with their qualifiers.
 */

export function formatInterval(interval: ConfidenceInterval | undefined, unit?: string): string | undefined {
  if (interval === undefined) return undefined;
  const level = formatNumber(interval.level * 100, 0);
  if (unit === 'ratio') {
    return `${level} % CI ${formatPercent(interval.lower)} – ${formatPercent(interval.upper)}`;
  }
  return `${level} % CI ${formatWithUnit(interval.lower, unit)} – ${formatWithUnit(interval.upper, unit)}`;
}

export interface MetricPresentation {
  readonly valueText: string;
  readonly intervalText: string | undefined;
  readonly qualifiers: readonly string[];
  readonly insufficient: boolean;
}

export function presentMetric(metric: ReliabilityMetric): MetricPresentation {
  const insufficient = metric.value === undefined;
  const valueText = insufficient
    ? 'Insufficient data'
    : metric.unit === 'ratio'
      ? formatPercent(metric.value, 2)
      : formatWithUnit(metric.value, metric.unit, 1);
  const qualifiers = [`n = ${formatNumber(metric.sampleSize, 0)}`, `coverage ${formatPercent(metric.dataCoverage, 0)}`];
  if (metric.dataCoverage < 0.8) qualifiers.push('low data coverage');
  return {
    valueText,
    intervalText: insufficient ? undefined : formatInterval(metric.interval, metric.unit),
    qualifiers,
    insufficient,
  };
}

export const PREDICTION_CAVEAT = 'Model estimate. Not a measurement and not a guarantee of future behaviour.';

export interface PredictionPresentation {
  readonly headline: string;
  readonly intervalText: string | undefined;
  readonly confidenceText: string | undefined;
  readonly stale: boolean;
  readonly statusText: string;
}

export function presentPrediction(prediction: Prediction): PredictionPresentation {
  const est = prediction.estimate;
  let headline: string;
  if (est?.value !== undefined) {
    const value = est.unit === 'ratio' ? formatPercent(est.value, 0) : formatWithUnit(est.value, est.unit, 1);
    headline = `Estimated ${prediction.label.toLowerCase()}: ${value}`;
  } else if (prediction.category !== undefined) {
    headline = `${prediction.label}: ${prediction.category} (model classification)`;
  } else {
    headline = `${prediction.label}: no estimate available`;
  }
  const stale = prediction.status !== 'current';
  return {
    headline,
    intervalText: est === undefined ? undefined : formatInterval(est.interval, est.unit),
    confidenceText:
      prediction.confidence === undefined ? undefined : `Model-reported confidence ${formatPercent(prediction.confidence, 0)}`,
    stale,
    statusText:
      prediction.status === 'current'
        ? 'Current'
        : prediction.status === 'stale'
          ? 'Stale — inputs are out of date'
          : 'Superseded by a newer model run',
  };
}
