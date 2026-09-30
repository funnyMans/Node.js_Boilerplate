# Architecture: current implementation and intended direction

This note separates what runs in the repository today from options that remain
design directions. A technology appearing in a dependency, manifest, or
diagram does not by itself mean that a complete production integration exists.

For the running local stack, see [`../infra/README.md`](../infra/README.md).
For request, event, and data flows, see [`diagrams.md`](./diagrams.md) and the
[implementation walkthrough](./IMPLEMENTATION_WALKTHROUGH.md).

## Current local implementation

| Concern                | Current implementation                                                             | Boundary                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | `pnpm` workspaces with Turborepo tasks                                             | Local monorepo tooling; no claim of a configured remote build cache.                                                                                                                                                                                                    |
| Application runtime    | TypeScript and Fastify HTTP services                                               | Services are separate processes in the development Compose stack.                                                                                                                                                                                                       |
| Persistence            | Prisma with PostgreSQL                                                             | Local Compose uses one PostgreSQL server with separate service databases.                                                                                                                                                                                               |
| Authentication         | Auth service called by the API gateway                                             | The gateway is the public application entry point; internal service ports are also published selectively in development.                                                                                                                                                |
| Messaging              | NATS with an orders transactional outbox publisher                                 | The local publisher's publish/flush is not equivalent to durable broker retention or consumer acknowledgements.                                                                                                                                                         |
| Workflow               | Temporal workflow and worker in the orders application                             | Local Temporal is provided by Compose; payment/inventory calls use local HTTP services.                                                                                                                                                                                 |
| Payments and inventory | Local HTTP services with their own databases                                       | These are development implementations, not external provider integrations.                                                                                                                                                                                              |
| Object storage and ETL | Moto S3-compatible mock plus Dagster                                               | Moto is in-memory. Dagster writes curated Parquet but is not configured here with a production data warehouse.                                                                                                                                                          |
| Metrics and dashboards | Shared `prom-client` registration, Prometheus, Grafana                             | Prometheus scrapes all six HTTP services; orders additionally exports outbox-delivery gauges and alerts.                                                                                                                                                                |
| Traces                 | OpenTelemetry bootstrap in all six HTTP services; OTLP/HTTP to the local collector | W3C context is persisted in the orders outbox and continued through NATS headers, Temporal input/activities, and payment/inventory HTTP calls. Collector exports to logs; no persistent trace store or trace UI. Live verification of the newest async path is pending. |
| CI/deployment          | Local build and test scripts, plus deployment-related examples/manifests           | Production CI/CD and infrastructure are roadmap work, not a deployed system.                                                                                                                                                                                            |

The system's strongest end-to-end example is order creation: the API writes
the order and event atomically, separate workers publish/export/dispatch
background work, and Dagster can transform raw events into daily Parquet.
See the walkthrough for the request's synchronous and asynchronous boundaries.

## Explicitly not current implementation

The following are design options or future work, not guarantees about the
running development stack:

- SNS/SQS, EventBridge, AWS S3, ECR, ECS/EKS, RDS, Step Functions, X-Ray, and
  CDK-based deployment.
- A durable NATS topology with acknowledged consumers.
- A production payment-provider connection, production inventory source,
  notification delivery, or shipping workflow.
- A persistent trace backend, domain-specific metrics beyond order delivery,
  and complete operational alerting/runbooks.

Choose production technologies from operational requirements and demonstrated
failure/recovery behavior rather than treating these options as already
implemented decisions.

## Design principles in the current code

- Keep service data ownership explicit, even when local services share one
  PostgreSQL server.
- Persist an order and its outbox event in the same transaction.
- Keep NATS publication, raw-object export, and workflow dispatch outside the
  customer-facing order transaction.
- Use deterministic IDs/keys and idempotency contracts when retrying effects.
- Persist only the W3C trace headers needed to continue asynchronous traces;
  keep correlation IDs as the separate business-level join key and exclude
  baggage from durable records.
- Keep readiness distinct from background-delivery health; an HTTP-ready
  service can still have a growing outbox backlog.

## Learning path

1. Start with [`diagrams.md`](./diagrams.md) for the system map.
2. Read [`IMPLEMENTATION_WALKTHROUGH.md`](./IMPLEMENTATION_WALKTHROUGH.md) for
   what each step does and what the API waits for.
3. Use [`../infra/README.md`](../infra/README.md) to understand build, start,
   status, health, and shutdown commands.
4. Read [`SERVICE_CONTRACT.md`](./SERVICE_CONTRACT.md) for the shared service
   contract and its live verification command.
5. Follow focused details in [`orders_workflow.md`](./orders_workflow.md),
   [`contracts.md`](./contracts.md), [`etl.md`](./etl.md), and
   [`temporal.md`](./temporal.md).
6. Track planned operational work in [`README_NEXT_STEPS.md`](./README_NEXT_STEPS.md).
