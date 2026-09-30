import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerServiceMetrics } from '../../src/metrics';

describe('registerServiceMetrics', () => {
  const servers: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('records HTTP metrics with route templates instead of request paths', async () => {
    const server = Fastify();
    servers.push(server);
    registerServiceMetrics(server, 'test-service');
    server.get('/users/:userId', async () => ({ ok: true }));

    await server.inject('/users/user-123');
    const response = await server.inject('/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('test_service_http_requests_total');
    expect(response.body).toContain('route="/users/:userId"');
    expect(response.body).not.toContain('user-123');
    expect(response.body).toContain('test_service_http_request_duration_ms_bucket');
    expect(response.body).toContain('test_service_http_errors_total');
  });
});
