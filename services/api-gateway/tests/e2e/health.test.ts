import { describe, expect, it } from 'vitest';
const smoke = process.env.E2E === '1' ? describe : describe.skip;

smoke('api gateway smoke checks', () => {
  it('returns the retained foundation health and protects workforce data', async () => {
    const health = await fetch('http://localhost:8080/health');
    expect(health.ok).toBe(true);

    const healthPayload = (await health.json()) as {
      service: string;
      dependencies: { users: string; auth: string };
    };
    expect(healthPayload.service).toBe('api-gateway');
    expect(healthPayload.dependencies.users).toBe('ok');
    expect(healthPayload.dependencies.auth).toBe('ok');

    const workforceResponse = await fetch('http://localhost:8080/users/count');
    expect(workforceResponse.status).toBe(401);
  });
});
