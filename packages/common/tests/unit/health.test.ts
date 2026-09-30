import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHealthReport,
  checkDependencyHealth,
  getHttpDependencyHealth,
  getHttpDependencyReadiness,
  registerShutdownHandlers,
} from '../../src/health';

describe('common health helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps dependency checks to ok or down without leaking health-check errors', async () => {
    await expect(checkDependencyHealth(async () => 'ready')).resolves.toBe('ok');
    await expect(
      checkDependencyHealth(async () => {
        throw new Error('dependency unavailable');
      })
    ).resolves.toBe('down');
  });

  it('normalizes HTTP dependency health and readiness responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ status: 'degraded' }))
      .mockResolvedValueOnce(Response.json({ ready: true }));

    await expect(getHttpDependencyHealth('http://users')).resolves.toBe('degraded');
    await expect(getHttpDependencyReadiness('http://users')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://users/health');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://users/ready');
  });

  it('returns down or not-ready for unavailable HTTP dependencies', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(getHttpDependencyHealth('http://users')).resolves.toBe('down');
    await expect(getHttpDependencyReadiness('http://users')).resolves.toBe(false);
  });

  it('builds a degraded report when a dependency is unavailable or unknown', () => {
    const report = buildHealthReport('users', { database: 'ok', redis: 'unknown', cache: 'error' });
    expect(report.service).toBe('users');
    expect(report.dependencies.database).toBe('ok');
    expect(report.status).toBe('degraded');
  });

  it('builds a down report when any dependency is explicitly down', () => {
    const report = buildHealthReport('gateway', { users: 'ok', nats: 'down', temporal: 'ok' });
    expect(report.status).toBe('down');
  });

  it('runs shutdown handlers once and in order', async () => {
    const calls: string[] = [];
    const cleanup = registerShutdownHandlers([
      async () => {
        calls.push('done');
      },
    ]);

    await Promise.all([cleanup(), cleanup()]);
    expect(calls).toEqual(['done']);
  });

  it('continues running shutdown handlers after a failure', async () => {
    const calls: string[] = [];
    const cleanup = registerShutdownHandlers([
      async () => {
        calls.push('failed');
        throw new Error('cleanup failed');
      },
      async () => {
        calls.push('completed');
      },
    ]);

    await expect(cleanup()).rejects.toThrow('One or more shutdown tasks failed');
    expect(calls).toEqual(['failed', 'completed']);
  });
});
