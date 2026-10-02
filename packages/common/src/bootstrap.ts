import { context, ROOT_CONTEXT, propagation, trace } from '@opentelemetry/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Span } from '@opentelemetry/api';
import {
  createTraceContext,
  initObservability,
  registerShutdownHandlers,
  setRequestTraceContext,
} from './index';

type RequestRaw = IncomingMessage & {
  __correlationId?: string;
  __requestStartTs?: number;
  __requestSpan?: Span;
  __requestTraceId?: string;
};

function getRequestRaw(request: FastifyRequest): RequestRaw {
  return request.raw as RequestRaw;
}

export type ServiceOptions = {
  serviceName: string;
  shutdownTasks?: Array<() => Promise<unknown> | unknown>;
  observabilityEndpoint?: string | undefined;
};

export function createServiceBootstrap(app: FastifyInstance, opts: ServiceOptions) {
  const logger = app.log;
  const observability = initObservability({
    serviceName: opts.serviceName,
    endpoint: opts.observabilityEndpoint,
  });
  const tracer = trace.getTracer(opts.serviceName);

  app.addHook('onRequest', async (request, reply) => {
    const raw = getRequestRaw(request);
    const requestId = request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const incomingCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof incomingCorrelationId === 'string' &&
      incomingCorrelationId.length > 0 &&
      incomingCorrelationId.length <= 128
        ? incomingCorrelationId
        : requestId;
    request.id = requestId;
    raw.__correlationId = correlationId;
    reply.header('x-request-id', requestId);
    reply.header('x-correlation-id', correlationId);
    raw.__requestStartTs = Date.now();

    const headers: Record<string, string> = {};
    for (const header of ['traceparent', 'tracestate', 'baggage']) {
      const value = request.headers[header];
      if (typeof value === 'string') headers[header] = value;
    }
    const parentContext = trace.getActiveSpan()
      ? context.active()
      : propagation.extract(ROOT_CONTEXT, headers);
    const span = tracer.startSpan(
      'http.server.request',
      {
        attributes: {
          'http.method': request.method,
          'http.route': request.routeOptions.url ?? request.url,
          'service.name': opts.serviceName,
          'request.id': requestId,
          'correlation.id': correlationId,
        },
      },
      parentContext
    );
    const traceId = span.spanContext().traceId;
    raw.__requestSpan = span;
    raw.__requestTraceId = traceId;
    setRequestTraceContext(raw, createTraceContext(span.spanContext()));
    if (traceId) reply.header('x-trace-id', traceId);
  });

  app.addHook('onResponse', async (request, reply) => {
    const raw = getRequestRaw(request);
    const startedAt = raw.__requestStartTs ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const span = raw.__requestSpan;
    const traceId = raw.__requestTraceId ?? span?.spanContext().traceId ?? 'unknown';

    if (span) {
      span.setAttributes({
        'http.status_code': reply.statusCode,
        'http.response_time_ms': durationMs,
      });
      span.end();
    }

    logger.info(
      {
        requestId: request.id,
        correlationId: raw.__correlationId,
        traceId,
        method: request.method,
        url: request.url,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs,
      },
      'request completed'
    );
  });

  app.addHook('onError', async (request, reply, error) => {
    const raw = getRequestRaw(request);
    const startedAt = raw.__requestStartTs ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const span = raw.__requestSpan;
    const traceId = raw.__requestTraceId ?? span?.spanContext().traceId ?? 'unknown';

    if (span) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error?.message ?? 'request error' });
      span.setAttributes({
        'http.status_code': reply.statusCode ?? 500,
        'error.name': error?.name ?? 'RequestError',
      });
    }

    logger.error(
      {
        requestId: request.id,
        correlationId: raw.__correlationId,
        traceId,
        method: request.method,
        url: request.url,
        route: request.routeOptions.url,
        statusCode: reply.statusCode ?? 500,
        durationMs,
        err: {
          name: error?.name,
          message: error?.message,
          code: error?.code,
          stack: error?.stack,
        },
      },
      'request failed'
    );
  });

  const shutdown = registerShutdownHandlers([
    async () => {
      if (typeof app.close === 'function' && app.server?.listening) {
        await app.close();
      }
    },
    ...(opts.shutdownTasks ?? []),
    async () => {
      await observability.shutdown();
    },
  ]);

  return { logger, observability, shutdown };
}

export function registerProcessShutdownHandlers(
  shutdown: () => Promise<void>,
  log: (level: 'info' | 'warn' | 'error', fields: Record<string, unknown>, message: string) => void,
  timeoutMs = 30_000
): void {
  let shutdownPromise: Promise<void> | undefined;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (shutdownPromise) {
      log('warn', { signal }, 'shutdown already in progress');
      return;
    }

    log('info', { signal }, 'shutdown signal received');
    const timeout = setTimeout(() => {
      log('error', { signal, timeoutMs }, 'shutdown timed out');
      process.exit(1);
    }, timeoutMs);

    shutdownPromise = shutdown()
      .then(() => {
        log('info', { signal }, 'shutdown completed');
        clearTimeout(timeout);
      })
      .catch((error: unknown) => {
        log('error', { err: error, signal }, 'shutdown failed');
        process.exit(1);
      });
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);
}

export default createServiceBootstrap;
