# Architecture: current learning system and design boundaries

This repository is a learning lab for understanding distributed application
design and operation. It is not a production-ready product, and its purpose is
not to claim that microservices are the right default for most applications.
The separate services make boundaries, network calls, data ownership,
asynchronous work, and operational costs concrete enough to study.

This note distinguishes what runs in the local system from optional design
exercises. A technology appearing in a dependency, manifest, or diagram does
not by itself mean that a complete integration exists.

For the running local stack, see [`../infra/README.md`](../infra/README.md).
For request, event, and data flows, see [`diagrams.md`](./diagrams.md) and the
[implementation walkthrough](./IMPLEMENTATION_WALKTHROUGH.md).

## Current local implementation

| Concern                | Current implementation                                                                | Boundary                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository             | `pnpm` workspaces with Turborepo tasks                                                | Local monorepo tooling; no claim of a configured remote build cache.                                                                                                                                                                                        |
| Application runtime    | TypeScript and Fastify HTTP services                                                  | Services are separate processes in the development Compose stack.                                                                                                                                                                                           |
| Persistence            | Prisma with PostgreSQL                                                                | Local Compose uses one PostgreSQL server with separate service databases.                                                                                                                                                                                   |
| Authentication         | Auth service called by the API gateway                                                | The gateway is the public application entry point; internal service ports are also published selectively in development.                                                                                                                                    |
| Messaging              | NATS with an orders transactional outbox publisher                                    | The local publisher's publish/flush is not equivalent to durable broker retention or consumer acknowledgements.                                                                                                                                             |
| Workflow               | Temporal workflow and worker in the orders application                                | Local Temporal is provided by Compose; payment/inventory calls use local HTTP services.                                                                                                                                                                     |
| Payments and inventory | Local HTTP services with their own databases                                          | These are development implementations, not external provider integrations.                                                                                                                                                                                  |
| Object storage and ETL | Moto S3-compatible mock plus Dagster                                                  | Moto is in-memory. Dagster writes curated Parquet but is not configured here with a production data warehouse.                                                                                                                                              |
| Metrics and dashboards | Shared `prom-client` registration, Prometheus, Grafana                                | Prometheus scrapes all six HTTP services; orders additionally exports outbox-delivery gauges and alerts. Grafana provides a local metrics view.                                                                                                             |
| Traces                 | OpenTelemetry bootstrap in all six HTTP services; OTLP/HTTP collector, Tempo, Grafana | W3C context is persisted in the orders outbox and continued through NATS headers, Temporal input/activities, and payment/inventory HTTP calls. Tempo stores local traces for bounded retention and Grafana can query them. CI does not verify trace search. |
| CI                     | GitHub Actions plus local build/test scripts                                          | Automatic CI is paused for pushes and PRs targeting `dev`; required checks remain for `stage` and `main`. CI validates but does not deploy the system.                                                                                                      |

The system's strongest end-to-end example is order creation: the API writes
the order and event atomically, separate workers publish/export/dispatch
background work, and Dagster can transform raw events into daily Parquet.
See the walkthrough for the request's synchronous and asynchronous boundaries.

## Explicitly not current implementation

The following are design options or future learning topics, not guarantees
about the running local stack:

- SNS/SQS, EventBridge, AWS S3, ECR, ECS/EKS, RDS, Step Functions, X-Ray, and
  CDK-based deployment.
- A durable NATS topology with acknowledged consumers.
- A real payment-provider connection, production inventory source,
  notification delivery, or shipping workflow.
- Durable NATS consumers, domain-specific metrics beyond order delivery, and
  complete operational alerting/runbooks.
- Kubernetes behavior in a live cluster, GraphQL/Apollo Federation, RabbitMQ,
  and AI-agent workflows. These are possible future study topics only.

Do not add a tool simply because it is common in production. First state the
learning objective, compare it with a simpler option, identify the new failure
modes and operational burden, and define how the result will be verified.
Microservices, for example, make independent ownership and failure isolation
visible here, while also adding network, deployment, and data-coordination
complexity.

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

1. Start with [`diagrams.md`](./diagrams.md) to map the system and its main
   request/event flows.
2. Follow one order through
   [`IMPLEMENTATION_WALKTHROUGH.md`](./IMPLEMENTATION_WALKTHROUGH.md) and
   [`orders_workflow.md`](./orders_workflow.md), noting where a synchronous
   request ends and independent background work begins.
3. Use [`../infra/README.md`](../infra/README.md) to run the stack and inspect
   its health, logs, metrics, and Grafana/Tempo traces.
4. Read [`SERVICE_CONTRACT.md`](./SERVICE_CONTRACT.md) to understand the
   service-level checks and what their evidence cannot prove.
5. Study focused topics in [`temporal.md`](./temporal.md),
   [`contracts.md`](./contracts.md), and [`etl.md`](./etl.md).
6. Use [`README_NEXT_STEPS.md`](./README_NEXT_STEPS.md) for the current
   learning sequence and verified gaps.
