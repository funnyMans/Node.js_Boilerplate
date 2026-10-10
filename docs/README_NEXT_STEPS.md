# TMS study and development roadmap

This roadmap is for a realistic TMS study system built around the company
defined in the [vision](./trucking/VISION.md). We are the owners of the model,
not a real customer. Business rules must be informed by real operating
practice and applicable law, recorded with assumptions, and tested. This
sequence separates defining the system from building its business features.

## Stage 0 — align the retained foundation

Keep only documentation, services, packages, and runtime components that
support the TMS company model or the engineering needed to test it. Adapt the
identity and account-profile foundation to TMS roles, scoped grants, JWT
access, revocable refresh rotation, and trusted provisioning. Do not begin
implementing Load, Dispatch, or Execution behavior during this cleanup stage.

**Exit:** maintained documentation, workspace scripts, Compose, CI,
contracts, and retained services consistently describe this TMS study; no
unrelated product implementation remains.

## Stage 1 — establish the operating model

1. Confirm the company baseline: US trucking company with its own fleet and
   brokerage; approximately 50–100 trucks; LA (home), West, Central, and
   East areas.
2. Confirm the workforce and authority relationships: transportation
   leadership, chief/area supervisors, brokers, shared fleet dispatchers,
   drivers, and contract-capacity roles where in scope.
3. Model role grants as potentially multiple per account, optionally scoped
   to areas. Keep role grants distinct from load ownership, assignment, and
   specific resource authorization.
4. Define the important nouns and their ownership: customer commitment,
   freight, load, capacity (driver, power unit, trailer), assignment,
   execution, trip/itinerary, operational facts, and correction history.
5. Validate legal/contractual requirements with authoritative sources and
   qualified professionals where necessary. Record what is a legal
   constraint, company policy, or an unverified assumption.

**Exit:** a readable domain glossary, role/authority matrix, ownership map,
and representative normal/exception scenarios that agree with one another.

## Stage 2 — define the workflow and system vision

Use the [core workflow design](./trucking/CORE_WORKFLOW.md) to make the
first end-to-end path explicit: start conditions, actors, authority, state
transitions, records, exception/correction paths, and observable outcomes.
Use the [system vision](./trucking/SYSTEM_VISION.md) to distinguish the first
operational ring from later capabilities and the production-readiness
envelope.

Draw business flow separately from technical interactions. For each
cross-service step, name the source of truth, failure state, idempotency key,
recovery owner, and customer/employee-visible result. Treat schema and API
examples as conceptual until the required scenarios settle the invariants.

**Exit:** normal movement, exception handoff, assignment partial failure,
replay, and correction have reviewable sequences; conceptual data ownership
and the required decisions are explicit; deferred ring capabilities remain
out of the first-slice contract.

## Stage 3 — define assignment before automating it

The assignment model must preserve both employee input and company
accountability:

- Drivers express readiness and priorities; dispatchers add operational
  knowledge and propose feasible capacity.
- The departure-area supervisor remains accountable and weighs those inputs
  against the benefit and requirements of the specific load.
- Define load-specific company objectives, hard eligibility constraints,
  employee-priority treatment, conflicts, overrides, and the rationale that
  must be retained. Do not substitute one universal score for the model
  without evidence.
- Dispatch owns editable Reservation records, separate final Assignment
  records, and the capacity-window claim ledger. Multiple nominees may
  compete for a load and one trio may be nominated for several loads without
  reserving either side. A Reservation or reasoned direct Assignment
  atomically claims the load and the stable driver/power-unit/optional-single-
  trailer configuration for a use window. Final Assignment links the exact
  Reservation revision and maintains its claim. Same-load and overlapping
  capacity-window conflicts use first-valid-commit wins; a conflict is shown
  to the supervisor for a new decision. Non-overlapping future windows are
  allowed. Keep the ledger in Dispatch; Reservation is a business record,
  not a standalone service in Ring 1.
- Prior-day loads receive nomination priority through 4:00 p.m. local
  time; same-day bookings may be nominated throughout the day. A next-
  morning load booked after the cutoff is directly assigned by the
  supervisor from currently available capacity. Ordinary loads target final
  Assignment by the calendar day before pickup; same-booking-day pickup is
  an emergency path whose detail remains open. A follow-on
  nomination requires the current load's BOL/in-progress milestone and
  dispatcher-verified next availability; do not book months ahead. Home-base
  trio reconfiguration with driver agreement must be recorded before
  nomination. Preassignment is preferred for dispatcher challenge, but
  supervisors may directly assign with rationale.
- Neither Reservation nor Assignment claims automatically expire. The
  Reservation remains historical after finalization; Assignment/execution
  history remains through completion, while its capacity-use window is
  updated at pickup completion from verified next availability. Closing a
  Reservation or Assignment requires a structured reason, accurate
  component status, and dispatcher-verified next availability; claim closure
  alone does not make a trio available. Record post-Assignment changes,
  execution milestone, release/availability, repositioning/deadhead, and
  idle time to support broker review of customer-retention claims.

First model and test the human decision and its information needs. Only then
add system guidance:

1. Display feasible candidates and the data/reasons behind each.
2. Add explainable rankings that can be overridden by the accountable
   supervisor.
