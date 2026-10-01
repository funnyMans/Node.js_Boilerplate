# @app/common

Shared application utilities for the monorepo, including Pino logging,
OpenTelemetry tracing, health checks, metrics, and error contracts.

Create one configured logger per service and pass that same instance to
Fastify and the service bootstrap:

```ts
const logger = createLogger('orders-service', config.LOG_LEVEL);
const server = Fastify({ loggerInstance: logger });

const { shutdown } = createServiceBootstrap(server, {
  serviceName: 'orders-service',
});
```

Use `server.log` for infrastructure clients and background workers so their
logs share the service's configured Pino instance.
