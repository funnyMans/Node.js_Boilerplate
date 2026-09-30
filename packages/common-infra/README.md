# common-infra

Shared infrastructure helpers for the monorepo: Redis, BullMQ, Temporal.

This package provides lightweight factories and types so services can import
common clients in a consistent way.

Example:

```ts
import { createRedisClient } from '@nodejs-boilerplate/common-infra';

const redis = createRedisClient();
```