3. Evaluate a one-click approval flow only after atomic reservation prevents
   conflicting assignment requests and duplicate approval is idempotent.
4. Evaluate additional automated guidance and decision support against the
   daily human nomination/preassignment process.
5. Consider automatic assignment only after the objectives, legal/contract
   constraints, employee preferences, exception handling, and measured
   outcomes are clear.

**Exit:** the data and decision rules can explain a manual assignment and
support tests for eligibility, fairness to stated priorities, company
benefit, supervisor override, and reservation conflicts for overlapping
capacity claims.

Record nominations, viable alternatives, stale availability, assignment
outcomes, and accountable follow-up reasons before defining any
participation/priority score. A raw count can reward excessive nominations
or penalize dispatchers for a lack of suitable loads; distinguish dispatcher
planning, supervisor decision backlog, outer-fleet sourcing, and brokerage
overbooking. Any score formula remains a later policy decision.

## Stage 4 — freeze the first service architecture and slice contracts

Use three domain services:

- **Load** owns the ready transportation commitment and requirement
  revisions.
- **Dispatch** owns capacity proposals, supervisor authorization, and the
  editable Reservation and separate authoritative Assignment.
- **Execution** owns the movement record, progress, exception handoffs,
  evidence, completion, and correction history.

Each service owns its persistence and validates requests at its boundary.
Identity owns credentials and scoped role grants. Avoid shared-table access
and distributed transactions. Define assignment-to-execution partial
failure, idempotency, retry/reconciliation, authorization, and visible
pending/failed states before committing to an API/event sequence. Dispatch
owns an editable Reservation ledger and separate Assignment records;
Reservations atomically claim both load and capacity windows, and final
Assignment links the exact Reservation revision without duplicating the
claim. Load coordinates requirement changes that race with Reservation
refresh or final Assignment using the commit-order-wins rule, with supervisor
review during Reservation or post-Assignment change handling. Implement a
durable Load/Dispatch barrier for that ordering, plus safe Reservation
closure, cancellation, no-start release, and technical-failure
reconciliation. Claims do not auto-expire.

**Exit:** context map, data ownership, contracts, authority checks, and
cross-service failure behavior are precise enough to implement and test.

## Stage 5 — implement one complete manual vertical slice

Start from a controlled, ready-to-operate load and complete:

1. A dispatcher nominates a load/trio without reserving it, including a
   follow-on load only after BOL/in-progress and verified next availability.
2. An authorized departure-area supervisor creates an editable Reservation
   and claims one load and capacity window atomically, or directly assigns
   with a recorded rationale.
3. The dispatcher is notified and can inspect or challenge the Reservation
   without an approval step.
4. The supervisor creates a distinct final Assignment linked to the exact
   Reservation revision; the claim remains and an execution is created
   exactly once. Pickup completion updates the capacity window for subsequent
   non-overlapping work.
5. A representative exception reaches the accountable person and receives
   an explicit resolution or remains open.
6. Selected delivery evidence records completion.
7. A correction preserves the original fact and the audit trail.

Test unauthorized actions, duplicate requests, same-load and overlapping-
window conflicts, stale/conflicting updates, and an unavailable downstream
service. Make externally visible status
deliberate and keep internal notes/evidence protected.

**Exit:** integration scenarios prove the end-to-end path and failure/recovery
behavior, not just isolated endpoints. Revise the domain and architecture
based on what the implementation teaches.

## Stage 6 — add useful decision support and automation

After the manual path and domain structures are stable, implement matching
and ranking incrementally. Make reasons, input data, constraints, and
overrides visible. Then evaluate one-click approval and finally automatic
assignment. Daily human preassignment and capacity removal from competing
candidate lists are part of Ring 1, not later automation.
Each step needs measurable criteria for company benefit, employee
priorities, operational safety, fairness, and error recovery.

Do not treat automation as the default endpoint. Keep manual decision
authority where policy, law, uncertainty, or operational judgment requires
it.

## Stage 7 — expand through the capability rings

Grow from the core only when a demonstrated workflow needs it. Ring 2 may
add broker intake, authoritative fleet/capacity and availability, trip
coordination, actionable notifications, evidence management, and accurate
customer-safe status. Ring 3 may add portals, partner integrations,
telematics, compliance/maintenance/settlement integrations, analytics, and
explainable decision support. The
[system vision](./trucking/SYSTEM_VISION.md) describes the production
envelope and the evidence expected before a real-business pilot.

For every candidate, define its owner, authoritative source, business rules,
privacy/legal constraints, failure behavior, and verification plan before
adding it.

## Supporting engineering gates

- Keep strict TypeScript, explicit runtime validation at service boundaries,
  structured logging, health/readiness, traces, and metrics that reveal
  workflow failures.
- Verify every service build and focused tests before running the workspace
  suite. Use PostgreSQL-backed integration tests for persistence and
  cross-service boundaries.
- Keep local Compose configuration small and reproducible. Add queues,
  workflow orchestration, caches, or deployment systems only to satisfy a
  defined workflow or test.
- Update architecture, operating assumptions, and tests together whenever
  observed behavior changes the model.
- Do not claim customer fit, legal compliance, scale, or production readiness
  from local tests.
