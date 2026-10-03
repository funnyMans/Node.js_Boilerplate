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

| Role                         | Compose service(s)                                                        | Notes                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Database and cache           | `postgres`, `redis`                                                       | Postgres hosts separate application databases; Redis is shared but deliberately ephemeral and not persisted.                                |
| Messaging and orchestration  | `nats`, `temporal`                                                        | Orders publishes outbox events to NATS and dispatches fulfillment work to Temporal.                                                         |
| HTTP applications            | `api-gateway`, `users`, `auth-service`, `orders`, `payments`, `inventory` | The gateway is the intended user-facing entry point; auth is also loopback-published for local development. Internal calls use Compose DNS. |
| Local object storage and ETL | `s3-mock`, `s3-mock-init`, `dagster`                                      | Moto is an in-memory S3-compatible endpoint. The init job seeds buckets and sample events, then exits.                                      |
| Monitoring                   | `prometheus`, `grafana`, `otel-collector`, `tempo`                        | Prometheus scrapes service, collector, and Tempo metrics; the collector forwards traces to Tempo; Grafana provisions metrics/traces.        |
| Edge proxy                   | `nginx`                                                                   | Exposes the local proxy on port 8080 and forwards application requests to the gateway.                                                      |

### Compose lifecycle boundary

Long-running application and persistent infrastructure containers use
`restart: unless-stopped`; stateful services also have a graceful stop window.
This restarts a process after an unexpected exit, but a restart policy does
not make an unhealthy container healthy, rerun a completed initialization
job, or reapply `depends_on` health ordering after Docker Engine restarts. Use
`docker compose up -d` to re-evaluate the configured startup dependencies.

Moto is intentionally excluded from automatic restart: its objects live only
in memory, so a process restart would bring back an empty S3 endpoint. The
separate seed job must complete before dependent app services are brought up.
This is a deliberate local-data limitation, not an automatic recovery path.

### Dagster boundary

Dagster's local instance uses SQLite run, event-log, and schedule storage
under `/opt/dagster/dagster_home`, which is backed by the `dagster-home`
named volume. This is appropriate for the current single-process learning
setup; it is not a shared multi-replica metadata store. The UI binds to
loopback on the host, restarts unless explicitly stopped, and has a 30-second
shutdown grace period. Its health check calls Dagster's `/server_info`
endpoint rather than merely checking whether a TCP port accepts connections.

The current code location defines one partitioned asset job, but no schedules
or sensors. Materialization is manual, so the Dagster daemon's presence does
not imply that ETL runs automatically. Run metadata survives container
recreation in the named volume, while the source and curated objects remain
in the separate in-memory Moto service and are lost when Moto is recreated.
Use a real external metadata store, object-store persistence, and an explicit
scheduling/recovery policy only if this app grows beyond the local learning
use case.

### Traces and telemetry boundary

Services export OTLP/HTTP traces to the collector. Its memory limiter caps
collector process data at 256 MiB (with a 64 MiB spike allowance); receive
requests are capped at 16 MiB. A small in-memory exporter queue retries
temporary Tempo failures for up to five minutes, then reports a failed export
instead of growing without bound. The collector health endpoint checks the
collector process, while Prometheus scrapes the collector and Tempo's internal
metrics for pipeline diagnostics.

Tempo stores traces locally on the `tempo-data` volume and retains blocks for
48 hours. The Tempo image has no shell-based probe utility, so Compose does
not claim a Tempo health check; the collector starts after the Tempo process
and buffers/retries temporary startup failures. Its `/ready` endpoint can be
checked manually, but no Compose dependency waits on it. Service SDK exports
have a five-second timeout. None of these settings make traces durable
business records: exporter/collector queues are in memory, sampling is
currently unsampled (all traces), and logs/correlation IDs remain the fallback
when telemetry is dropped. This is a single-node local tracing setup, not a
highly available observability platform.

### Prometheus and Grafana boundary

Prometheus keeps its TSDB in the `prometheus-data` volume and retains data for
at most 15 days or 2 GB of TSDB blocks, whichever limit is reached first. The
volume preserves local metrics across container recreation; the configured
health check establishes that Prometheus serves its health endpoint, not that
every scrape target is healthy. Grafana's database is persisted separately in
`grafana-data`; its datasource and dashboard are provisioned from the checked-in
files.

Prometheus evaluates the checked-in alert rules, but this stack has no
Alertmanager, so firing alerts are visible in Prometheus and do not send
notifications. Grafana and Prometheus host ports bind to loopback. The default
Grafana credentials (`admin`/`admin`) are convenient local-development values,
not access control; override them in `.env` and do not expose this stack to
other machines as configured.

