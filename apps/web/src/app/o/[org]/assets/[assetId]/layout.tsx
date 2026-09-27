import { Suspense, type ReactNode } from 'react';
import { orgPath } from '@waylorn/domain';
import { AssetHeader } from '@/components/asset/AssetHeader';
import { CommandLauncher } from '@/components/commands/CommandLauncher';
import { PageBody } from '@/components/ui/Layout';
import { LoadError } from '@/components/ui/LoadError';
import { assetContext } from '@/server/asset';

export default async function AssetLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { asset } = await assetContext(slug, assetId);
  if (!asset.ok) {
    return (
      <PageBody>
        <LoadError status={asset.status} problem={asset.problem} />
      </PageBody>
    );
  }
  const base = orgPath(slug, 'assets', assetId);
  return (
    <>
      <AssetHeader asset={asset.data} base={base} actions={
          <Suspense fallback={null}>
            <CommandLauncher asset={asset.data} />
          </Suspense>
        } />
      {children}
    </>
  );
}
