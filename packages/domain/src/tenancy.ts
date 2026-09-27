import type { TenancyContext } from '@waylorn/contracts';

export interface ContextSegment {
  readonly level: 'organization' | 'region' | 'site' | 'zone' | 'line';
  readonly label: string;
}

/** Full location path. Used verbatim in consequential dialogs and audit displays. */
export function contextSegments(context: TenancyContext): ContextSegment[] {
  const segments: ContextSegment[] = [{ level: 'organization', label: context.organization.name }];
  if (context.region !== undefined) segments.push({ level: 'region', label: context.region });
  segments.push({ level: 'site', label: `${context.site.name} (${context.site.code})` });
  if (context.zone !== undefined) segments.push({ level: 'zone', label: context.zone.name });
  if (context.line !== undefined) segments.push({ level: 'line', label: context.line.name });
  return segments;
}

export function contextPath(context: TenancyContext, separator = ' › '): string {
  return contextSegments(context)
    .map((s) => s.label)
    .join(separator);
}

/** Organization routes always carry the org slug so a URL is never tenant-ambiguous. */
export function orgPath(orgSlug: string, ...segments: readonly string[]): string {
  const encoded = [orgSlug, ...segments].map((s) => encodeURIComponent(s));
  return `/o/${encoded.join('/')}`;
}
