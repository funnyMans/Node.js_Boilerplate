# HTTP service contract

This document defines the baseline every HTTP service in the local Compose
application must provide. Shared implementation belongs in `@app/common`;
service-specific dependencies and readiness policy remain with each service.
The goal is for a new service to add its routes and dependency checks without
inventing a separate health, trace, log, or metrics convention.

## HTTP endpoints

| Endpoint       | Success contract                                                 | Failure contract                                                                       | Access                                |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| `GET /health`  | HTTP 200 with `{ service, status, dependencies, timestamp }`     | Still HTTP 200; `status` and dependency values report `degraded`, `down`, or `unknown` | Public to the private Compose network |
| `GET /ready`   | HTTP 200 with `{ ready: true }`                                  | HTTP 503 with `{ ready: false, details }`                                              | Public to the private Compose network |
| `GET /metrics` | Prometheus text exposition with process and HTTP request metrics | Non-2xx indicates a scrape/contract failure                                            | Public to the private Compose network |

`/health` describes the process and its dependency state. It is not the
container readiness probe: Compose uses `/ready` for the HTTP services.
Readiness is intentionally service-specific. A dependency used for an
asynchronous effect can be degraded without rejecting a request that has
already been durably accepted.

The shared metrics helper in `packages/common/src/metrics.ts` registers the
same request counter, latency histogram, and error counter for every service.
Metric names use the normalized service name, for example
`orders_service_http_requests_total`. Labels are limited to method, route
template, and status code; unmatched paths use the fixed `unmatched` label so
arbitrary URLs cannot create unbounded time-series cardinality.

## Request identity and tracing

Every HTTP response carries:

| Header             | Meaning                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `x-request-id`     | Identifier generated for this service's HTTP request                                                                                    |
| `x-correlation-id` | Business/request correlation identifier; a valid incoming value of at most 128 characters is retained, otherwise the request ID is used |
| `x-trace-id`       | Trace ID for the HTTP server span                                                                                                       |

Incoming W3C `traceparent` is extracted as the parent context. Synchronous
gateway calls propagate W3C context and the correlation ID; services export
spans to the configured OTLP/HTTP collector. The shared bootstrap logs request
completion and failure with request, correlation, and trace IDs.

The orders service preserves only `traceparent` and `tracestate` with the
transactional outbox row; it deliberately does not persist or forward baggage.
Each asynchronous stage starts its own child span from that durable context:
NATS publication injects W3C headers, raw-object export records an export span,
Temporal workflow start carries context in workflow input, and workflow
activities create spans and inject context into payment/inventory HTTP calls.
The receiver services can therefore continue the same trace. Correlation IDs
remain the business-level join key and are logged independently of traces.

This asynchronous path is distinct from a durable message-consumer contract:
the repository currently has no application NATS consumer. The order-journey
test subscribes only to verify the event and its W3C headers. The local OTel
collector exports traces to Tempo, which Grafana can query; trace search and
retention are not verified by the hosted order-journey job. See
[`diagrams.md`](./diagrams.md) for the context boundaries and
[`README_NEXT_STEPS.md`](./README_NEXT_STEPS.md) for the live verification
status.

## Dependency and readiness ownership

| Service     | Dependencies reported by `/health`                   | Dependencies that gate `/ready` | Reason for any narrower readiness                                                                                    |
| ----------- | ---------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| API gateway | users, orders, auth, payments, Redis, NATS, Temporal | All listed dependencies         | Gateway routes require its direct service and infrastructure dependencies                                            |
| Users       | PostgreSQL, Redis                                    | PostgreSQL, Redis               | Both are needed for the service's current request paths                                                              |
| Auth        | PostgreSQL, users                                    | PostgreSQL, users               | Account registration and credential operations require these dependencies                                            |
| Orders      | PostgreSQL, NATS, Temporal                           | PostgreSQL                      | The API can durably accept orders while asynchronous delivery is degraded; `/health` exposes that delivery condition |
| Payments    | PostgreSQL                                           | PostgreSQL                      | Stripe/local adapter availability is checked during configuration and per payment operation                          |
| Inventory   | PostgreSQL                                           | PostgreSQL                      | Reservation requests are handled against the local database                                                          |

