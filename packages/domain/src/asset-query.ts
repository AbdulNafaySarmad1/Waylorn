import {
  assetKindValues,
  healthStateValues,
  lifecycleStateValues,
  pathsOrgsOrgIdAssetsGetParametersQuerySortValues,
  type AssetKind,
  type HealthState,
  type LifecycleState,
} from '@waylorn/contracts';

type Sort = (typeof pathsOrgsOrgIdAssetsGetParametersQuerySortValues)[number];

/** Asset list filter state. The URL is the source of truth so views are linkable. */
export interface AssetQuery {
  readonly q?: string;
  readonly siteId?: string;
  readonly kind?: AssetKind;
  readonly health?: HealthState;
  readonly lifecycle?: LifecycleState;
  readonly sort?: Sort;
  readonly cursor?: string;
}

type ParamSource = Readonly<Record<string, string | readonly string[] | undefined>>;

function first(source: ParamSource, key: string): string | undefined {
  const v = source[key];
  const s = typeof v === 'string' ? v : v?.[0];
  return s === undefined || s.length === 0 ? undefined : s;
}

function oneOf<T extends string>(values: readonly T[], v: string | undefined): T | undefined {
  return values.find((x) => x === v);
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function parseAssetQuery(source: ParamSource): AssetQuery {
  const q = first(source, 'q')?.slice(0, 200);
  const siteId = first(source, 'site');
  const cursor = first(source, 'cursor');
  const query: {
    -readonly [K in keyof AssetQuery]: AssetQuery[K];
  } = {};
  if (q !== undefined) query.q = q;
  if (siteId !== undefined && ID_PATTERN.test(siteId)) query.siteId = siteId;
  const kind = oneOf(assetKindValues, first(source, 'kind'));
  if (kind) query.kind = kind;
  const health = oneOf(healthStateValues, first(source, 'health'));
  if (health) query.health = health;
  const lifecycle = oneOf(lifecycleStateValues, first(source, 'lifecycle'));
  if (lifecycle) query.lifecycle = lifecycle;
  const sort = oneOf(pathsOrgsOrgIdAssetsGetParametersQuerySortValues, first(source, 'sort'));
  if (sort) query.sort = sort;
  if (cursor !== undefined && cursor.length <= 512) query.cursor = cursor;
  return query;
}

export function serializeAssetQuery(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.siteId) params.set('site', query.siteId);
  if (query.kind) params.set('kind', query.kind);
  if (query.health) params.set('health', query.health);
  if (query.lifecycle) params.set('lifecycle', query.lifecycle);
  if (query.sort) params.set('sort', query.sort);
  if (query.cursor) params.set('cursor', query.cursor);
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}

export const ASSET_KIND_LABEL: Readonly<Record<AssetKind, string>> = {
  IndustrialAsset: 'Industrial',
  ComputeAsset: 'Compute',
  NetworkAsset: 'Network',
  CloudResource: 'Cloud',
  StorageAsset: 'Storage',
  ApplicationAsset: 'Application',
  SecurityAsset: 'Security',
};

export const LIFECYCLE_LABEL: Readonly<Record<LifecycleState, string>> = {
  unknown: 'Unverified',
  planned: 'Planned',
  commissioning: 'Commissioning',
  in_service: 'In service',
  maintenance: 'Maintenance',
  standby: 'Standby',
  decommissioned: 'Decommissioned',
};
