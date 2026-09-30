import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import type { FastifyInstance } from 'fastify';

export function createServiceMetrics(serviceName: string, registry = new Registry()) {
  const normalized = serviceName.replace(/-/g, '_');

  collectDefaultMetrics({
    register: registry,
    prefix: `${normalized}_`,
  });

  const httpRequestsTotal = new Counter({
    name: `${normalized}_http_requests_total`,
    help: 'Total number of HTTP requests handled by the service',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const httpRequestDurationMs = new Histogram({
    name: `${normalized}_http_request_duration_ms`,
    help: 'HTTP request latency in milliseconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
    registers: [registry],
  });

  const httpErrorsTotal = new Counter({
    name: `${normalized}_http_errors_total`,
    help: 'Total number of HTTP errors produced by the service',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  return {
    registry,
    httpRequestsTotal,
    httpRequestDurationMs,
    httpErrorsTotal,
  };
}

export function registerServiceMetrics(
  server: FastifyInstance,
  serviceName: string,
  registry = new Registry()
) {
  const metrics = createServiceMetrics(serviceName, registry);
  const requestStarts = new WeakMap<object, number>();

  server.addHook('onRequest', async (request) => {
    requestStarts.set(request.raw, Date.now());
  });

  server.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - (requestStarts.get(request.raw) ?? Date.now());
    const route = request.routeOptions.url ?? 'unmatched';
    const statusCode = String(reply.statusCode);
    const labels = { method: request.method, route, status_code: statusCode };

    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDurationMs.observe(labels, durationMs);

    if (reply.statusCode >= 400) {
      metrics.httpErrorsTotal.inc(labels);
    }
  });

  server.get('/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return registry.metrics();
  });

  return metrics;
}
