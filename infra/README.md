# Local Docker Compose operations

This is the operating guide for the development stack defined in
[`docker-compose.dev.yml`](./docker-compose.dev.yml). It describes the current
configuration; it does not claim that containers are running or healthy.

For a guided explanation of how service requests, outbox events, workflows,
ETL, and monitoring fit together, see
[`docs/diagrams.md`](../docs/diagrams.md) and
[`docs/IMPLEMENTATION_WALKTHROUGH.md`](../docs/IMPLEMENTATION_WALKTHROUGH.md).

## Stack at a glance

Compose creates one private network and starts these services:

| Role                         | Compose service(s)                                                        | Notes                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Persistent state             | `postgres`, `redis`                                                       | Postgres hosts separate application databases; Redis is shared by the local services.                             |
| Messaging and orchestration  | `nats`, `temporal`                                                        | Orders publishes outbox events to NATS and dispatches fulfillment work to Temporal.                               |
| HTTP applications            | `api-gateway`, `users`, `auth-service`, `orders`, `payments`, `inventory` | The gateway is the only published application entry point. Internal services use Compose DNS names.               |
| Local object storage and ETL | `s3-mock`, `s3-mock-init`, `dagster`                                      | Moto is an in-memory S3-compatible endpoint. The init job seeds buckets and sample events, then exits.            |
| Monitoring                   | `prometheus`, `grafana`, `otel-collector`, `tempo`                        | Prometheus scrapes service metrics; the collector forwards traces to Tempo; Grafana provisions both data sources. |
| Edge proxy                   | `nginx`                                                                   | Exposes the local proxy on port 8080 and forwards application requests to the gateway.                            |

The configured host ports are:

|              Host port | Service                                                                         |
| ---------------------: | ------------------------------------------------------------------------------- |
|                   8080 | Nginx                                                                           |
|                   3000 | API gateway                                                                     |
|                   3002 | Auth service                                                                    |
|                   3004 | Dagster UI                                                                      |
|                   3005 | Grafana                                                                         |
| 3001, 3003, 3010, 3011 | Users, orders, payments, inventory (container ports; not published to the host) |
| 4222, 5432, 6379, 7233 | NATS, Postgres, Redis, Temporal                                                 |
|             4317, 4318 | OTLP gRPC and HTTP receivers                                                    |
|                   9000 | Moto S3-compatible endpoint                                                     |
|                   9090 | Prometheus                                                                      |

Tempo's query API listens on container port `3200` and is intentionally not
published to the host. Browse traces in Grafana at `http://localhost:3005` under
**Explore → Tempo**. The local Tempo volume retains traces for 48 hours.

## Local environment values

Compose reads optional overrides from the repository-root `.env` file. Start
from the checked-in local-only example:

```bash
cp .env.example .env
```

The values in `.env.example` are intentionally convenient development
placeholders, not production secrets. Keep `.env` uncommitted. The application
rejects the documented service/auth tokens in production mode, but that is a
guardrail rather than a secret manager. If you change `POSTGRES_USER` or
`POSTGRES_PASSWORD` after the named Postgres volume has already been
initialized, the database role is not rotated automatically: change the role
inside PostgreSQL and update every matching DSN. Do not use `down -v` as a
credential-rotation shortcut because it destroys local database state.

## Build without starting

To keep peak memory lower, build application images individually. Run one
command at a time and wait for it to finish before starting the next:

```bash
docker compose -f infra/docker-compose.dev.yml build users
docker compose -f infra/docker-compose.dev.yml build auth-service
docker compose -f infra/docker-compose.dev.yml build orders
docker compose -f infra/docker-compose.dev.yml build payments
docker compose -f infra/docker-compose.dev.yml build inventory
docker compose -f infra/docker-compose.dev.yml build api-gateway
docker compose -f infra/docker-compose.dev.yml build dagster
```

`s3-mock` and `s3-mock-init` use the same ETL image as `dagster`, so building
`dagster` provides that image for all three. Compose will pull the third-party
images when needed; it does not build them from this repository.

The shared service bootstrap is copied into six application images. When
changing it, rebuild each consumer one at a time before using a no-build start:

```bash
docker compose -f infra/docker-compose.dev.yml build orders
docker compose -f infra/docker-compose.dev.yml build api-gateway
docker compose -f infra/docker-compose.dev.yml build users
docker compose -f infra/docker-compose.dev.yml build auth-service
docker compose -f infra/docker-compose.dev.yml build payments
docker compose -f infra/docker-compose.dev.yml build inventory
```

## Start and verify

After building, start the full stack without asking Compose to build images:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --no-build
```

Inspect every container, including completed one-shot jobs:

```bash
docker compose -f infra/docker-compose.dev.yml ps --all
```

Then check the public proxy and gateway readiness, including the users dependency:

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:3000/ready
```

The Makefile offers the same quick checks with `make status` and `make health`.
For a failed or restarting service, inspect only the relevant logs first:

```bash
docker compose -f infra/docker-compose.dev.yml logs --tail=100 SERVICE
```