The gateway checks the `/ready` endpoint of each direct HTTP dependency, not
just its liveness report. Gateway health also reports those dependencies'
health state. The orders service deliberately reports NATS and Temporal
degradation without making the synchronous order-acceptance endpoint
unavailable; outbox metrics and alerts cover delivery lag and terminal
publication failure.

## Configuration, secrets, and dependencies

- Each service validates its configuration at startup and fails visibly for
  invalid required values. Keep defaults appropriate only for local
  development; never copy Compose credentials into a deployed environment.
- Copy [`.env.example`](../.env.example) to `.env` to override local Compose
  values. The example credentials and tokens are development placeholders,
  not a secret-management design; the application rejects its known local
  service/auth tokens when `NODE_ENV=production`. Local Compose explicitly
  sets `NODE_ENV=development` because images otherwise default to production.
- Changing `POSTGRES_USER` or `POSTGRES_PASSWORD` does not rotate credentials
  inside an already initialized named Postgres volume. Rotate the database
  role in PostgreSQL and update the matching application DSNs deliberately.
- `OUTBOX_RETENTION_DAYS` defaults to `0` (disabled). A positive value enables
  bounded cleanup only after NATS publication, Temporal start, and raw export
  have all completed. It deletes outbox rows, not raw S3 objects or Temporal
  history.
- Six HTTP services use `restart: unless-stopped` and a 40-second Compose stop
  grace period; shared application shutdown is bounded at 30 seconds. This
  does not itself prove that every worker/client shuts down cleanly.
- Fake Stripe is opt-in through the E2E Compose override and rejected in
  production mode. Normal development uses the configured Stripe adapter.
- A service owns its persistence schema and migrations. Shared PostgreSQL is a
  local deployment convenience, not shared table ownership.
- Add only the dependencies the service needs. List them in Compose
  `depends_on`, in its health/readiness report where appropriate, and in its
  configuration schema.

## Build and test ownership

| Owner               | Responsibility                                                                                    | Verification                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/common`   | Request spans/headers/logging, metric registration, common health report                          | `pnpm --filter @app/common run build`; focused Vitest tests              |
| Each HTTP service   | Routes, dependency ownership, config validation, migrations, service tests                        | `pnpm --filter <service-package> run build`; service tests where defined |
| Compose             | Runtime dependency graph, health checks, environment and service DNS                              | `docker compose -f infra/docker-compose.dev.yml config --quiet`          |
| Prometheus/Grafana  | Scrape all six HTTP services, alert on scrape failure, display service and order-delivery signals | live target query plus provisioned dashboard check                       |
| Repository operator | Verify the integrated contract without rebuilding or changing data                                | `pnpm docker:service-contract`                                           |

Build shared-bootstrap consumers sequentially to keep peak memory bounded.
After building, start the stack with `--no-build`; do not combine a contract
check with implicit image builds or a volume reset.

## Live contract check

With the Compose application already running, run from the repository root:

```bash
pnpm docker:service-contract
```

The script executes a small Node probe inside each running HTTP service
container. It checks the health and readiness response shapes, response
identity headers with a known trace context/correlation ID, and the standard
request, latency, and error metrics. It does not create business records,
restart containers, or rebuild images.

For an individual failure, inspect that service's logs and the Prometheus
target before retrying:

```bash
docker compose -f infra/docker-compose.dev.yml logs --tail=100 SERVICE
```

The script proves the HTTP-facing contract. The opt-in
[`order journey`](../services/orders/tests/e2e/order-journey.e2e.test.ts) also
checks trace-context persistence and W3C propagation to NATS when run against
rebuilt images. Neither check proves Tempo trace search/retention, a real NATS
consumer's context extraction, sustained-fault alert firing, full recovery
behavior, or production secret management.
