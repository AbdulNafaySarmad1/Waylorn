import type { Metadata } from 'next';
import type { Capability, ObservedValue } from '@waylorn/contracts';
import { formatTimestamp, humanizeToken } from '@waylorn/domain';
import { extensionFacts } from '@/components/asset/extension';
import { Columns, KeyValue, PageBody, ProvenanceNote, Section } from '@/components/ui/Layout';
import { Glyph } from '@/components/ui/Glyph';
import { SafetyClassBadge } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { assetContext } from '@/server/asset';

export const metadata: Metadata = { title: 'Asset overview' };

function Observed({ value }: { value: ObservedValue | undefined }) {
  if (!value) return <span className="muted">Not reported</span>;
  return (
    <>
      {value.value}
      <ProvenanceNote>
        {value.provenance.source}
        {value.provenance.observedAt ? `, observed ${formatTimestamp(value.provenance.observedAt, 'UTC')}` : ''}
      </ProvenanceNote>
    </>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <span className="nowrap">
      <Glyph shape="check" /> Yes<span className="visually-hidden"> — {label}</span>
    </span>
  ) : (
    <span className="muted nowrap">No<span className="visually-hidden"> — {label}</span></span>
  );
}

function capabilitySummary(caps: readonly Capability[]): string {
  const authorized = caps.filter((c) => c.currentlyAuthorized).length;
  const observed = caps.filter((c) => c.observed).length;
  return `${observed} of ${caps.length} observed · ${authorized} currently authorized`;
}

export default async function AssetOverview({ params }: { params: Promise<{ org: string; assetId: string }> }) {
  const { org: slug, assetId } = await params;
  const { asset } = await assetContext(slug, assetId);
  if (!asset.ok) return null;
  const a = asset.data;
  const vendorGroups = new Map<string, typeof a.vendorAttributes>();
  for (const v of a.vendorAttributes) vendorGroups.set(v.namespace, [...(vendorGroups.get(v.namespace) ?? []), v]);

  return (
    <PageBody>
      <Columns>
        <Section title="Identity">
          <KeyValue
            items={[
              ['Manufacturer', a.manufacturer ?? <span className="muted">Unknown</span>],
              ['Model', a.model ?? <span className="muted">Unknown</span>],
              ['Serial number', <Observed key="s" value={a.serialNumber} />],
              ['Firmware', <Observed key="f" value={a.firmware} />],
              a.hardwareRevision ? ['Hardware revision', <Observed key="h" value={a.hardwareRevision} />] : null,
              ['Installed', a.installedYear ? `${a.installedYear} (${new Date().getUTCFullYear() - a.installedYear} years)` : <span className="muted">Unknown</span>],
              ...extensionFacts(a.extension).map(([k, v]) => [k, v] as const),
            ]}
          />
        </Section>
        <Section title="Ownership">
          <KeyValue
            items={[
              ['Business owner', a.businessOwner ? `${a.businessOwner.team}${a.businessOwner.contact ? ` · ${a.businessOwner.contact}` : ''}` : '—'],
              ['Maintenance owner', a.maintenanceOwner ? `${a.maintenanceOwner.team}${a.maintenanceOwner.contact ? ` · ${a.maintenanceOwner.contact}` : ''}` : '—'],
              ['Collection path', a.connectivity.path ?? <span className="muted">Not described</span>],
            ]}
          />
        </Section>
      </Columns>

      <Section title="Capabilities" meta={capabilitySummary(a.capabilities)} flush>
        <DataTable
          label="Capabilities"
          caption="Discovery never grants authority. An operation is possible only when it is observed or declared, approved for this site, and currently authorized for you — and the control plane re-checks on every request."
        >
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Class</th>
              <th scope="col">Observed</th>
              <th scope="col">Declared</th>
              <th scope="col">Site-approved</th>
              <th scope="col">Currently authorized</th>
            </tr>
          </thead>
          <tbody>
            {a.capabilities.map((c) => (
              <tr key={c.operation}>
                <th scope="row">{c.label}</th>
                <td>
                  <SafetyClassBadge value={c.safetyClass} />
                </td>
                <td>
                  <Flag on={c.observed} label="observed" />
                </td>
                <td>
                  <Flag on={c.declared} label="declared" />
                </td>
                <td>
                  <Flag on={c.siteApproved} label="site-approved" />
                </td>
                <td>
                  <Flag on={c.currentlyAuthorized} label="currently authorized" />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>

      <Columns>
        <Section title="Protocols" flush>
          {a.protocols.length === 0 ? (
            <p style={{ padding: 16 }} className="muted">
              No protocols reported.
            </p>
          ) : (
            <DataTable label="Protocols">
              <thead>
                <tr>
                  <th scope="col">Protocol</th>
                  <th scope="col">Role</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {a.protocols.map((p) => (
                  <tr key={`${p.protocol}-${p.interfaceId ?? ''}`}>
                    <th scope="row">
                      {p.protocol}
                      {p.version ? <span className={tableStyles.sub}>version {p.version}</span> : null}
                    </th>
                    <td>{humanizeToken(p.role)}</td>
                    <td>{p.source === 'observed' ? 'Observed on the wire' : 'Declared (not observed)'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
        <Section title="Interfaces" flush>
          {a.interfaces.length === 0 ? (
            <p style={{ padding: 16 }} className="muted">
              No interfaces reported.
            </p>
          ) : (
            <DataTable label="Interfaces" caption="Raw network addresses stay in the site store; only tokenised references are shown.">
              <thead>
                <tr>
                  <th scope="col">Interface</th>
                  <th scope="col">Medium</th>
                  <th scope="col">Zone</th>
                  <th scope="col">Path to site agent</th>
                </tr>
              </thead>
              <tbody>
                {a.interfaces.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">
                      {i.label}
                      {i.addressRef ? <span className={`${tableStyles.sub} mono`}>{i.addressRef}</span> : null}
                    </th>
                    <td>{humanizeToken(i.medium).replace('rs', 'RS-')}</td>
                    <td>{i.networkZone ?? '—'}</td>
                    <td>{i.gatewayPath?.join(' → ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      </Columns>

      {a.vendorAttributes.length > 0 ? (
        <Section title="Vendor-specific details" meta="Preserved verbatim from the vendor model" flush>
          {[...vendorGroups].map(([ns, attrs]) => (
            <DataTable key={ns} label={`Vendor details ${ns}`} caption={`Namespace ${ns}`}>
              <tbody>
                {attrs.map((v) => (
                  <tr key={v.key}>
                    <th scope="row" style={{ width: '40%' }}>
                      {v.label}
                    </th>
                    <td>
                      {v.value}
                      {v.unit ? ` ${v.unit}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ))}
        </Section>
      ) : null}
    </PageBody>
  );
}
