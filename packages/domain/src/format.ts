/** Formatting helpers. Deterministic, locale-explicit and unit-preserving. */

const DEFAULT_LOCALE = 'en-GB';

export function formatNumber(value: number, maximumFractionDigits = 2, locale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatWithUnit(value: number | undefined | null, unit?: string, digits = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  const n = formatNumber(value, digits);
  if (!unit) return n;
  if (unit === '%') return `${n} %`;
  return `${n} ${unit}`;
}

export function formatPercent(fraction: number | undefined, digits = 1): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${formatNumber(fraction * 100, digits)} %`;
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** Compact duration for elapsed times, e.g. `4 s`, `12 min`, `3 h 5 min`, `2 d 4 h`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const negative = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  let out: string;
  if (d > 0) out = h > 0 ? `${d} d ${h} h` : `${d} d`;
  else if (h > 0) out = m > 0 ? `${h} h ${m} min` : `${h} h`;
  else if (m > 0) out = `${m} min`;
  else out = `${s} s`;
  return negative ? `in ${out}` : out;
}

export function formatAge(isoTimestamp: string | undefined, nowMs: number): string {
  if (isoTimestamp === undefined) return 'never';
  const t = Date.parse(isoTimestamp);
  if (Number.isNaN(t)) return 'invalid time';
  const diff = nowMs - t;
  if (diff < 0) return formatDuration(diff);
  return `${formatDuration(diff)} ago`;
}

/**
 * Absolute timestamp. Operators work across sites and shifts, so the zone is always
 * shown; the default is the site's zone, with UTC available for correlation.
 */
export function formatTimestamp(
  isoTimestamp: string | undefined,
  timeZone = 'UTC',
  options: { readonly seconds?: boolean; readonly date?: boolean } = {},
): string {
  if (isoTimestamp === undefined) return '—';
  const t = Date.parse(isoTimestamp);
  if (Number.isNaN(t)) return 'invalid time';
  const withDate = options.date ?? true;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: withDate ? 'numeric' : undefined,
    month: withDate ? '2-digit' : undefined,
    day: withDate ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    second: options.seconds === false ? undefined : '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(new Date(t));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const time = [get('hour'), get('minute'), options.seconds === false ? '' : get('second')]
    .filter(Boolean)
    .join(':');
  const date = withDate ? `${get('year')}-${get('month')}-${get('day')} ` : '';
  return `${date}${time} ${get('timeZoneName')}`.trim();
}

export function formatCurrency(value: number | undefined, currency: string): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value);
}

export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
