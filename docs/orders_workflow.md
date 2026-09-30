# Orders & Workflow

Domain models

- Implemented: `Order`, `OrderItem`, and transactional outbox records in `services/orders`.
- Implemented locally: payment and inventory HTTP services backed by their own
  PostgreSQL databases. Production provider and inventory integrations remain
  future work.

Key patterns

- The `orders` outbox persists order events in the order-creation transaction.
- The dispatcher starts `OrderFulfillmentWorkflow` from published outbox rows;
  workflow IDs are deterministic by order ID. Outbox dispatch attempts are
  capped at 10 with exponential backoff (up to 60 seconds), then the row is
  marked terminal for operator review.
- The Temporal worker uses idempotency keys for payment and inventory
  operations, including retries and compensation.
- `correlationId` is propagated from HTTP request to event and workflow input.
- The request's W3C `traceparent`/`tracestate` is also persisted with the
  outbox row. NATS, raw S3 export, Temporal dispatch, and each activity create
  spans from that parent context; activity HTTP calls propagate child context
  to payments and inventory. Baggage is not persisted or forwarded.

Order flow (high level)

1. Authenticated client → API Gateway → `POST /orders`.
2. `orders` writes Order + Outbox event in one transaction.
3. Outbox publisher retries delivery of `orders.order.created` to NATS, with
   W3C context in message headers.
4. An independent outbox exporter retries writing the event as JSONL to the
   S3-compatible raw bucket. Its delivery state is tracked separately, export
   spans carry the outbox trace context, and deterministic object keys make
   retries idempotent.
5. The database-backed dispatcher starts a deterministic Temporal workflow
   with trace context carried in its workflow input.
6. Activities call the local payments and inventory HTTP services: charge
   payment → reserve inventory → confirm order.
7. If payment is declined, cancel the order. If inventory is unavailable, refund the payment before cancelling; transient failures retry in Temporal.

Activity HTTP contracts

- Payment: `POST /payments/charges`, body `{ orderId, userId }`, idempotency key `order:{orderId}:charge`; return `{ status: "charged", paymentId }` or HTTP 402.
- Inventory: `POST /inventory/reservations`, body `{ orderId, items }`, idempotency key `order:{orderId}:reserve`; return `{ status: "reserved", reservationId }` or HTTP 409 when unavailable.
- Compensation: `POST /payments/refunds`, body `{ orderId, paymentId }`, idempotency key `order:{orderId}:refund`; return `{ status: "refunded" }`.
- Invalid 4xx responses and contract violations fail the workflow visibly. Network, 429, and 5xx errors are retried. Compensation must be idempotent; an unresolved refund keeps the workflow retrying instead of incorrectly cancelling a paid order.
- The 10-attempt cap applies to outbox delivery (NATS publication, raw export,
  and Temporal workflow start), not to Temporal activity attempts inside an
  already-started workflow. Temporal controls activity retries separately.
- NATS, raw-export, and workflow-start terminal failures are observable in
  separate outbox metrics/alerts. They do not make `/ready` fail; inspect the
  stage-specific backlog, terminal gauge, service logs, and outbox row before
  deciding whether to requeue.
- `OUTBOX_RETENTION_DAYS=0` disables cleanup. A positive value permits an
  hourly, bounded sweep of at most 500 rows per pass, but only when the event
  is published, the workflow has started, and raw export has completed.
  Cleanup removes the outbox row only—not S3 objects or Temporal history.

## Terminal delivery recovery

Before retrying, identify the exact event by its outbox UUID/correlation ID,
inspect its `last_error` or stage-specific error field, and restore the
dependency that caused the failure. Check the service logs and these metrics:

- `orders_service_outbox_failed_events` for NATS publication.
- `orders_service_outbox_workflow_failed_events` for Temporal workflow start.
- `orders_service_outbox_raw_export_failed_events` for raw-object export.

The outbox caps each of these delivery stages at 10 attempts. It does not
automatically retry a terminal row; an operator must deliberately requeue it.
The following examples are for one event only. Replace the UUID with the
verified event ID, execute exactly one stage-specific update, and confirm it
changed one row. If it changed zero rows, stop and inspect the current state
rather than broadening the condition.

**Local drill evidence (2026-09-30):** for one completed test order, each
expired-lock path reached its terminal state at attempt 10, raised its
Prometheus gauge/alert, then recovered after the matching one-stage requeue.
The NATS requeue also delivered the event and W3C trace header to a temporary
subscriber. The exercise changed only that test order's outbox fields; it was
not a dependency-outage drill. Repeating a NATS publication can duplicate an
event, so a future application consumer must be idempotent.

For a terminal NATS publish (`status = 'FAILED'`):

```sql
UPDATE outbox_events
SET status = 'PENDING',
    attempts = 0,
    available_at = NOW(),
    locked_until = NULL,
    last_error = NULL
WHERE id = 'REPLACE_WITH_EVENT_UUID'::uuid
  AND status = 'FAILED';
```

For an unstarted Temporal workflow with `workflow_failed_at` set:

```sql
UPDATE outbox_events
SET workflow_attempts = 0,
    workflow_available_at = NOW(),
    workflow_locked_until = NULL,
    workflow_last_error = NULL,
    workflow_failed_at = NULL
WHERE id = 'REPLACE_WITH_EVENT_UUID'::uuid
  AND workflow_started_at IS NULL
  AND workflow_failed_at IS NOT NULL;
```

For an incomplete raw export with `raw_export_failed_at` set:

```sql
UPDATE outbox_events
SET raw_export_attempts = 0,
    raw_export_available_at = NOW(),
    raw_export_locked_until = NULL,
    raw_export_last_error = NULL,
    raw_export_failed_at = NULL
WHERE id = 'REPLACE_WITH_EVENT_UUID'::uuid
  AND raw_exported_at IS NULL
  AND raw_export_failed_at IS NOT NULL;
```

These examples intentionally do not reset unrelated delivery stages. NATS
publication is at-least-once around uncertain network failures, so a consumer
must be idempotent before the repository adds one; raw-object keys and
Temporal workflow IDs are deterministic. Do not requeue until the original
cause is addressed, and do not use these statements as a retention or cleanup
procedure.

- The development Compose file points `PAYMENT_SERVICE_URL` and
  `INVENTORY_SERVICE_URL` at the included local services. Override those
  variables only when intentionally testing compatible alternate endpoints.
- Notifications and shipment fulfillment remain future integrations; the workflow's successful terminal order state is `confirmed`, not `fulfilled`.

For the container build/start sequence and the difference between readiness
and background delivery, see [`../infra/README.md`](../infra/README.md).

Testing

- Unit: order route validation, ownership, activity contracts, and event contracts.
- Integration: start order service + ephemeral DB + outbox publisher (testcontainers).
- Contract: assure `payments` and `inventory` accept events produced by `orders`
