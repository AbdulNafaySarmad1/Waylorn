/**
 * Server-side OpenTelemetry. Enabled only when an OTLP endpoint is configured, so air-gapped
 * sites without a collector run without exporters. Next.js emits its own request spans.
 */
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs' && process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
    await import('./instrumentation.node');
  }
}
