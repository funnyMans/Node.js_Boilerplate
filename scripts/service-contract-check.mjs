import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const services = [
  { name: 'api-gateway', port: 3000, serviceName: 'api-gateway', metricPrefix: 'api_gateway' },
  { name: 'users', port: 3001, serviceName: 'users', metricPrefix: 'users_service' },
  { name: 'auth-service', port: 3002, serviceName: 'auth-service', metricPrefix: 'auth_service' },
  { name: 'orders', port: 3003, serviceName: 'orders-service', metricPrefix: 'orders_service' },
  {
    name: 'payments',
    port: 3010,
    serviceName: 'payments-service',
    metricPrefix: 'payments_service',
  },
  {
    name: 'inventory',
    port: 3011,
    serviceName: 'inventory-service',
    metricPrefix: 'inventory_service',
  },
];

const probe = `
const port = Number(process.argv[1]);
const expectedService = process.argv[2];
const metricPrefix = process.argv[3];
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';
const correlationId = 'contract-check-' + expectedService;
const headers = {
  traceparent: '00-' + traceId + '-' + spanId + '-01',
  'x-correlation-id': correlationId,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path) {
  const response = await fetch('http://127.0.0.1:' + port + path, { headers });
  assert(response.headers.get('x-request-id'), path + ' omitted x-request-id');
  assert(response.headers.get('x-correlation-id') === correlationId, path + ' changed correlation ID');
  assert(response.headers.get('x-trace-id') === traceId, path + ' did not preserve trace ID');
  return response;
}

(async () => {
  const healthResponse = await request('/health');
  assert(healthResponse.status === 200, '/health returned HTTP ' + healthResponse.status);
  const health = await healthResponse.json();
  assert(health.service === expectedService, '/health returned the wrong service name');
  assert(['ok', 'degraded', 'down'].includes(health.status), '/health returned an invalid status');
  assert(health.dependencies && typeof health.dependencies === 'object', '/health omitted dependencies');
  assert(Number.isFinite(Date.parse(health.timestamp)), '/health returned an invalid timestamp');

  const readinessResponse = await request('/ready');
  assert(readinessResponse.status === 200, '/ready returned HTTP ' + readinessResponse.status);
  const readiness = await readinessResponse.json();
  assert(readiness.ready === true, '/ready did not report ready=true');

  const metricsResponse = await request('/metrics');
  assert(metricsResponse.status === 200, '/metrics returned HTTP ' + metricsResponse.status);
  assert(metricsResponse.headers.get('content-type')?.includes('text/plain'), '/metrics has an invalid content type');
  const metrics = await metricsResponse.text();
  assert(metrics.includes(metricPrefix + '_http_requests_total'), '/metrics omitted request totals');
  assert(metrics.includes(metricPrefix + '_http_request_duration_ms_bucket'), '/metrics omitted latency buckets');
  assert(metrics.includes(metricPrefix + '_http_errors_total'), '/metrics omitted error totals');
  process.stdout.write(expectedService + ': health, readiness, trace/correlation headers, and metrics OK\\n');
})().catch((error) => {
  console.error(expectedService + ': ' + error.message);
  process.exitCode = 1;
});
`;

for (const service of services) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'infra/docker-compose.dev.yml',
      'exec',
      '-T',
      service.name,
      'node',
      '-e',
      probe,
      String(service.port),
      service.serviceName,
      service.metricPrefix,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(result.stdout);
}
