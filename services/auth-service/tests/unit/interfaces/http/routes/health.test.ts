import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHealthRoutes } from '../../../../../src/interfaces/http/routes/health';

describe('auth service health routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  function createServer(database: 'ok' | 'down', users: 'ok' | 'degraded' | 'down' | 'unknown') {
    const server = Fastify();
    servers.push(server);
    registerHealthRoutes(server, {
      database: vi.fn().mockResolvedValue(database),
      users: vi.fn().mockResolvedValue(users),
    });
    return server;
  }

  it('reports service health with database and users dependency states', async () => {
    const server = createServer('ok', 'degraded');

    const response = await server.inject('/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'auth-service',
      status: 'degraded',
      dependencies: { database: 'ok', users: 'degraded' },
    });
  });

  it('requires both database and users service for readiness', async () => {
    const server = createServer('ok', 'ok');

    const response = await server.inject('/ready');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ready: true });
  });

  it('returns dependency details when the service is not ready', async () => {
    const server = createServer('down', 'ok');

    const response = await server.inject('/ready');

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ready: false,
      details: { database: 'down', users: 'ok' },
    });
  });
});
