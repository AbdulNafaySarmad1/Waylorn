import Link from 'next/link';
import type { Metadata } from 'next';
import { relationTypeValues, type RelationType } from '@waylorn/contracts';
import { orgPath, RELATION_LABEL } from '@waylorn/domain';
import { TopologyExplorer } from '@/components/topology/TopologyExplorer';
import { buttonClass } from '@/components/ui/Button';
import { PageBody, PageHeader, Section } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { EmptyState } from '@/components/ui/States';
import { Field, FilterBar } from '@/components/ui/Table';
import { param, type SearchParams } from '@/lib/search-params';
import { orgContext } from '@/server/api';
import { load } from '@/server/load';

export const metadata: Metadata = { title: 'Topology' };

function relationsFrom(sp: SearchParams): RelationType[] {
  const raw = sp['rel'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return relationTypeValues.filter((r) => values.includes(r));
}

export default async function Topology({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { api, org } = await orgContext(slug);
  const focus = param(sp, 'focus');
  const depth = Math.min(4, Math.max(1, Number(param(sp, 'depth') ?? 2) || 2));
  const relations = relationsFrom(sp);
  const q = param(sp, 'q');

  const [graph, search] = await Promise.all([
    focus
      ? load(
          api.GET('/orgs/{orgId}/topology/neighborhood', {
            params: { path: { orgId: org.id }, query: { focus, depth, nodeLimit: 150, ...(relations.length ? { relations } : {}) } },
          }),
        )
      : Promise.resolve(undefined),
    q ? load(api.GET('/orgs/{orgId}/assets', { params: { path: { orgId: org.id }, query: { q, limit: 10 } } })) : Promise.resolve(undefined),
  ]);

  return (
    <>
      <PageHeader
        title="Topology"
        eyebrow={org.name}
        subtitle="Explore relationships outward from one asset. Large neighbourhoods are clustered; expand deliberately."
      />
      <PageBody>
        <Section title="Scope" flush>
          <FilterBar label="Topology scope">
            <Field label="Find a starting asset" htmlFor="q">
              <input id="q" name="q" type="search" defaultValue={q ?? ''} placeholder="Tag, name or serial" />
            </Field>
            {focus ? <input type="hidden" name="focus" value={focus} /> : null}
            <Field label="Depth (hops)" htmlFor="depth">
              <select id="depth" name="depth" defaultValue={String(depth)}>
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 'var(--text-sm)' }}>
              <legend style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Relations (none selected = all)</legend>
              {relationTypeValues.map((r) => (
                <label key={r} className="nowrap">
                  <input type="checkbox" name="rel" value={r} defaultChecked={relations.includes(r)} /> {RELATION_LABEL[r]}
                </label>
              ))}
            </fieldset>
            <button type="submit" className={buttonClass('primary')}>
              Apply
            </button>
          </FilterBar>
          {search?.ok && search.data.items.length > 0 ? (
            <ul style={{ margin: 0, padding: '8px 16px 12px 32px' }}>
              {search.data.items.map((a) => (
                <li key={a.id}>
                  <Link href={`${orgPath(slug, 'topology')}?focus=${encodeURIComponent(a.id)}&depth=${depth}`}>
                    <span className="mono">{a.tag}</span> — {a.name}
                  </Link>{' '}
                  <span className="muted">{a.context.site.code}</span>
                </li>
              ))}
            </ul>
          ) : search?.ok ? (
            <p style={{ padding: '8px 16px' }}>No assets match “{q}”.</p>
          ) : null}
        </Section>
        <Section title="Graph" flush>
          {!graph ? (
            <EmptyState title="Choose a starting asset">
              Search above, or open any asset and use its Topology view. The whole estate is never drawn at once.
            </EmptyState>
          ) : !graph.ok ? (
            <LoadError status={graph.status} problem={graph.problem} />
          ) : (
            <TopologyExplorer key={`${graph.data.focusId}-${graph.data.computedAt}`} orgId={org.id} orgSlug={slug} initial={graph.data} />
          )}
        </Section>
      </PageBody>
    </>
  );
}