Replace `SERVICE` with a name from the service table above. For the init job,
use `s3-mock-init`.

### Verify the common service contract

With the full Compose stack already running, run:

```bash
pnpm docker:service-contract
```

This no-build, no-write check probes `/health`, `/ready`, trace/correlation
response headers, and the standard `/metrics` exposition inside each of the
six HTTP service containers. See
[`docs/SERVICE_CONTRACT.md`](../docs/SERVICE_CONTRACT.md) for the endpoint
shapes, dependency/readiness policy, and the checks this command does not
claim to prove.

### Run the order journey check

The check is opt-in and does not start or stop containers. From the repository
root, start the gateway and its Compose dependencies using existing images:

```bash
pnpm docker:e2e-up
```

Then run:

```bash
pnpm docker:e2e-seed
pnpm docker:order-journey
```

Seed Moto after each restart because its object storage is in memory. The seed
command is safe to repeat; it recreates the buckets and deterministic sample
events used by the integration checks.

`pnpm docker:e2e-up` starts the gateway and its declared dependencies. To start
the **entire** local application, including Nginx, Dagster, Prometheus,
Grafana, and the OTel collector, use:

```bash
docker compose -f infra/docker-compose.dev.yml -f infra/docker-compose.e2e.yml up -d --no-build --wait
```

If GNU Make is installed, `make order-journey` is an equivalent convenience
target.

The E2E-only Compose override sets `NODE_ENV=development` and turns on
`PAYMENTS_FAKE_STRIPE`. It replaces Stripe calls with deterministic local test
responses for setup, charge, and refund operations; it never contacts Stripe.
The normal Compose configuration keeps this mode disabled, and the payment
service rejects fake mode when `NODE_ENV=production`. The override does not
replace the payments or inventory HTTP services, their databases, the Temporal
workflow, NATS, or Moto.

The payments container applies Prisma migrations and upserts its catalog seed
before starting the HTTP service. The Prisma seed command uses the package-local
`tsx` executable so startup does not depend on a package-manager install step.

The journey registers a uniquely named local test account, rejects an
unauthenticated order request, creates authenticated orders, and checks that
each correlation ID appears on both the NATS event and persisted outbox
record. It checks each raw JSONL object in Moto and follows each Temporal
workflow to its terminal state. Test accounts and order rows remain in the
local databases; the test does not reset volumes or delete user data.

The successful test order must be charged and confirmed. A second order
requests more coffee than the seeded inventory has in stock; the test checks
that payment is refunded, no reservation is created, and the order is
cancelled only after the refund. The fake provider is isolated to the E2E
Compose override and is not a substitute for validating a real Stripe test
account. Set `E2E_ORDER_JOURNEY=1` explicitly—the suite is skipped by default
during ordinary unit tests. To run the default non-fake local stack after E2E,
restart it with `pnpm docker:down` followed by `pnpm docker:up`; neither
command removes named volumes.

The live check passed on 2026-09-29 after rebuilding all six HTTP service
images one at a time and recreating the full E2E Compose project. It exercised
one successful and one inventory-compensation order. The current journey also
verified the outbox trace carrier and NATS child trace header, with matching
trace IDs in orders, payments, and inventory logs. The migration applied,
all configured health-checked application, ETL, and monitoring services were
healthy, and the one-shot S3 init exited `0`. Temporal and the OTel collector
were running; neither has a Compose health check. The 2026-09-30 bounded delivery drill exercised each outbox stage's terminal
transition at its configured attempt limit, verified its alert reached
`firing`, then applied the documented one-stage requeue and observed recovery
and alert clearing. The attempt counts were injected as database state; this
did not run ten real dependency failures or measure retry backoff. A separate
retention drill deleted exactly one deliberately aged completed test event
with `OUTBOX_RETENTION_DAYS=3650`, then restored the setting to `0`.

The same date's SIGTERM drill exposed and fixed an orders worker startup race.
When SIGTERM arrived during Temporal workflow-bundle compilation, the worker
could be shut down before `Worker.run()`, leaving its connection held until
Docker's grace period expired. The regression test and rebuilt container now
verify clean shutdown (exit `0`, `OOMKilled=false`). All six HTTP services
exited cleanly, the stack was restarted, and the contract probe and order
journey passed again. These bounded drills do not simulate actual dependency
outages, drain an active Temporal task, or stress the 500-row retention batch.

### Reading Compose status correctly

- **Running** means the container's main process is running. It does not prove
  the service can answer useful requests.
- **Healthy** means its configured Docker health check passed. Not every
  service in this Compose file has a health check.
- **Exited (0)** is a successful completion. `s3-mock-init` is intentionally a
  one-shot job: it creates buckets and seed data, then exits.
- **Exited with a non-zero code** means the process failed, or was interrupted.
  Check its logs and exit time before deciding which.
- `depends_on` controls startup ordering only to the extent of its configured
  condition. `service_started` does not mean the dependency is ready to accept
  requests.

Current health-check coverage in Compose:

