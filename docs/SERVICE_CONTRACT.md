# TMS HTTP service baseline

This document defines a shared technical baseline for the TMS gateway,
identity, workforce-account, Load, Dispatch, and Execution services. It does
not claim that all planned domain services already exist.

## Health and readiness

| Endpoint | Contract |
| --- | --- |
| `GET /health` | Process/dependency report with service name, status, dependency states, and timestamp. Use HTTP 200 to report the health document, including degraded dependency details. |
| `GET /ready` | HTTP 200 `{ "ready": true }` when the service can accept its supported work; otherwise HTTP 503 with `{ "ready": false, "details": ... }`. |
| `GET /metrics` | Prometheus exposition for process and bounded-cardinality service metrics. |

Health describes observed process/dependency conditions; readiness is the
service's decision to accept work. A dependency used only for a later
asynchronous effect need not make durable request acceptance unavailable.
Document service-specific readiness decisions and test them.

## Identity and authorization

- Clients authenticate with a signed JWT access token in
  `Authorization: Bearer <token>`. Access JWTs currently expire after 15
  minutes.
- Refresh tokens are also signed JWTs, expire after 30 days, and are stored
  server-side as keyed hashes. Rotation revokes the previous token and
  creates its replacement atomically. Do not place refresh tokens in access
  token claims or logs.
- There is no public account-registration endpoint. Trusted local operator
  provisioning assigns role grants; never accept caller-selected roles.
- A principal may have multiple role grants. Each grant may carry an area
  scope (`la`, `west`, `central`, or `east`) or be company-wide when the role
  requires it. See [company roles](./trucking/RESPONSIBILITIES.md).
- Each service validates the authenticated principal and applies
  resource-level checks. A role string alone does not authorize every load,
  assignment, or execution in an area.
- Internal service identity and client identity must not be confused.
  Downstream services must not trust caller-supplied identity headers unless
  the request is authenticated as coming from a trusted gateway/service.

## Request identity and observability

Use `x-request-id` for a service-local request, `x-correlation-id` as a
business/workflow join key, and W3C Trace Context for distributed tracing.
Validate inbound values, propagate them deliberately, and avoid persisting
unneeded tracing baggage.

Structured logs, metrics, and traces are complementary. Do not put credentials,
full tokens, personal information, customer-sensitive commercial details, or
unbounded identifiers in metric labels.

## API boundaries

- Validate body, path, query, and downstream response data at runtime.
- Give network calls finite deadlines and bounded, operation-safe retries.
- Return explicit authorization, validation, conflict, dependency, and
  internal errors. Do not turn unexpected failures into success or
  not-found responses.
- Keep customer-safe status separate from internal dispatch/execution data.
- Document and test state transitions, idempotency keys, and partial failure
  at cross-service boundaries.

## Implementation status

Gateway, identity, and workforce-account services currently form the
retained foundation, including JWT issuance, refresh rotation/revocation,
scoped role grants, and trusted provisioning. The three domain services and
their final route contracts are planned, not yet implemented. See the
[TMS architecture](./ARCHITECTURE.md) and
[development roadmap](./README_NEXT_STEPS.md).
