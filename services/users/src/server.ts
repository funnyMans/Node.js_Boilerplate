import { config } from './infrastructure/config';
import { createServer } from './bootstrap';
import { registerProcessShutdownHandlers } from '@app/common';

const { server, shutdown } = createServer();

const start = async () => {
  try {
    const listening = server.listen({ port: config.PORT, host: config.HOST });
    registerProcessShutdownHandlers(
      async () => {
        await listening.catch(() => undefined);
        await shutdown();
      },
      (level, fields, message) => {
        server.log[level](fields, message);
      }
    );
    await listening;
  } catch (error) {
    server.log.error({ err: error }, 'server failed to start');
    try {
      await shutdown();
    } catch (shutdownError) {
      server.log.error({ err: shutdownError }, 'cleanup after startup failure failed');
      process.exit(1);
    }
    process.exitCode = 1;
  }
};

if (require.main === module) {
  start();
}

export default server;
