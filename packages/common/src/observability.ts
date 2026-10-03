import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import { isSpanContextValid } from '@opentelemetry/api';
import type { Context, SpanContext } from '@opentelemetry/api';
import type { IncomingMessage } from 'node:http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

export type TraceContextCarrier = Record<string, string>;

const requestTraceContexts = new WeakMap<IncomingMessage, TraceContextCarrier>();
const propagatedHeaders = ['traceparent', 'tracestate'] as const;

export function setRequestTraceContext(
  request: IncomingMessage,
  traceContext: TraceContextCarrier
): void {
  requestTraceContexts.set(request, traceContext);
}

export function getRequestTraceContext(request: IncomingMessage): TraceContextCarrier | undefined {
  return requestTraceContexts.get(request);
}

export function createTraceContext(spanContext?: SpanContext): TraceContextCarrier {
  if (spanContext && isSpanContextValid(spanContext)) {
    const traceContext: TraceContextCarrier = {
      traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags.toString(16).padStart(2, '0')}`,
    };
    const traceState = spanContext.traceState?.serialize();
    if (traceState) traceContext.tracestate = traceState;
    return traceContext;
  }

  const carrier: TraceContextCarrier = {};
  propagation.inject(context.active(), carrier);

  return Object.fromEntries(
    propagatedHeaders.flatMap((header) => (carrier[header] ? [[header, carrier[header]]] : []))
  );
}

export function injectTraceContext(
  carrier: TraceContextCarrier,
  spanContext?: SpanContext
): TraceContextCarrier {
  Object.assign(carrier, createTraceContext(spanContext));
  return carrier;
}

export async function runWithTraceSpan<T>(
  tracerName: string,
  spanName: string,
  parentTraceContext: TraceContextCarrier | undefined,
  task: (activeContext: Context) => Promise<T>
): Promise<T> {
  const parent = propagation.extract(ROOT_CONTEXT, parentTraceContext ?? {});
  const span = trace.getTracer(tracerName).startSpan(spanName, {}, parent);
  const activeContext = trace.setSpan(parent, span);

  try {
    return await context.with(activeContext, () => task(activeContext));
  } catch (error) {
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    span.end();
  }
}

export function initObservability(options?: { serviceName?: string; endpoint?: string }) {
  const serviceName = options?.serviceName ?? process.env.SERVICE_NAME ?? 'nodejs-boilerplate';
  const endpoint =
    options?.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://localhost:4318/v1/traces';

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: endpoint, timeoutMillis: 5000 }),
    instrumentations: [new HttpInstrumentation(), new PinoInstrumentation()],
  });

  sdk.start();

  return {
    sdk,
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
}
