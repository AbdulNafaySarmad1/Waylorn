import type { AssetExtension } from '@waylorn/contracts';
import { formatBytes, humanizeToken } from '@waylorn/domain';

/** Kind-specific facts rendered in the common layout. */
export function extensionFacts(ext: AssetExtension | undefined): [string, string][] {
  if (!ext) return [];
  switch (ext.kind) {
    case 'IndustrialAsset':
      return [
        ['Control role', humanizeToken(ext.controlRole)],
        ['Vendor support', humanizeToken(ext.vendorSupport)],
        ...(ext.programmingEnvironment ? ([['Programming environment', ext.programmingEnvironment]] as [string, string][]) : []),
        ...(ext.protocolsSummary ? ([['Communication', ext.protocolsSummary]] as [string, string][]) : []),
      ];
    case 'ComputeAsset':
      return [
        ['Platform', humanizeToken(ext.platform)],
        ['Provider', humanizeToken(ext.provider)],
        ...(ext.operatingSystem ? ([['Operating system', ext.operatingSystem]] as [string, string][]) : []),
        ...(ext.cpuCores !== undefined ? ([['CPU cores', String(ext.cpuCores)]] as [string, string][]) : []),
        ...(ext.memoryBytes !== undefined ? ([['Memory', formatBytes(ext.memoryBytes)]] as [string, string][]) : []),
      ];
    case 'NetworkAsset':
      return [
        ['Network role', humanizeToken(ext.role)],
        ...(ext.portCount !== undefined ? ([['Ports', String(ext.portCount)]] as [string, string][]) : []),
        ...(ext.managed !== undefined ? ([['Managed', ext.managed ? 'Yes' : 'No']] as [string, string][]) : []),
      ];
    case 'CloudResource':
      return [
        ['Provider', humanizeToken(ext.provider)],
        ['Account', ext.account],
        ...(ext.region ? ([['Region', ext.region]] as [string, string][]) : []),
        ['Resource type', ext.resourceType],
      ];
    case 'StorageAsset':
      return [
        ['Storage type', humanizeToken(ext.storageType)],
        ...(ext.capacityBytes !== undefined ? ([['Capacity', formatBytes(ext.capacityBytes)]] as [string, string][]) : []),
        ...(ext.usedBytes !== undefined ? ([['Used', formatBytes(ext.usedBytes)]] as [string, string][]) : []),
        ...(ext.worm !== undefined ? ([['Write-once (WORM)', ext.worm ? 'Enabled' : 'Disabled']] as [string, string][]) : []),
      ];
    case 'ApplicationAsset':
      return [['Runtime', humanizeToken(ext.runtime)], ...(ext.version ? ([['Version', ext.version]] as [string, string][]) : [])];
    case 'SecurityAsset':
      return [['Security function', humanizeToken(ext.function)]];
  }
}