### Nginx boundary

Nginx is the local HTTP reverse proxy on loopback port 8080. It forwards
requests and the standard client/protocol headers to the API gateway; a
per-client request limiter permits 10 requests per second with a burst of 20
and returns HTTP 429 when exceeded. The container health check calls `/health`
through Nginx, so it checks the proxy-to-gateway path, not merely that the
Nginx worker process is running.

The proxy resolves the gateway through Docker DNS at request time and refreshes
cached addresses every five seconds. This allows the proxy to follow a
recreated gateway without restarting Nginx; a gateway replacement can still
cause brief request failures while DNS updates.

### Postgres boundary

The local database server is pinned to Postgres 15.19 on Debian Bookworm by
image digest. It uses a named data volume, 256 MiB of container shared memory,
and a `pg_isready` health check with startup grace. Host authentication uses
SCRAM-SHA-256 when the database volume is initialized. PostgreSQL's active
defaults retain `fsync`, `full_page_writes`, and `synchronous_commit`; these
provide local crash-durability behavior but are not a backup strategy.

The initialization script creates the comma-separated databases configured
by `POSTGRES_MULTIPLE_DATABASES`, excluding the initial `POSTGRES_DB`. This
only runs when the official Postgres image initializes an empty data
directory; changing the list does not create databases in an existing volume.
Separate databases currently provide logical separation only: every
application and Temporal uses the same local `dev` superuser credentials.
That is convenient for this learning stack, but not service-level access
isolation. The volume persists through container recreation but has no
automated backup/restore process or host-failure protection.

### Temporal boundary

The local Temporal server is pinned by both version and image digest. Its
auto-setup configuration uses explicit `temporal` and `temporal_visibility`
databases on the shared Postgres instance, with a bounded 24-hour default
namespace history-retention period. The Compose health check uses
Temporal's gRPC cluster-health command; orders and the API gateway wait for
that check before starting, rather than merely waiting for the container
process to exist.

Workflow history is stored in Postgres, whose named volume persists across
container recreation. This is still a single local Temporal server and a
single Postgres instance: there is no high availability, backup/restore
procedure, TLS/authentication, or production deployment configuration.
Temporal durability here means persisted workflow state, not that the worker
or downstream payment/inventory services are always available.

Applying a Temporal server-version change to an existing Postgres volume runs
the image's schema setup/migration path. Back up the local Postgres volume
before deliberately recreating the service, and verify pending workflows
afterward. The namespace-retention environment setting is applied when the
default namespace is first created; changing an existing namespace's
retention requires an explicit Temporal namespace update.

### Redis boundary

The local Redis image is pinned to `7.4.11-alpine`, has a 256 MiB dataset
limit, and uses `noeviction` so writes fail visibly rather than silently
discarding keys. RDB snapshots and AOF are disabled, and no Redis volume is
mounted: Redis currently serves only health probes, with no application cache
or BullMQ queue/worker in use. These settings bound local resource use without
suggesting that Redis state survives container replacement. Before Redis
stores jobs or business-relevant cache data, choose persistence, eviction,
recovery, and alerting from that workload's actual guarantees.

The application Redis clients use bounded connection/command timeouts and
continue reconnecting with capped backoff. This allows health checks to report
Redis as unavailable promptly while services can reconnect after recovery.

### S3-compatible storage boundary

The local S3 endpoint is Moto, included in the shared ETL image. Its health
check performs a real `ListBuckets` S3 API call with the configured local
credentials; bucket seeding remains a separate one-shot init job. Orders
exports use a stable object key derived from the outbox event ID, a
10-second request deadline, and bounded standard SDK retries. The ETL boto3
client uses path-style addressing, a 3-second connect timeout, a 10-second
read timeout, and at most three attempts. These bounds make failed I/O
visible to the existing retry logic rather than leaving exporter work waiting
indefinitely.

Moto stores all objects in memory. Recreating its container loses raw and
curated data, and its local placeholder credentials are not an access-control
boundary. The endpoint is loopback-published for host access and is intended
only for development/tests; it does not emulate every AWS S3 behavior. The
Postgres outbox remains the source for retrying raw exports, but curated
Parquet must be regenerated after a Moto restart.

### NATS delivery boundary

