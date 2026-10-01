import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logger';

describe('createLogger', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('preserves the configured Pino log level in Fastify', () => {
    const logger = createLogger('test-service', 'silent');
    const server = Fastify({ loggerInstance: logger });
    servers.push(server);

    expect(server.log.level).toBe(logger.level);
  });
});
