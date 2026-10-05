# Project ideology: a resilient Node.js backend foundation

## Why this project exists

This project aims to become a production-minded, reusable foundation for
backend systems that connect user-facing applications and APIs to business
services, data stores, and external providers. It should make common backend
work understandable and repeatable without pretending that one architecture,
framework, or technology can solve every problem.

The first reference domain is logistics and truck brokerage. It gives us real
constraints to reason about: loads and shipments move through long-running
processes; brokers, carriers, drivers, customers, and providers have different
responsibilities; tracking and documents arrive asynchronously; and a failed
integration should not casually stop unrelated work. The domain makes the
design concrete, but the engineering principles should remain useful to other
backend-heavy businesses.

This is a direction, not a production-readiness claim. The current repository
is a working foundation with examples and operational tooling; it does not yet
implement a complete brokerage product or prove any particular production
scale, availability, security, or recovery target. Keep intended capabilities,
implemented behavior, and verified behavior clearly distinguished.

## What we are optimizing for

When priorities conflict, start with this order and make exceptions explicit:

1. **Correctness and data integrity.** A system must not report success for
   work it has lost, corrupt business state, or hide a partial failure.
2. **Containment and recoverability.** One slow or unavailable dependency
   should have a bounded impact. Accepted work should have a clear path to
   retry, reconcile, or fail visibly.
3. **Understandable boundaries.** Business rules, transport protocols,
   persistence, and external systems should be separable enough to test and
   change without an unnecessary rewrite.
4. **Operability.** People need to know what the system is doing, what is
   unhealthy, and how to deploy, stop, restart, and recover it safely.
5. **Measured performance and cost.** Meet explicit latency and throughput
   goals with the simplest design that can sustain them. Optimize measured
   bottlenecks, not imagined ones.
6. **Evolution without ceremony.** Keep contracts and data evolvable, but do
   not build generalized frameworks, service meshes, or abstractions without
   a concrete use and an owner.

These priorities are deliberately not promises of zero downtime, unlimited
throughput, or zero data loss. Such guarantees have costs and must be stated
as measurable service objectives.

## Common problems worth solving

Across many companies, the backend between client applications and specialist
systems has recurring responsibilities:

- Translate client requests into stable internal contracts; authenticate and
  authorize them; validate untrusted input; and return useful, consistent
  errors.
- Compose several services without turning every request into a fragile,
  long chain of synchronous calls.
- Coordinate business processes that take seconds, hours, or days, including
  duplicate requests, late responses, cancellations, and human intervention.
- Move data between systems whose schemas, availability, and delivery
  guarantees differ.
- Preserve business identity and trace context across queues, scheduled work,
  and service calls without leaking sensitive data.
- Apply timeouts, bounded retries, backpressure, and overload behavior so a
  slowdown does not become a cascading outage.
- Support safe changes to services, events, and persisted data while old and
  new versions may run at the same time.
- Make the system observable and recoverable without making every developer
  or operator learn every implementation detail.
- Process large datasets and high request volumes while controlling storage,
  network, compute, and operational cost.

These are design prompts, not a commitment to implement every concern in
every service. A small service should stay small until its domain or operating
needs justify more structure.

## Architectural stance

### Use Node.js where it fits

Node.js is a strong fit for I/O-heavy APIs, gateways, integration adapters,
and many small or medium services: it can handle concurrent network work
efficiently and share a language ecosystem with frontend teams. It is not the
right default for every CPU-bound, memory-intensive, or latency-critical
workload. Measure first; isolate expensive work or delegate it to a more
appropriate runtime or specialist service when the evidence justifies that
boundary.

The gateway should handle client-facing concerns and deliberate composition,
not become the owner of every business rule. It should avoid needless
synchronous fan-out and have explicit timeout, authentication, and failure
behavior for each downstream dependency.

### Keep boundaries clean, without worshipping folders

Use Clean/Hexagonal Architecture as a dependency rule: domain policy should
not depend on Fastify, Prisma, NATS, Temporal, or a vendor SDK. Use ports at
real change or testing boundaries and adapters for technology-specific
details. Application use cases coordinate work; domain models enforce
invariants where that complexity exists.

Domain-Driven Design can help name meaningful bounded contexts and data
ownership. It does not require every service to have identical layers, every
entity to be an aggregate, or every noun to become a service. The structure
should reveal actual responsibilities rather than satisfy a template.

