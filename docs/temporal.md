# Temporal workflows

Temporal durably coordinates the order fulfillment process after an order has
been committed. It is asynchronous work: `POST /orders` does not wait for
payment, inventory, or workflow completion.

## Local components

- The `temporal` Compose service runs the Temporal auto-setup image and is
  configured to use the local PostgreSQL server. Its version and image digest
  are pinned, and the setup explicitly names its `temporal` and
  `temporal_visibility` databases. The default namespace retains workflow
  history for 24 hours.
- The orders service contains both the workflow worker and the database-backed
  dispatcher that starts workflows after the corresponding NATS outbox event
  is published.
- Workflow and activity definitions live in
  [`services/orders/src/workflows/order-fulfillment.workflow.ts`](../services/orders/src/workflows/order-fulfillment.workflow.ts)
  and
  [`services/orders/src/infrastructure/temporal/order-fulfillment.activities.ts`](../services/orders/src/infrastructure/temporal/order-fulfillment.activities.ts).
- Dispatch and worker lifecycle are implemented in
  [`order-workflow-dispatcher.ts`](../services/orders/src/infrastructure/temporal/order-workflow-dispatcher.ts)
  and
  [`order-workflow-worker.ts`](../services/orders/src/infrastructure/temporal/order-workflow-worker.ts).

## Current order workflow

1. A dispatcher claims an eligible, NATS-published outbox event.
2. It starts a workflow with a deterministic ID based on the order ID. A retry
   or duplicate start therefore does not create a second logical workflow.
3. The worker calls the local payments service to charge the order.
4. If payment succeeds, it calls inventory to reserve the order items.
5. If inventory is unavailable, it refunds payment before cancelling the order.
   An unsuccessful refund keeps the workflow retrying rather than claiming the
   paid order was safely cancelled.
6. If inventory is reserved, the workflow confirms the order.

Calls use idempotency keys so retrying a remote effect does not duplicate its
business outcome. Business responses such as payment decline or inventory
unavailability are distinct from transient network/server failures.
Notifications and shipment fulfillment are not part of the current workflow.

The workflow worker uses the `orders-fulfillment` task queue. Activities have
a 30-second start-to-close timeout, a one-second initial retry interval, and
exponential backoff capped at one minute. The outbox dispatcher uses a
deterministic workflow ID per order and records start/retry/terminal-failure
state in PostgreSQL. Temporal start acceptance and business-workflow
completion are separate stages.

## Local operation and boundaries

The local Compose setup uses Temporal for workflow orchestration and local HTTP
payments/inventory services. Those services are development implementations;
production provider integrations, deployment, and recovery guarantees remain
future work. The server's Compose health check uses Temporal's gRPC cluster
health API, and the orders service and gateway wait for Temporal to be serving
before startup. Workflow state is persisted by the local Postgres instance;
this single-node setup has no high availability or backup guarantee.

Use [`orders_workflow.md`](./orders_workflow.md) for the request/event path and
HTTP activity contracts, and [`diagrams.md`](./diagrams.md) for the system map.
Use [`../infra/README.md`](../infra/README.md) for build, start, and health
commands.

Step Functions is a possible AWS-managed alternative, not the engine used by
the current local order flow. Avoid operating two orchestrators for the same
business process unless their ownership boundary is explicit.
