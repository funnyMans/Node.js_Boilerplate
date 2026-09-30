import { registerProcessShutdownHandlers } from '@app/common';
import { createServer } from './bootstrap';
import { config } from './infrastructure/config';

const { server, shutdown } = createServer();

async function start() {
  try {
    const listening = server.listen({ host: config.HOST, port: config.PORT });
    registerProcessShutdownHandlers(
      async () => {
        await listening.catch(() => undefined);
        await shutdown();
      },
      (level, fields, message) => server.log[level](fields, message)
    );
    await listening;
  } catch (error) {
    server.log.error({ err: error }, 'server failed to start');
    await shutdown().catch((shutdownError) =>
      server.log.error({ err: shutdownError }, 'cleanup failed')
    );
    process.exitCode = 1;
  }
}

if (require.main === module) start();

export default server;