The local NATS server enables JetStream with a named Docker volume for its
file-backed stream data. The orders service ensures the `ORDERS` stream exists
with a 30-day age limit, a 1 GiB byte limit, one replica, and `discard: new`.
When capacity is reached, JetStream rejects new messages rather than evicting
retained events; the PostgreSQL outbox then retries and eventually alerts if
the broker remains unavailable. The outbox marks an event published only
after receiving JetStream's publish acknowledgement, using the event ID for
deduplication within a 24-hour window.

This is durable broker acceptance on one local server, not high availability
or a guarantee that a consumer completed business work. There is currently no
application NATS consumer. A real consumer needs a durable explicit-ack
consumer, idempotent side effects, and redelivery/recovery tests. The named
volume survives container recreation but is not a backup or host-failure
strategy.

The configured host ports are:

Every published host port binds to `127.0.0.1`; the local development
services are not exposed to other machines on the host's network. Containers
continue to reach each other over the private Compose network. To make a
service reachable from another machine, deliberately change its host binding
and review its authentication and network exposure first.

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
one successful and one inventory-compensation order. That journey also
verified the outbox trace carrier and NATS child trace header, with matching
trace IDs in orders, payments, and inventory logs. The migration applied,
all health-checked services in that configuration were healthy, and the
one-shot S3 init exited `0`. At that time, Temporal and the OTel collector
were running without Compose health checks; current coverage is listed below
and has not all been applied to the running containers. The 2026-09-30 bounded
delivery drill exercised each outbox stage's terminal
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
- **Healthy** means its configured Docker health check passed. Tempo has no
  Compose health check; see the coverage table for each probe's scope.
- **Exited (0)** is a successful completion. `s3-mock-init` is intentionally a
  one-shot job: it creates buckets and seed data, then exits.
- **Exited with a non-zero code** means the process failed, or was interrupted.
  Check its logs and exit time before deciding which.
- `depends_on` controls startup ordering only to the extent of its configured
  condition. `service_started` does not mean the dependency is ready to accept
  requests.

Current health-check coverage in Compose:

| Services                                   | What the configured check establishes                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `postgres`, `redis`, `nats`                | The respective database, cache, or broker check responds.                                                                   |
| `users`, `orders`, `payments`, `inventory` | The service's `/ready` endpoint succeeds.                                                                                   |
| `api-gateway`                              | Its `/ready` endpoint succeeds, including its checked dependencies.                                                         |
| `auth-service`                             | Its `/health` endpoint returns successfully; this is not the same as a Compose `/ready` check.                              |
| `dagster`                                  | Its `/server_info` endpoint responds with a Dagster webserver version; this does not prove an ETL materialization succeeds. |
| `s3-mock`                                  | A `ListBuckets` S3 API request succeeds; bucket presence and seed contents are established by the init job, not this check. |
| `temporal`                                 | Temporal's gRPC cluster-health command confirms the workflow service is serving.                                            |
| `otel-collector`                           | The collector's own health-check extension responds; Prometheus separately scrapes collector telemetry.                     |
| `prometheus`                               | Prometheus serves `/-/healthy`; target health and alert state remain separate signals.                                      |
| `grafana`                                  | Grafana's `/api/health` endpoint responds; this does not verify datasource queries or dashboards.                           |
| `nginx`                                    | Its `/health` proxy path receives a successful response from the API gateway.                                               |
| `tempo`                                    | No Docker health check is configured; the image has no shell-based probe utility.                                           |
| `s3-mock-init`                             | Compose waits for successful process completion, not a long-running health state.                                           |

The orders service's `/ready` endpoint checks PostgreSQL. Its `/health`
endpoint also reports NATS and Temporal, but neither endpoint exposes the
outbox backlog or S3-export progress. Treat API readiness and background-work
delivery as separate signals.

## Stop and data safety

Stop and remove containers while keeping named volumes:

```bash
docker compose -f infra/docker-compose.dev.yml down --remove-orphans
```

The Postgres, NATS JetStream, Prometheus, Grafana, Dagster, and Tempo named
volumes persist across this command. Moto stores objects only in memory, so
recreating `s3-mock` loses its data; rerun `s3-mock-init` after Moto starts to
recreate buckets and sample data. Redis is also ephemeral and has no data
volume or persistence configured.

`make reset` and `docker compose down -v` remove named volumes and therefore
delete persisted local Postgres, NATS, Prometheus, Grafana, Dagster, and Tempo
state. Use those only when you intentionally want a clean local reset.

## Monitoring boundaries

- Prometheus scrapes `/metrics` from all six HTTP services: `api-gateway`,
  `users`, `auth-service`, `orders`, `payments`, and `inventory`. It also
  scrapes collector and Tempo internal metrics.
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
