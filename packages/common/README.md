# @app/common

Shared application utilities for the monorepo, including Pino logging,
OpenTelemetry tracing, health checks, metrics, and error contracts.

Create one configured logger per service and pass that same instance to
Fastify and the service bootstrap:

```ts
const logger = createLogger('api-gateway', config.LOG_LEVEL);
const server = Fastify({ loggerInstance: logger });

const { shutdown } = createServiceBootstrap(server, {
  serviceName: 'api-gateway',
});
```

Use `server.log` for infrastructure clients and background workers so their
logs share the service's configured Pino instance.

Build service configuration with `createConfig` and a Zod schema. The helper
validates the schema against the provided environment source in one pass,
applies schema defaults, and reports all invalid configured keys together
without including their raw values in the error.
