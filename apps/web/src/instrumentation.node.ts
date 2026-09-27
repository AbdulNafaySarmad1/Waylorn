import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Exporter endpoint, headers and sampling come from standard OTEL_* environment variables so
// operators can point traces at their own collector (ADR 0001: customer observability stacks).
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'waylorn-web',
    [ATTR_SERVICE_VERSION]: process.env['WAYLORN_VERSION'] ?? '0.1.0',
  }),
  traceExporter: new OTLPTraceExporter(),
});
sdk.start();
