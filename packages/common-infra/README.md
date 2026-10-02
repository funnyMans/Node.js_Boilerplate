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
