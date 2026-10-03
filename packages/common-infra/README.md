# common-infra

Shared Redis, BullMQ, Temporal, NATS, and health helpers for the monorepo.
Client factories that report asynchronous errors accept the service's
structured logger so infrastructure failures share the same Pino pipeline.

Example:

```ts
import { createLogger } from '@app/common';
import { createRedisClient, createNatsClient } from '@nodejs-boilerplate/common-infra';

const logger = createLogger('orders-service');
const redis = createRedisClient(process.env.REDIS_URL, logger);
const nats = await createNatsClient(process.env.NATS_URL, logger);
```

Health helpers accept a dependency client and return `ok`, `degraded`, `down`,
or `unknown`. Cached variants keep entries isolated per client (or Temporal
address) and use the `REDIS_HEALTH_TTL_MS`, `NATS_HEALTH_TTL_MS`, and
`TEMPORAL_HEALTH_TTL_MS` settings. Passing an existing Temporal client performs
an `ensureConnected()` check; it does not treat construction of a client as
proof that the server is reachable. NATS health uses the connection's closed
and draining state; it does not consume the asynchronous status event stream
to infer readiness.

`publishEvent` uses JetStream and resolves only after the server returns a
publish acknowledgement. It uses the event ID as the JetStream message ID so
outbox retries are deduplicated within the configured stream duplicate window.
The acknowledgement confirms broker acceptance into a matching stream; it
does not confirm that an application consumer processed the event.

`subscribeTo` remains a core NATS helper. Core subscriptions do not provide
durable delivery or consumer acknowledgements; use an explicit-ack JetStream
consumer when a concrete application consumer requires those guarantees.

The current application only uses Redis for gateway/users health probes;
there are no cache reads/writes or BullMQ queue/worker callers yet. The shared
Redis client bounds connect and command waits so an unhealthy Redis instance
cannot hold health checks indefinitely, while reconnect attempts continue
with capped backoff. The local Compose Redis instance is intentionally
ephemeral and memory-bounded; it is not configured as durable queue storage.
Do not rely on Redis for persisted business state until a concrete workload
defines its eviction, persistence, and recovery requirements.
