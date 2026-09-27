'use client';

import Link from 'next/link';
import type { HostHealth, HostMetric } from '@waylorn/contracts';
import { classifyFreshness, formatDuration, formatNumber, formatPercent, humanizeToken, orgPath } from '@waylorn/domain';
import { FreshnessStatus, HealthStatus } from '@/components/ui/Status';
import { DataTable, tableStyles } from '@/components/ui/Table';
import { useNow } from '@/lib/use-now';

function Metric({ m, format }: { m: HostMetric | undefined; format: (v: number) => string }) {
  if (!m || m.value === undefined) return <span className="muted" title="The host does not expose this metric">Not measured</span>;
  return <>{format(m.value)}</>;
}

/** Host health. Absent metrics are "not measured", never zero; each row shows data freshness. */
export function HostTable({ hosts, orgSlug }: { hosts: readonly HostHealth[]; orgSlug: string }) {
  const now = useNow();
  return (
    <DataTable label="Hosts" caption="Values as last reported through OpenTelemetry collectors. Utilisation is shown without colour thresholds; alerting thresholds are defined in backend policy.">
      <thead>
        <tr>
          <th scope="col">Host</th>
          <th scope="col">Platform</th>
          <th scope="col" className={tableStyles.num}>CPU</th>
          <th scope="col" className={tableStyles.num}>Memory</th>
          <th scope="col" className={tableStyles.num}>Disk</th>
          <th scope="col" className={tableStyles.num}>Disk I/O</th>
          <th scope="col" className={tableStyles.num}>Loss / latency</th>
          <th scope="col" className={tableStyles.num}>Temp.</th>
          <th scope="col" className={tableStyles.num}>Uptime</th>
          <th scope="col">Containers</th>
          <th scope="col">Services</th>
          <th scope="col">Certificate</th>
          <th scope="col">Data</th>
        </tr>
      </thead>
      <tbody>
        {hosts.map((h) => {
          const freshness = classifyFreshness({ observedAt: h.cpuUtilization?.observedAt ?? h.uptimeSeconds?.observedAt, expectedIntervalMs: h.expectedIntervalMs, streamConnected: true }, now);
          const certMs = h.certificateExpiry ? Date.parse(h.certificateExpiry.notAfter) - now : undefined;
          return (
            <tr key={h.asset.id}>
              <th scope="row" className={tableStyles.primaryCell}>
                <Link href={orgPath(orgSlug, 'assets', h.asset.id)} className="mono">
                  {h.asset.tag}
                </Link>
                <span className={tableStyles.sub}>
                  {h.asset.name} · {h.asset.context.site.code}
                </span>
              </th>
              <td>
                {humanizeToken(h.platform)}
                <span className={tableStyles.sub}>{humanizeToken(h.provider)}</span>
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.cpuUtilization} format={(v) => formatPercent(v, 0)} />
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.memoryUtilization} format={(v) => formatPercent(v, 0)} />
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.diskUtilization} format={(v) => formatPercent(v, 0)} />
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.diskIoUtilization} format={(v) => formatPercent(v, 0)} />
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.networkPacketLoss} format={(v) => formatPercent(v, 1)} />
                <span className={tableStyles.sub}>
                  <Metric m={h.networkLatencyMs} format={(v) => `${formatNumber(v, 1)} ms`} />
                </span>
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.temperatureC} format={(v) => `${formatNumber(v, 0)} °C`} />
              </td>
              <td className={tableStyles.num}>
                <Metric m={h.uptimeSeconds} format={(v) => formatDuration(v * 1000)} />
              </td>
              <td>{h.containers ? `${h.containers.running} / ${h.containers.total} running` : <span className="muted">—</span>}</td>
              <td>
                {h.services.map((s) => (
                  <div key={s.name} className="nowrap">
                    <HealthStatus state={s.state} /> <span>{s.name}</span>
                  </div>
                ))}
              </td>
              <td>
                {h.certificateExpiry && certMs !== undefined ? (
                  <>
                    expires in {formatDuration(certMs).replace(/^in /, '')}
                    <span className={`${tableStyles.sub} mono`}>{h.certificateExpiry.subject}</span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <FreshnessStatus freshness={freshness} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
