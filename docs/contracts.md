# Contracts & Schemas

Location: `packages/contracts/`

Principles

- `packages/contracts` is the shared compile-time registry for DTO and event
  types. It does not currently export runtime Zod schemas or generate OpenAPI.
- Validate untrusted HTTP and event payloads at the receiving boundary; a
  TypeScript type does not validate data at runtime. Runtime schemas currently
  live with the service or test that owns that boundary.
- Event envelope: `{ eventId, eventType, sourceService, version, occurredAt, correlationId, payload }`; `causationId` and `traceId` are optional.
- Subject naming: `<service>.<entity>.<action>` (e.g., `orders.order.created`).

Implemented order contracts:

- `CreateOrderRequest` accepts product IDs and positive quantities; price is never trusted from the client.
- `OrderCreatedEvent` uses the shared event envelope and is persisted to the orders outbox in the same transaction as the order.
- NATS subject: `orders.order.created`; event type: `order.created.v1`.
- The orders publisher writes to the file-backed `ORDERS` JetStream stream and waits for a publish acknowledgement before marking the outbox row published. The event ID is the broker deduplication key; consumers must still be idempotent because the deduplication window is bounded.
- The stream is local single-replica storage with bounded retention. There is no application consumer yet, so the broker acknowledgement is not a business-processing acknowledgement.
- The orders outbox exporter writes this unchanged event envelope as one JSONL record per S3 object under `raw/orders/created_date={UTC date}/events/`. Object keys are based on the outbox UUID so retries safely overwrite the same object.

Potential future schema work (not implemented as shared schemas today)

- Decide whether shared runtime schemas reduce meaningful duplication before
  moving service-owned validation into `packages/contracts`.
- If schemas are shared later, keep runtime parsing at each untrusted receiver.

Versioning & compatibility

- The event envelope requires a `version` field.
- Recommended policy: additive changes are backward-compatible; breaking
  changes require a new event version and a compatibility test.
- This policy is not currently enforced by a producer/consumer schema test in
  CI. The opt-in order journey validates the event it observes, but there is no
  application consumer contract to test yet.

Generation (future option)

- OpenAPI/JSON Schema generation is not currently configured. Consider
  `zod-to-openapi` or a custom generator only alongside an agreed schema
  ownership and compatibility policy.
