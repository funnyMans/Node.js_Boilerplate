import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpAuthClient } from '../../src/infrastructure/clients/http-auth.client';
import { userAccessPolicy } from '../../src/app/policies/user-access.policy';
import { authenticateRequest } from '../../src/interfaces/http/guards/auth.guard';
import { registerAuthRoutes } from '../../src/interfaces/http/routes/auth';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gateway auth client', () => {
  it('returns the authenticated session from auth-service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            valid: true,
            userId: 'user-1',
            roleGrants: [{ role: 'in_house_driver' }],
            expiresAt: '2026-09-26T00:00:00.000Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const session = await new HttpAuthClient('http://auth-service:3002').validateSession('token');

    expect(session).toEqual({
      valid: true,
      userId: 'user-1',
      roleGrants: [{ role: 'in_house_driver' }],
      expiresAt: '2026-09-26T00:00:00.000Z',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://auth-service:3002/auth/session',
      expect.objectContaining({
        headers: { authorization: expect.stringMatching(/^Bearer /) },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('returns null for an invalid session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(
      new HttpAuthClient('http://auth-service:3002').validateSession('expired')
    ).resolves.toBeNull();
  });

  it('forwards correlation and W3C trace headers during session validation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const requestContext = {
      'x-correlation-id': 'corr-1',
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    };

    await new HttpAuthClient('http://auth-service:3002').validateSession('expired', requestContext);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://auth-service:3002/auth/session',
      expect.objectContaining({
        headers: expect.objectContaining(requestContext),
      })
    );
  });

  it.each([
    {
      valid: true,
      userId: 'user-1',
      roleGrants: [{ role: 'owner' }],
      expiresAt: '2026-09-26T00:00:00.000Z',
    },
    {
      valid: true,
      userId: ' ',
      roleGrants: [{ role: 'in_house_driver' }],
      expiresAt: '2026-09-26T00:00:00.000Z',
    },
    { valid: true, userId: 'user-1', roleGrants: [], expiresAt: '2026-09-26T00:00:00.000Z' },
    {
      valid: true,
      userId: 'user-1',
      roleGrants: [{ role: 'area_supervisor', area: 'north' }],
      expiresAt: '2026-09-26T00:00:00.000Z',
    },
    {
      valid: true,
      userId: 'user-1',
      roleGrants: [{ role: 'in_house_driver' }],
      expiresAt: 'not-a-date',
    },
    {
      valid: false,
      userId: 'user-1',
      roleGrants: [{ role: 'in_house_driver' }],
      expiresAt: '2026-09-26T00:00:00.000Z',
    },
  ])('rejects malformed successful session responses: %o', async (payload) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      new HttpAuthClient('http://auth-service:3002').validateSession('token')
    ).rejects.toMatchObject({ name: 'AuthServiceUnavailableError' });
  });

  it('sends a bounded abort signal with session validation requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await new HttpAuthClient('http://auth-service:3002', 10).validateSession('token');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(options.signal?.aborted).toBe(true);
  });
});

describe('gateway authentication guard', () => {
  it('rejects requests without a bearer token', async () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as FastifyReply;
    const authClient = { validateSession: vi.fn() };

    const session = await authenticateRequest({ headers: {} } as FastifyRequest, reply, authClient);

    expect(session).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(authClient.validateSession).not.toHaveBeenCalled();
  });
});

describe('gateway user ownership policy', () => {
  const driverGrants = [{ role: 'in_house_driver' as const }];
  const executiveGrants = [{ role: 'transportation_executive' as const }];

  it('allows only the authenticated user to access a profile', () => {
    expect(userAccessPolicy.canAccessUser('user-1', 'user-1', driverGrants)).toBe(true);
    expect(userAccessPolicy.canAccessUser('user-1', 'user-2', driverGrants)).toBe(false);
    expect(userAccessPolicy.canAccessUser('executive-1', 'user-2', executiveGrants)).toBe(true);
  });

  it('restricts the workforce directory to company-wide supervisor roles', () => {
    expect(userAccessPolicy.canListUsers(driverGrants)).toBe(false);
    expect(userAccessPolicy.canListUsers(executiveGrants)).toBe(true);
    expect(userAccessPolicy.canListUsers([{ role: 'area_supervisor', area: 'la' }])).toBe(false);
  });

  it('allows profile status changes only through trusted account provisioning', () => {
    expect(userAccessPolicy.hasPermission(driverGrants, 'workforce:update:own')).toBe(true);
    expect(userAccessPolicy.hasPermission(executiveGrants, 'workforce:update:any')).toBe(true);
  });
});

describe('gateway auth routes', () => {
  it('forwards auth responses and statuses', async () => {
    const server = Fastify();
    registerAuthRoutes(server, 'http://auth-service:3002');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'person@example.com', password: 'correct-horse' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accessToken: 'token' });
    await server.close();
  });

  it('does not expose public account registration', async () => {
    const server = Fastify();
    registerAuthRoutes(server, 'http://auth-service:3002');

    const response = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'person@example.com', password: 'correct-horse' },
    });

    expect(response.statusCode).toBe(404);
    await server.close();
  });

  it('forwards correlation and trace context to auth-service', async () => {
    const server = Fastify();
    registerAuthRoutes(server, 'http://auth-service:3002');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    server.addHook('onRequest', async (request) => {
      Object.assign(request.raw, {
        __requestSpan: {
          spanContext: () => ({
            traceId: '0123456789abcdef0123456789abcdef',
            spanId: '0123456789abcdef',
            traceFlags: 1,
          }),
        },
      });
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-correlation-id': 'corr-auth' },
      payload: { email: 'person@example.com', password: 'correct-horse' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://auth-service:3002/auth/login',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-auth',
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        },
      })
    );
    await server.close();
  });
});
