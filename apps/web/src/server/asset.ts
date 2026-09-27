import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { orgContext } from './api';
import { load } from './load';

/** Loads an asset once per request; 404 (including other-tenant IDs) renders not-found. */
export const assetContext = cache(async (slug: string, assetId: string) => {
  const ctx = await orgContext(slug);
  const asset = await load(ctx.api.GET('/orgs/{orgId}/assets/{assetId}', { params: { path: { orgId: ctx.org.id, assetId } } }));
  if (!asset.ok && asset.status === 404) notFound();
  return { ...ctx, asset };
});