| Services                                                                | What the configured check establishes                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `postgres`, `redis`, `nats`                                             | The respective database, cache, or broker check responds.                                                                            |
| `users`, `orders`, `payments`, `inventory`                              | The service's `/ready` endpoint succeeds.                                                                                            |
| `api-gateway`                                                           | Its `/ready` endpoint succeeds, including its checked dependencies.                                                                  |
| `auth-service`                                                          | Its `/health` endpoint returns successfully; this is not the same as a Compose `/ready` check.                                       |
| `dagster`                                                               | Its container accepts a TCP connection on port 3000. This is a port check, not a full ETL materialization test.                      |
| `s3-mock`                                                               | A TCP listener check confirms the local Moto endpoint accepts connections; this does not validate S3 credentials or bucket contents. |
| `temporal`, `nginx`, `prometheus`, `grafana`, `otel-collector`, `tempo` | No Docker health check is configured in this Compose file.                                                                           |
| `s3-mock-init`                                                          | Compose waits for successful process completion, not a long-running health state.                                                    |

The orders service's `/ready` endpoint checks PostgreSQL. Its `/health`
endpoint also reports NATS and Temporal, but neither endpoint exposes the
outbox backlog or S3-export progress. Treat API readiness and background-work
delivery as separate signals.

## Stop and data safety

Stop and remove containers while keeping named volumes:

```bash
docker compose -f infra/docker-compose.dev.yml down --remove-orphans
```

The Postgres and Dagster named volumes persist across this command. Moto stores
objects in its container filesystem, so recreating `s3-mock` loses its data;
the init job seeds it again when the stack starts.

`make reset` and `docker compose down -v` remove named volumes and therefore
delete persisted local database and Dagster state. Use those only when you
intentionally want a clean local reset.

## Monitoring boundaries

- Prometheus scrapes `/metrics` from all six HTTP services: `api-gateway`,
  `users`, `auth-service`, `orders`, `payments`, and `inventory`.
- The orders metrics endpoint reports event backlog, oldest backlog age, and
  attempted events for NATS publication, Temporal dispatch, and raw export.
  Separate gauges and alert rules cover terminal NATS, workflow-start, and
  raw-export failures. Other rules cover all six scrape targets, outbox stages
  older than five minutes, and a 5xx-rate expression.
- Grafana is provisioned with Prometheus as its data source and the local
  dashboard directory.
- The OpenTelemetry collector accepts OTLP traces and exports them to Tempo.
  Tempo stores local traces for 48 hours; Grafana provisions Tempo as a data
  source so traces can be searched in **Explore → Tempo**.
- All six HTTP services using the shared tracing bootstrap are configured to
  export OTLP/HTTP traces to the collector. The local Compose file sets
  `NODE_ENV=development` explicitly because the service images default to
  production mode; this allows local placeholder values while preserving the
  production token guardrails.
- For authenticated `POST /orders`, the gateway propagates incoming W3C trace
  context to auth and orders, and the response includes the downstream orders
  trace ID. The orders outbox stores only `traceparent` and `tracestate`
  alongside the event. NATS publication injects those headers; raw export,
  Temporal dispatch, and activities create child spans; Temporal carries its
  context in workflow input; payment/inventory calls propagate activity
  context. The business correlation ID remains the separate durable join key.
  Baggage is excluded, and there is no application NATS consumer in this
  repository. The order journey checks outbox and NATS trace IDs after the
  affected images have been rebuilt.
- NATS, raw export, and Temporal workflow-start delivery stop after 10 outbox
  attempts with exponential backoff capped at 60 seconds. A started workflow's
  Temporal activity retries are governed separately by Temporal. Terminal
  failures require operator review and deliberate requeue; see
  [`docs/orders_workflow.md`](../docs/orders_workflow.md).
- `OUTBOX_RETENTION_DAYS=0` disables outbox cleanup. A positive value enables
  an hourly sweep of at most 500 eligible rows per pass, requiring NATS
  publication, Temporal start, and raw export to have completed. It deletes
  the database outbox row only; it does not remove raw S3 objects or Temporal
  history.
- The six HTTP app containers have a 40-second Compose stop grace period; the
  shared shutdown handler is bounded at 30 seconds. A live stop drill exposed
  and fixed an orders Temporal worker startup race; after rebuilding, all six
  exited `0` with `OOMKilled=false`. The users TypeScript build emits
  `services/users/dist/src/server.js`; old builds had also left a stale
  `services/users/dist/server.js`, and the container launched that stale file
  without the shared SIGTERM handler. The users build now clears `dist` before
  compiling, and Compose, the Dockerfile, and `pnpm start` all launch the
  current entrypoint. After rebuilding, users logged SIGTERM, Redis and
  database cleanup, and shutdown completion, then exited `0` with
  `OOMKilled=false`. Its container was restarted and healthy afterward.

Monitoring configuration lives in
[`prometheus/`](./prometheus/),
[`grafana/`](./grafana/), and [`otel-config.yaml`](./otel-config.yaml).
