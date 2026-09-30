import { context, ROOT_CONTEXT, propagation, trace } from '@opentelemetry/api';
import {
  createLogger,
  createTraceContext,
  initObservability,
  registerShutdownHandlers,
  setRequestTraceContext,
} from './index';

export type ServiceOptions = {
  serviceName: string;
  loggerLevel?: string;
  shutdownTasks?: Array<() => Promise<unknown> | unknown>;
  observabilityEndpoint?: string | undefined;
};

export function createServiceBootstrap(app: any, opts: ServiceOptions) {
  const logger = createLogger(opts.serviceName, opts.loggerLevel);
  const observability = initObservability({
    serviceName: opts.serviceName,
    endpoint: opts.observabilityEndpoint,
  });
  const tracer = trace.getTracer(opts.serviceName);
  if (typeof app.setLogger === 'function') {
    app.setLogger(logger);
  } else if (app && typeof app === 'object') {
    (app as any).log = logger;
  }

  app.addHook('onRequest', async (request: any, reply: any) => {
    const requestId = request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const incomingCorrelationId = request.headers['x-correlation-id'];
    const correlationId =
      typeof incomingCorrelationId === 'string' &&
      incomingCorrelationId.length > 0 &&
      incomingCorrelationId.length <= 128
        ? incomingCorrelationId
        : requestId;
    request.id = requestId;
    request.raw.__correlationId = correlationId;
    reply.header('x-request-id', requestId);
    reply.header('x-correlation-id', correlationId);
    request.raw.__requestStartTs = Date.now();

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
          'http.route': request.routerPath ?? request.routeOptions?.url ?? request.url,
          'service.name': opts.serviceName,
          'request.id': requestId,
          'correlation.id': correlationId,
        },
      },
      parentContext
    );
    const traceId = span.spanContext().traceId;
    request.raw.__requestSpan = span;
    request.raw.__requestTraceId = traceId;
    setRequestTraceContext(request.raw, createTraceContext(span.spanContext()));
    if (traceId) reply.header('x-trace-id', traceId);
  });

  app.addHook('onResponse', async (request: any, reply: any) => {
    const startedAt = request.raw.__requestStartTs ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const span = request.raw.__requestSpan as any;
    const traceId = request.raw.__requestTraceId ?? span?.spanContext?.().traceId ?? 'unknown';

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
        correlationId: request.raw.__correlationId,
        traceId,
        method: request.method,
        url: request.url,
        route: request.routerPath ?? request.routeOptions?.url ?? undefined,
        statusCode: reply.statusCode,
        durationMs,
      },
      'request completed'
    );
  });

  app.addHook('onError', async (request: any, reply: any, error: any) => {
    const startedAt = request.raw.__requestStartTs ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const span = request.raw.__requestSpan as any;
    const traceId = request.raw.__requestTraceId ?? span?.spanContext?.().traceId ?? 'unknown';

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
        correlationId: request.raw.__correlationId,
        traceId,
        method: request.method,
        url: request.url,
        route: request.routerPath ?? request.routeOptions?.url ?? undefined,
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
