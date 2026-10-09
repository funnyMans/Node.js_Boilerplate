# TMS MVP first-slice charter

This charter selects the first workflow for our trucking TMS study project.
We own the company model; there is no real customer requirement. Ground the
design in actual operating practices and applicable law, test it with
runnable scenarios, and revise assumptions when evidence challenges them.
This is not a production-readiness claim.

See the [target architecture](./MVP_ARCHITECTURE.md) for service ownership
and the [trucking reference](./README.md) for business hypotheses.

## What

Coordinate one transportation commitment that is already ready for
operations through:

1. An accountable departure-area supervisor and one eligible capacity
   assignment.
2. Operational progress recorded by the responsible people.
3. An exception reported, routed to an accountable person, and resolved or
   explicitly left pending.
4. Delivery evidence, completion, and a traceable correction path.
5. A broker-visible customer status that contains only verified,
   customer-relevant information.

The slice includes the Load, Dispatch, and Execution services, with the
authority boundaries defined in the
[architecture document](./MVP_ARCHITECTURE.md).

## When

Start implementation only after:

- Each service's source-of-truth data and authority are explicit.
- The successful, exception, and correction scenarios are written as
  observable acceptance criteria.
- The minimum load-ready, capacity-eligibility, milestone, and completion
  evidence requirements needed by those scenarios are chosen.
- The assignment handoff has defined pending/failure behavior and an
  idempotent retry or reconciliation path.

Do not wait to answer questions that the first slice does not depend on.
After each runnable path, test the assumptions and update these documents
before adding the next capability.

## Where

Build Load, Dispatch, and Execution as separate services in the existing
monorepo. Reuse shared runtime and identity capabilities only after checking
their contracts. Give each domain service control of its own data and expose
cross-service behavior through explicit APIs or events, never shared-table
access.

Choose infrastructure only when the TMS workflow needs it and its behavior
can be verified.

## Why

The slice exercises the core operating loop and the architecture's hardest
early boundaries: commercial commitment versus operational assignment,
authorized human decisions, ownership across a long-running movement,
exception handoff, evidence, and partial failure between services.

Because the model has no customer validation, a complete tested workflow is
more useful than a broad set of unconnected endpoints or premature
infrastructure. Each scenario should reveal whether the assumed roles,
states, and service boundaries make sense.

## How

- Begin with a ready commitment. For this slice, load intake, booking, and
  carrier sourcing are upstream; provide a controlled fixture or explicit
  setup path for a ready load.
- Drivers and dispatchers can express priorities and operational knowledge.
  The authorized supervisor weighs those inputs against company benefit for
  the specific load and confirms the assignment.
- Persist assignment authority in Dispatch and operational facts/evidence in
  Execution. The assignment-to-execution handoff must be idempotent and make
  partial failure visible.
- Record progress and exception facts with their source and accountable
  owner. Route an exception to an actionable person; keep customer updates
  limited to verified information.
- Complete the execution only when the selected completion evidence is
  recorded. Preserve an auditable correction path rather than erasing closed
  history.
- Test service contracts and the full workflow, including duplicate requests
  or deliveries and a failed cross-service handoff. A green unit test in one
  service alone does not prove the slice.

## Do

- Implement one normal end-to-end path, one representative exception
  handoff, and a correction of recorded information.
- Use explicit actor and authority checks for proposal, assignment, reporting,
  resolution, and correction.
- Keep customer-safe status separate from internal execution details.
- Make pending, rejected, failed, and completed outcomes distinguishable.
- Keep the detailed operational workflow as hypotheses and promote a rule
  into code only when the selected scenarios need it.
- Use tests to probe partial failure and to revise both the model and the
  service boundaries.
- Establish load, capacity, authority, and company-benefit structures before
  building matching, ranking, one-click approval, preassignment, or
  automatic assignment. First make candidate reasoning explainable; then
  test whether automation is useful and safe.

## Do not

- Build full brokerage/customer intake, negotiation, spot sourcing, or a load
  marketplace.
- Build automated matching, optimization, award ranking, preassignment, or
  performance scoring in the first slice.
- Implement a legal/HOS rules engine, workforce scheduling, maintenance,
  billing, settlement, insurance, or broad CRM/ERP/TMS features.
- Assume device tracking, third-party integrations, portals, analytics, or
  automation before the workflow demonstrates their value.
- Introduce distributed transactions, event brokers, workflow orchestration,
  service meshes, or additional services merely because they are common in
  production.
- Treat an internally consistent scenario model as validated customer
  demand, legal advice, or a production guarantee.

## First-slice acceptance scenarios

Before code, turn these scenario outlines into exact state and API/event
expectations:

1. **Successful movement:** a ready load has an accountable supervisor; a
   dispatcher proposal does not reserve capacity; the supervisor authorizes
   exactly one assignment; an execution is created; progress and selected
   delivery evidence are recorded; completion is visible with an audit
   history.
2. **Exception handoff:** a driver or carrier reports a movement issue; the
   execution records known facts; the accountable supervisor receives an
   actionable handoff; the broker can communicate only verified
   customer-relevant status; the issue is resolved or explicitly remains
   open.
3. **Partial failure and replay:** an assignment is authorized but the
   Execution service is temporarily unavailable; the system exposes a
   non-success pending/failed outcome, retries or reconciles idempotently,
   and creates no duplicate execution or competing assignment.
4. **Correction:** an authorized person corrects a relevant recorded fact
   after completion; the original value and correction remain auditable, and
   the execution is not silently reopened.

The exact states, evidence source, initial capacity type, permissions, and
customer-visible fields are implementation decisions. Resolve them before
the first scenario depends on them, not by importing every rule in the broad
reference workflow.
