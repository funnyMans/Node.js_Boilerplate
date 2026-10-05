# Node.js Backend Foundation

This repository is evolving toward a production-minded, reusable foundation
for backend systems that connect client applications to business services and
external providers. Its architecture vision uses logistics and truck
brokerage as a concrete reference domain while keeping the engineering
principles broadly reusable. See the
[project ideology](./docs/PROJECT_IDEOLOGY.md) for its goals, priorities,
trade-offs, and unresolved questions.

The current implementation is a local order-processing system built from
separate Node.js services. It brings together PostgreSQL, Redis, NATS,
Temporal, Dagster, Prometheus, Grafana, OpenTelemetry, and Tempo to make
service boundaries, data ownership, messaging, workflows, failure handling,
and operational signals concrete.

The vision is aspirational: this repository is not yet a production-ready
product or a supported deployment template. The local stack uses development
adapters and mocks, and its Kubernetes manifests are study material rather
than a validated deployment path. The architecture guide documents what is
currently implemented and its known boundaries; deployment readiness and
scale claims require separate evidence.

This project is available under the [MIT License](./LICENSE).

## Start here

Read the vision first, then use the implementation guides to distinguish
current behavior from future direction:

1. [`docs/PROJECT_IDEOLOGY.md`](./docs/PROJECT_IDEOLOGY.md): engineering
   priorities, architecture stance, and trade-offs.
2. [`docs/trucking/README.md`](./docs/trucking/README.md): the business
   vision, actors and authority, proposed workflow, and implementation
   questions for the trucking reference.
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): what the local system
   actually implements and where its boundaries are.
4. [`docs/diagrams.md`](./docs/diagrams.md): how the services and data flows
   connect, including the synchronous order request and its asynchronous work.
5. [`docs/IMPLEMENTATION_WALKTHROUGH.md`](./docs/IMPLEMENTATION_WALKTHROUGH.md):
   what happens step by step and where the important boundaries are.
6. [`infra/README.md`](./infra/README.md): how to build, start, inspect, and
   stop the local stack, and what its health signals do and do not prove.
7. [`docs/SERVICE_CONTRACT.md`](./docs/SERVICE_CONTRACT.md): the common service
   endpoints, trace context, readiness, and verification limits.
8. Follow a specific tool or scenario in
   [`docs/orders_workflow.md`](./docs/orders_workflow.md),
   [`docs/temporal.md`](./docs/temporal.md), [`docs/etl.md`](./docs/etl.md),
   and [`docs/README_NEXT_STEPS.md`](./docs/README_NEXT_STEPS.md).

For a useful study exercise, follow one order from the HTTP response through
the outbox, NATS, Temporal, payment/inventory, raw object export, and Dagster.
Then use the logs, trace in Grafana/Tempo, and Prometheus metrics to answer
different questions about the same journey. The guides call out where evidence
is live-verified and where it is only documented or configured.

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

# Check the proxy (Nginx) and gateway readiness, including the users dependency
curl -sS http://127.0.0.1:8080/health | jq .
curl -sS http://127.0.0.1:3000/ready | jq .
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

Kubernetes manifests (study material)
--------------------------------------

The repository contains example Kubernetes manifests, but they are not a
validated deployment path and are not required to run or study the local
Compose system. Use them to learn how Kubernetes resources express desired
state; do not treat them as production-ready configuration.

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
transaction. An outbox worker publishes pending events to file-backed JetStream and marks them
published only after a broker acknowledgement; event IDs deduplicate retries within the stream's
bounded window. A separate database-backed dispatcher starts the Temporal fulfillment workflow
only after NATS publication is recorded, while raw S3 export retries independently. JetStream
acceptance is not consumer processing: there is no application NATS consumer yet. The workflow
calls payment and inventory HTTP services with idempotency keys. Local payment and inventory HTTP
services are included in the Compose stack; production provider integrations are not. Configure `PAYMENT_SERVICE_URL`,
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

Images are built locally by the Makefile targets. GitHub Actions validates
builds, lint, tests, Compose configuration, service contracts, and the order
journey on pull requests targeting `stage` or `main`, and on pushes to those
branches. Automatic CI for pushes and pull requests targeting `dev` is
temporarily paused while project documentation and architecture are being
reorganized; branch
protections still require pull requests and preserve history. The workflow can
also be dispatched manually. CI validates and regression-tests the code; it is
not a deployment pipeline.

What's next
-----------

- Turn the vision and open questions in
  [`docs/PROJECT_IDEOLOGY.md`](./docs/PROJECT_IDEOLOGY.md) into explicit,
  evidence-backed decisions before expanding the reference implementation.
- Keep the implementation guides accurate about what is configured, tested,
  and not yet verified; do not infer production readiness from local examples.
- Add architecture or infrastructure only when it addresses an identified
  domain need or measurable operating goal, and document its trade-offs.