Start with a clear modular boundary. Split into independently deployed
services when separate ownership, scaling, security, fault containment, or
release cadence is valuable enough to pay for network calls, distributed
operations, and data coordination. Microservices are a tool, not the goal.

### Be event-aware, not event-only

Use a synchronous request when the caller needs an immediate answer and the
operation can reasonably finish within its latency budget. Use asynchronous
work when it is long-running, independently retryable, fan-out, or does not
need to delay the caller. A durable acceptance response must say what has
actually been accepted; it must not imply that downstream work has completed.

Events describe facts that have happened and are useful when other owners
need to react without being called inline. Commands request work from an
owner. Keep that distinction visible in names and contracts. Do not publish
events merely to avoid a direct call when a synchronous dependency is simpler
and its availability coupling is acceptable.

Whenever state and a message must agree, design for the dual-write failure
explicitly (for example, a transactional outbox). Consumers and side effects
must tolerate redelivery through idempotency, deduplication, or reconciliation.
Assume at-least-once delivery unless a specific broker and processing contract
proves otherwise; broker acknowledgement is not proof that a business effect
completed. Treat ordering, retention, replay, poison messages, schema
evolution, and dead-letter handling as explicit choices.

Prefer eventual consistency across bounded contexts over distributed
transactions when the business allows it. State what users can observe while
work is pending and how the system repairs a partial or delayed outcome.

## Reliability, lifecycle, and isolation

- Give network calls finite deadlines. Retries should be bounded, selective,
  jittered, and safe for the operation; retrying a non-idempotent effect can
  make an outage worse.
- Bound queues, concurrency, payload sizes, and in-memory work. Measure queue
  age and backlog as well as request health. Define behavior when capacity is
  exhausted rather than accepting work indefinitely.
- Use bulkheads and independent resource limits where they provide real fault
  containment. A shared database, broker, or cluster can still be a common
  failure domain; document it.
- Degrade selectively when possible: an optional tracking enrichment should
  not necessarily block a durable shipment update. Never turn an unknown or
  failed dependency into a success-shaped response.
- On shutdown, stop advertising readiness and accepting new work; drain
  in-flight requests within a deadline; stop or pause message intake; finish
  or safely release in-progress work according to its acknowledgement
  contract; then close dependencies. Log failures and timeouts explicitly.
- Assume a process can crash without graceful shutdown. Durable state,
  idempotent recovery, leases, and reconciliation—not signal handling
  alone—make restarts safe.
- During deployment, allow compatible old and new service versions to
  overlap. Evolve APIs and events deliberately; use expand-and-contract
  migrations when a schema change cannot be atomic across deploys.
- Isolate failures with explicit service ownership and bounded interfaces so
  one service can be restarted or rolled back without unnecessarily
  interrupting unrelated services. Avoid coupling every request to every
  dependency.

Graceful shutdown reduces disruption; it cannot guarantee no disruption.
Clients, load balancers, workers, and dependencies must all participate in
the lifecycle contract.

## Scale and performance: targets before topology

We should design so that growth can be handled deliberately, not claim that a
boilerplate can safely process terabytes or millions of requests without
workload evidence. Before choosing scaling mechanisms, define representative
request mixes, payload sizes, data-retention needs, latency percentiles,
availability objectives, and recovery objectives.

Scale the bottleneck that measurements identify. That may mean query and
index design, connection-pool limits, caching, streaming instead of loading
entire datasets, partitioning, read replicas, queue consumers, horizontal
replicas, or a specialist data-processing service. Each adds costs or
consistency and operational trade-offs. Keep state out of replaceable
application instances where practical, and understand the limits of shared
stateful dependencies.

For large data flows, consider streaming, bounded batches, pagination,
retention and deletion, and backpressure from the start of the interface
design. Track both bytes and records; a small number of oversized messages
can be as harmful as a large request count. Optimize with repeatable
benchmarks and production-like profiles when available.

## Security and operational evidence

Treat authentication, authorization, tenant isolation, secret handling,
encryption, input validation, auditability, and data minimization as
cross-cutting design concerns. Keep personal, commercial, and credential data
out of logs and event payloads unless there is a clear, protected need.
Interfaces between trusted services still require validation and access
control.

Use structured logs, metrics, and distributed traces as complementary tools.
Propagate trace context through asynchronous boundaries, keep a stable
business correlation key where appropriate, and control metric cardinality.
Define alerts around user impact and service objectives, not just process
existence. A health endpoint, dashboard, or successful local test is evidence
of only what it checks.

