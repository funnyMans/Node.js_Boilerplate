import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpAuthClient } from '../../src/infrastructure/clients/http-auth.client';
import {
  canAccessUser,
  canBanUser,
  canListUsers,
  hasUserPermission,
} from '../../src/app/policies/user-access.policy';
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
            role: 'user',
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
      role: 'user',
      expiresAt: '2026-09-26T00:00:00.000Z',
    });
    expect(fetch).toHaveBeenCalledWith('http://auth-service:3002/auth/session', {
      headers: { authorization: 'Bearer token' },
    });
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
  it('allows only the authenticated user to access a profile', () => {
    expect(canAccessUser('user-1', 'user-1', 'user')).toBe(true);
    expect(canAccessUser('user-1', 'user-2', 'user')).toBe(false);
    expect(canAccessUser('admin-1', 'user-2', 'admin')).toBe(true);
  });

  it('restricts user listing and counts to admin roles', () => {
    expect(canListUsers('user')).toBe(false);
    expect(canListUsers('admin')).toBe(true);
  });

  it('evaluates the full role-based permission set', () => {
    expect(hasUserPermission('user', 'users:list')).toBe(false);
    expect(hasUserPermission('user', 'users:read:own')).toBe(true);
    expect(hasUserPermission('admin', 'users:list')).toBe(true);
    expect(hasUserPermission('admin', 'users:ban')).toBe(true);
  });

  it('restricts user banning to admin roles', () => {
    expect(canBanUser('user')).toBe(false);
    expect(canBanUser('admin')).toBe(true);
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
