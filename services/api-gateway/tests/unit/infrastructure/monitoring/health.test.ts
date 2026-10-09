import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHttpDependencyHealth, getHttpDependencyReadiness } from '@app/common';
import { isGatewayReady } from '../../../../src/infrastructure/monitoring/health';

describe('api gateway dependency health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a healthy downstream service', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ status: 'ok' }));

    await expect(getHttpDependencyHealth('http://users')).resolves.toBe('ok');
  });

  it('reports an unavailable downstream service', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('downstream unavailable'));

    await expect(getHttpDependencyHealth('http://users')).resolves.toBe('down');
  });

  it('marks the gateway ready only when all critical dependencies are healthy', () => {
    const dependencies = {
      users: true,
      auth: true,
    };

    expect(isGatewayReady(dependencies)).toBe(true);
    expect(isGatewayReady({ ...dependencies, auth: false })).toBe(false);
  });

  it('reports downstream readiness as false when the dependency is not ready', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ready: false }), { status: 200 })
    );

    await expect(getHttpDependencyReadiness('http://auth')).resolves.toBe(false);
  });
});
