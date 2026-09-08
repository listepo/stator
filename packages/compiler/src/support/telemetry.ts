/** Opt-in OpenTelemetry tracing for the compiler pipeline (owner directive, plan-notes 187).
 *
 * Off by default: `STATOR_OTEL` unset means this module's dynamic imports never run and the
 * pipeline's startup floor — a benchmarked product metric (plan.md §9 Task 6.3) — stays untouched.
 * On: standard OTel env config (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
 * `OTEL_SERVICE_NAME`) applies, which is precisely what Maple and every other OTLP-compatible
 * backend consume; nothing here is vendor-specific.
 *
 * A telemetry misconfiguration must never break a compile: init failures degrade to a warning
 * and no tracing, because the compiler's output correctness never depends on its observability.
 */

import { SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';

let provider: { shutdown(): Promise<void> } | null = null;

function tracer(): Tracer {
  return trace.getTracer('stator');
}

/** Registers the global provider when enabled; a no-op otherwise. Dynamic imports keep cold
 * startup and every test spawn free of the SDK's cost. */
export async function telemetryInit(): Promise<void> {
  if (process.env['STATOR_OTEL'] === undefined) {
    return;
  }
  try {
    const [{ OTLPTraceExporter }, { resourceFromAttributes }, sdkTraceNode] = await Promise.all([
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/sdk-trace-node'),
    ]);
    const p = new sdkTraceNode.NodeTracerProvider({
      resource: resourceFromAttributes({
        'service.name': process.env['OTEL_SERVICE_NAME'] ?? 'stator',
      }),
      spanProcessors: [new sdkTraceNode.SimpleSpanProcessor(new OTLPTraceExporter())],
    });
    p.register();
    provider = p;
  } catch (error) {
    process.stderr.write(`stator: telemetry disabled (${String(error)})\n`);
  }
}

/** Flushes and unregisters. Called on every exit path of the CLI; a no-op when disabled. */
export async function telemetryShutdown(): Promise<void> {
  await provider?.shutdown();
}

/** Sync span wrapper: the pipeline is synchronous, and an async envelope would cost every caller
 * its `await` chain for observability's sake alone. A throw is recorded on the span, rethrown,
 * and the span status goes ERROR — a failed stage is a span fact, not a swallowed exception. */
/** `withSpan` for an async body. Needed because the sync form ends the span the moment `fn`
 * RETURNS, which for an async function is the moment it hands back a pending promise — the span
 * would time argument parsing and record none of the command's own exceptions. */
export async function withSpanAsync<T>(
  name: string,
  attributes: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const span = tracer().startSpan(name, { attributes });
  try {
    const result = await fn();
    span.end();
    return result;
  } catch (error) {
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    throw error;
  }
}

export function withSpan<T>(name: string, attributes: Record<string, string>, fn: () => T): T {
  const span = tracer().startSpan(name, { attributes });
  try {
    const result = fn();
    span.end();
    return result;
  } catch (error) {
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    throw error;
  }
}
