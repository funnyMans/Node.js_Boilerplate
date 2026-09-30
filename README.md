# Node.js Infra Boilerplate

This repository is a learning-focused monorepo for building production-ready Node.js microservices. It includes docs and scaffolding for Fastify services, tRPC, Apollo Federation, Prisma, Dagster (ETL), and Temporal (workflows) — focused on developer learning.

This project is available under the [MIT License](./LICENSE).

Study the system through [`docs/diagrams.md`](./docs/diagrams.md) (current flows and service relationships), [`docs/IMPLEMENTATION_WALKTHROUGH.md`](./docs/IMPLEMENTATION_WALKTHROUGH.md) (implementation details and boundaries), [`infra/README.md`](./infra/README.md) (how to build, run, and verify the local stack), and [`docs/README_NEXT_STEPS.md`](./docs/README_NEXT_STEPS.md) (phased quality roadmap). [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) records broader design choices and future directions.

Quick start (dev with Docker Compose)
-------------------------------------

Build local application images one at a time, then start the development stack
without triggering another build. See the
[operations guide](./infra/README.md) for the complete sequence and service
details:

```bash
# Example: build a single image at a time and wait for each command to finish
docker compose -f infra/docker-compose.dev.yml build users
docker compose -f infra/docker-compose.dev.yml build auth-service
docker compose -f infra/docker-compose.dev.yml build orders
docker compose -f infra/docker-compose.dev.yml build payments
docker compose -f infra/docker-compose.dev.yml build inventory
docker compose -f infra/docker-compose.dev.yml build api-gateway
docker compose -f infra/docker-compose.dev.yml build dagster

# Use the images already built
docker compose -f infra/docker-compose.dev.yml up -d --no-build

# Check the proxy (Nginx) and users service
curl -sS http://127.0.0.1:8080/health | jq .
curl -sS http://127.0.0.1:3001/health | jq .
```

Bring it down:

```bash
make dev-down
```

An init container such as `s3-mock-init` is expected to exit after successful
work; `Exited (0)` is success, not a failed long-running service. Use
`docker compose -f infra/docker-compose.dev.yml ps --all` to see completed
containers as well as running ones. For the difference between process state,
health checks, and readiness, see the operations guide.

Kubernetes (apply manifests)
----------------------------

Apply the prepared k8s manifests to your cluster (requires kubectl configured):

```bash
# applies namespace + all manifests in k8s/
make k8s-apply

# tear down
make k8s-down
```

Configuration
-------------

You can tune health-cache TTLs using environment variables before running services:

- `TEMPORAL_HEALTH_TTL_MS` (default 5000)
- `REDIS_HEALTH_TTL_MS` (default 2000)
- `NATS_HEALTH_TTL_MS` (default 2000)

Example:

```bash
export TEMPORAL_HEALTH_TTL_MS=10000
export REDIS_HEALTH_TTL_MS=5000
export NATS_HEALTH_TTL_MS=5000
```

ETL with Dagster
----------------

Start the local orders service, Dagster UI, and S3-compatible sample dataset with:

```bash
docker compose -f infra/docker-compose.dev.yml build orders
docker compose -f infra/docker-compose.dev.yml build dagster
docker compose -f infra/docker-compose.dev.yml up -d --no-build orders s3-mock s3-mock-init dagster
```

Open `http://localhost:3004` and materialize `curated_orders` for partition
`2026-09-27`. Order-created outbox events are exported to the local S3 mock's `raw` bucket and
combined with the seeded examples into partitioned Parquet in the `curated` bucket. See
[docs/etl.md](./docs/etl.md) for the data contract and test command.

Orders API
----------

Authenticated clients can create orders and read only their own orders through the API gateway:

- `POST /orders` with `{ "items": [{ "productId": "sku-1", "quantity": 2 }] }`
- `GET /orders?limit=50`
- `GET /orders/{id}`

The orders service persists each order and its `orders.order.created` event in one database
transaction. An outbox worker publishes pending events to NATS and retries failures. A database-backed
dispatcher starts the Temporal fulfillment workflow, which calls payment and inventory HTTP
services with idempotency keys. Local payment and inventory HTTP services are included in the
Compose stack; production provider integrations are not. Configure `PAYMENT_SERVICE_URL`,
`INVENTORY_SERVICE_URL`, `TEMPORAL_ADDRESS`, and `TEMPORAL_TASK_QUEUE` when using alternate
endpoints. Workflows retry transient failures while dependencies are unavailable. Prices are not
accepted from the client.

Service runtime
---------------

All services stop accepting requests before closing dependent resources when
they receive `SIGTERM` or `SIGINT`. Shutdown is bounded to 30 seconds; a timeout
or cleanup failure is logged and results in a non-zero process exit. Startup
failures also trigger resource cleanup.

Docker images and CI
--------------------

Images are built locally by the Makefile targets. Automated CI and image
publishing are intentionally deferred until local checks and service contracts
are repeatable. Deployment and registry configuration follow that work rather
than being part of the initial repository setup.

What's next
-----------

- Keep unit, integration, and end-to-end tests in their dedicated `tests/`
  subfolders. `pnpm test` runs dependency-independent unit tests;
  `pnpm test:integration` runs users API tests requiring local PostgreSQL and
  Redis, while `pnpm test:all` runs the complete configured suite.
- After local verification is stable, initialize the remote repository and add
  staged CI checks for Compose validation, tests, builds, service contracts,
  and the order journey.
- Choose deployment, CI/CD delivery, and production secret management later.
