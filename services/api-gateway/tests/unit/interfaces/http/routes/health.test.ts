import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHealthRoutes } from '../../../../../src/interfaces/http/routes/health';

describe('api gateway health routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    vi.unstubAllGlobals();
  });

  function createServer() {
    const server = Fastify();
    servers.push(server);
    registerHealthRoutes(server, {
      usersServiceUrl: 'http://users',
      authServiceUrl: 'http://auth',
    });
    return server;
  }

  it('reports ready when the account and authentication services are ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ ready: true })))
    );
    const server = createServer();

    const response = await server.inject('/ready');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ready: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports which dependency blocks readiness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) =>
        Promise.resolve(Response.json({ ready: String(url).startsWith('http://users') }))
      )
    );
    const server = createServer();

    const response = await server.inject('/ready');

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ready: false,
      details: { users: true, auth: false },
    });
  });
});
