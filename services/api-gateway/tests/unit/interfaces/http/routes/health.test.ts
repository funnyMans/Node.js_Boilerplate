import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NatsHealthClient } from '@nodejs-boilerplate/common-infra';
import { registerHealthRoutes } from '../../../../../src/interfaces/http/routes/health';

describe('api gateway health routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    vi.restoreAllMocks();
  });

  function createServer(getNatsClient: () => Promise<NatsHealthClient | undefined>) {
    const server = Fastify();
    servers.push(server);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ status: 'ok', ready: true })
    );
    registerHealthRoutes(server, {
      redis: { ping: async () => 'PONG' },
      getNatsClient,
      temporalAddress: 'temporal:7233',
      usersServiceUrl: 'http://users',
      ordersServiceUrl: 'http://orders',
      authServiceUrl: 'http://auth',
      paymentsServiceUrl: 'http://payments',
      getRedisHealth: async () => 'ok',
      getNatsHealth: async (client) => (client ? 'ok' : 'unknown'),
      getTemporalHealth: async () => 'ok',
    });
    return server;
  }

  it('checks for NATS again on later readiness probes after an initial connection failure', async () => {
    const connection: NatsHealthClient = { isClosed: () => false };
    const getNatsClient = vi
      .fn<() => Promise<NatsHealthClient | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(connection);
    const server = createServer(getNatsClient);

    const unavailable = await server.inject('/ready');
    const recovered = await server.inject('/ready');

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().details.nats).toBe('unknown');
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({ ready: true });
    expect(getNatsClient).toHaveBeenCalledTimes(2);
  });
});
