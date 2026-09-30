import { describe, expect, it } from 'vitest';
const smoke = process.env.E2E === '1' ? describe : describe.skip;

smoke('api gateway smoke checks', () => {
  it('returns health ok through the gateway and proxies the users count endpoint', async () => {
    const health = await fetch('http://localhost:8080/health');
    expect(health.ok).toBe(true);

    const healthPayload = (await health.json()) as {
      service: string;
      dependencies: { users: string; orders: string };
    };
    expect(healthPayload.service).toBe('api-gateway');
    expect(healthPayload.dependencies.users).toBe('ok');
    expect(['ok', 'degraded']).toContain(healthPayload.dependencies.orders);

    const countResponse = await fetch('http://localhost:8080/users/count');
    expect(countResponse.ok).toBe(true);

    const countPayload = (await countResponse.json()) as { count: number };
    expect(countPayload).toHaveProperty('count');
    expect(typeof countPayload.count).toBe('number');
  });
});
