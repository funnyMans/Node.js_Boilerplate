# TMS service contracts

The Load, Dispatch, and Execution services are the TMS domain owners. Their
contracts represent business decisions and facts, not a shared database
schema. Validate every request at the receiving service; a TypeScript type
does not validate runtime data.

## Contract ownership

- Load defines the ready-load commands and queries, requirements, and
  revision history.
- Dispatch defines capacity proposals, assignment authorization, and
  assignment-state transitions.
- Execution defines progress facts, exception handoffs, evidence, completion,
  and correction records.
- Identity defines authenticated principals and role grants. A caller's
  grants are authorization inputs; each owning service still checks the
  resource-specific authority and state transition.
- `packages/contracts` may hold stable transport types and schemas used at
  multiple boundaries. Do not move domain policy there merely to share it.

## Cross-service guarantees

Before implementing an assignment request, define:

- Stable load, assignment, capacity, and execution identifiers.
- The exact authorization and load-readiness checks.
- The response if Dispatch persists an assignment but Execution cannot
  create its execution record.
- Idempotency behavior for retried commands and duplicate delivery.
- How pending/failed work is inspected, retried, and reconciled.
- Which service owns each state transition and customer-safe projection.

Do not report a fully active assignment until the defined cross-service
invariants hold. Do not use distributed transactions. Select HTTP, events,
or both only after those semantics are explicit.

## Event envelope (when durable events are justified)

Use a versioned, validated event envelope with:

`eventId`, `eventType`, `sourceService`, `version`, `occurredAt`,
`correlationId`, optional `causationId`, and a typed `payload`.

Events state facts that happened; commands request an owner to perform work.
Assume duplicate and delayed delivery. Consumers must validate, be
idempotent, expose failures, and define ordering and replay behavior. Do not
add an event broker before the workflow needs durable asynchronous delivery.

## Evolution

Additive, backward-compatible contract changes may retain a version only
when old receivers can safely accept them. Breaking changes require a new
version and compatibility tests. Runtime parsing belongs at each receiver,
even when producers and consumers share generated types.

The complete first-slice API/event contract is a gate in the
[development roadmap](./README_NEXT_STEPS.md); this note intentionally does
not invent endpoint or event names before domain states are settled.
