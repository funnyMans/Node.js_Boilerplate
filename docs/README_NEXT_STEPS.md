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

## Stage 2 — define assignment before automating it

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
- An approved assignment must be authoritative and remove that capacity
  from competing available candidates consistently.

First model and test the human decision and its information needs. Only then
add system guidance:

1. Display feasible candidates and the data/reasons behind each.
2. Add explainable rankings that can be overridden by the accountable
   supervisor.
3. Evaluate a one-click approval flow, including race conditions and
   duplicate approval.
4. Evaluate preassignment at defined operational stages.
5. Consider automatic assignment only after the objectives, legal/contract
   constraints, employee preferences, exception handling, and measured
   outcomes are clear.

**Exit:** the data and decision rules can explain a manual assignment and
support tests for eligibility, fairness to stated priorities, company
benefit, supervisor override, and competing capacity claims.

## Stage 3 — freeze the first service architecture and slice contracts

Use three domain services:

- **Load** owns the ready transportation commitment and requirement
  revisions.
- **Dispatch** owns capacity proposals, supervisor authorization, and the
  authoritative assignment.
- **Execution** owns the movement record, progress, exception handoffs,
  evidence, completion, and correction history.

Each service owns its persistence and validates requests at its boundary.
Identity owns credentials and scoped role grants. Avoid shared-table access
and distributed transactions. Define assignment-to-execution partial
failure, idempotency, retry/reconciliation, authorization, and visible
pending/failed states before committing to an API/event sequence.

**Exit:** context map, data ownership, contracts, authority checks, and
cross-service failure behavior are precise enough to implement and test.

## Stage 4 — implement one complete manual vertical slice

Start from a controlled, ready-to-operate load and complete:

1. A dispatcher proposes capacity without reserving it.
2. An authorized departure-area supervisor confirms one assignment.
3. An execution is created exactly once and progress is recorded.
4. A representative exception reaches the accountable person and receives
   an explicit resolution or remains open.
5. Selected delivery evidence records completion.
6. A correction preserves the original fact and the audit trail.

Test unauthorized actions, duplicate requests, stale/conflicting updates,
and an unavailable downstream service. Make externally visible status
deliberate and keep internal notes/evidence protected.

**Exit:** integration scenarios prove the end-to-end path and failure/recovery
behavior, not just isolated endpoints. Revise the domain and architecture
based on what the implementation teaches.

## Stage 5 — add useful decision support and automation

After the manual path and domain structures are stable, implement matching
and ranking incrementally. Make reasons, input data, constraints, and
overrides visible. Then evaluate one-click approval, capacity removal from
other candidate lists, preassignment, and finally automatic assignment.
Each step needs measurable criteria for company benefit, employee
priorities, operational safety, fairness, and error recovery.

Do not treat automation as the default endpoint. Keep manual decision
authority where policy, law, uncertainty, or operational judgment requires
it.

## Stage 6 — expand the TMS only by demonstrated workflow need

Candidate later capabilities include customer/brokerage intake, outside
carriers, customer-facing access, tracking integrations, workforce
availability, maintenance, legal/HOS compliance, settlement, analytics, and
cross-company integrations. Define their owner, authoritative source,
business rules, privacy/legal constraints, failure behavior, and verification
plan before adding them.

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