Mocks and fake services are useful for learning and repeatable failure tests.
They should implement explicit contracts and be able to simulate delay,
duplicates, partial failure, and recovery. Label them as fakes: they do not
prove the behavior, performance, security, or availability of a real provider.

## Reference domain: logistics and truck brokerage

Use US trucking and brokerage as a concrete example for discussing
responsibility, permissions, decisions, and work handoffs. The current
business goal is a shared working platform, not a complete transportation
suite. Analytics, forecasting, data reuse, CRM/TMS/ERP boundaries, and the
choice between one or several role-specific applications are deferred.

The first concern is a clear operating loop: broker handles commercial
sourcing and customer communication; dispatchers propose feasible capacity;
the departure-area supervisor makes the operational assignment; and drivers
or carriers execute and report. See the short
[trucking work-platform discussion](./trucking/README.md) for the current
assumptions, responsibilities, workflow, and remaining implementation
questions.

Treat these business rules as a working example, not a universal logistics
model or legal conclusion. Validate employment, carrier, and brokerage
relationships before applying them to real operations.

## Decisions, trade-offs, and questions to resolve

The following are starting positions to challenge with evidence, not immutable
rules:

| Topic                | Starting position                                                                                                                   | Benefit                                                 | Cost or counterargument                                            | Revisit when                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Service boundaries   | Start from domain ownership; extract only when an independent boundary earns its cost                                               | Clear ownership and blast-radius limits                 | Network and operational overhead; distributed consistency          | A team, security boundary, scaling profile, or release cadence diverges |
| Messaging            | Use durable asynchronous messaging for work that benefits from decoupling; keep immediate reads/actions synchronous when reasonable | Lower coupling and better handling of long-running work | Eventual consistency, duplicate delivery, more difficult debugging | A real workflow needs different latency or delivery guarantees          |
| Shared abstractions  | Share stable contracts and operational helpers, not business policy across contexts                                                 | Consistent baseline without obscuring ownership         | Premature shared code can block independent evolution              | Repeated duplication has a demonstrated change or defect cost           |
| Node.js workload     | Use it for I/O-heavy coordination and suitable services; benchmark CPU-heavy paths                                                  | Productive integration layer and efficient I/O          | Runtime is not ideal for all workloads                             | Profiling shows a sustained bottleneck or specialist needs              |
| Scale mechanisms     | Set workload and SLO targets before adding infrastructure                                                                           | Avoid cost and complexity without evidence              | Early simplicity may require later migrations                      | Measured demand or a concrete growth plan warrants it                   |
| Graceful degradation | Preserve core durable operations when optional dependencies fail                                                                    | Better user impact and fault isolation                  | More states and recovery paths to explain                          | Business rules require stronger consistency or fail-closed behavior     |
| External tracking    | Keep a canonical shipment view with source provenance and evidence                                                                  | Consistent operations across carriers and providers     | Requires ordering, freshness, conflict, and reconciliation rules   | A source system or regulation requires different authority              |

Questions that need answers before they become implementation promises:

1. Which actors, business states, and decision points are required at each
   stage of the selected intake-to-settlement journey, and what can be left
   outside its first modeled slice?
2. Who are the initial users and tenants, and what authorization and data
   isolation model do they require?
3. What should the system guarantee for shipment state, tracking freshness,
   financial correctness, and audit history?
4. Which operations may be accepted for later processing, and what must be
   confirmed synchronously?
5. What are the target workload, latency percentiles, availability, data
   retention, and recovery objectives? Which are requirements versus
   illustrative stress goals?
6. What deployment environment, geographic footprint, privacy, and regulatory
   constraints are in scope?
7. Which dependencies are allowed to be shared failure domains, and what
   degraded behavior is acceptable when each is unavailable?
8. Which integration contracts can be simulated faithfully, and what evidence
   will be needed before a fake is replaced by a real provider?

Answers should be recorded with rationale, alternatives, consequences, and
the evidence that would change them. Revisit them as the domain and measured
workload become clearer.

## How to use this document

Use this ideology to frame architecture discussions and review important
trade-offs. It does not prescribe a directory tree, mandate a broker, or
authorize a service split by itself. For each substantial decision, capture
the problem, constraints, options, failure modes, operational owner, and
verification plan. Keep the current architecture and implementation
documentation factual; update this vision when its assumptions change.

For the current trucking work-platform vision and business workflow, see
[`trucking/README.md`](./trucking/README.md).
