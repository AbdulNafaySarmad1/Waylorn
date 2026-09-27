/**
 * Browser OpenTelemetry (opt-in via NEXT_PUBLIC_WAYLORN_BROWSER_TRACING=true).
 * - Spans are exported same-origin to the BFF, which forwards to the collector; CSP stays
 *   `connect-src 'self'` and the collector is never exposed to browsers.
 * - Trace context propagates only to same-origin requests (the default).
 * - URLs are reduced to their path: query strings can contain search terms or identifiers.
 */
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

function pathOnly(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return 'invalid-url';
  }
}

if (process.env['NEXT_PUBLIC_WAYLORN_BROWSER_TRACING'] === 'true') {
  try {
    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'waylorn-web-browser' }),
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: '/api/otel/v1/traces' }))],
    });
    provider.register({ contextManager: new ZoneContextManager() });
    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          ignoreUrls: [/\/api\/otel\//, /\/api\/bff\/session$/],
          applyCustomAttributesOnSpan: (span, request) => {
            if (request instanceof Request) span.setAttribute('url.full', pathOnly(request.url));
            span.setAttribute('http.url', '[path-only]');
          },
        }),
      ],
    });
  } catch {
    // Telemetry must never break the operator console.
  }
}
