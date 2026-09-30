# Contracts & Schemas

Location: `packages/contracts/`

Principles

- Single source of truth: Zod schemas in `packages/contracts` drive validation, OpenAPI generation, test fixtures, and event schemas.
- Event envelope: `{ eventId, eventType, sourceService, version, occurredAt, correlationId, payload }`; `causationId` and `traceId` are optional.
- Subject naming: `<service>.<entity>.<action>` (e.g., `orders.order.created`).

Implemented order contracts:

- `CreateOrderRequest` accepts product IDs and positive quantities; price is never trusted from the client.
- `OrderCreatedEvent` uses the shared event envelope and is persisted to the orders outbox in the same transaction as the order.
- NATS subject: `orders.order.created`; event type: `order.created.v1`.
- The orders outbox exporter writes this unchanged event envelope as one JSONL record per S3 object under `raw/orders/created_date={UTC date}/events/`. Object keys are based on the outbox UUID so retries safely overwrite the same object.

Example Zod schemas (store in `packages/contracts/src/*.ts`)

- `UserSchema`
- `ProductSchema`
- `OrderSchema`, `OrderItemSchema`
- `PaymentSchema`
- Event schemas: `OrderCreatedEvent`, `PaymentSucceededEvent`, etc.

Versioning & compatibility

- Event `version` field required.
- Backward-compatibility policy: additive changes allowed; breaking changes require version bump and contract test.
- CI must run schema compatibility tests (consumer vs producer fixtures).

Generation

- Use `zod-to-openapi` or custom script to export JSON Schema/OpenAPI pieces.
