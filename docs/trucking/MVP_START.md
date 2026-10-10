# TMS MVP first-slice charter

This charter selects the first workflow for our trucking TMS study project.
We own the company model; there is no real customer requirement. Ground the
design in actual operating practices and applicable law, test it with
runnable scenarios, and revise assumptions when evidence challenges them.
This is not a production-readiness claim.

See the [target architecture](./MVP_ARCHITECTURE.md) for service ownership
and the [trucking reference](./README.md) for business hypotheses. The
[core workflow design](./CORE_WORKFLOW.md) details the proposed transition
sequence and logical contracts; the [system vision](./SYSTEM_VISION.md)
places the slice in staged capability rings.

## What

Coordinate one transportation commitment that is already ready for
operations through:

1. A daily dispatcher nomination and supervisor-managed editable Reservation
   that claims an eligible driver/power-unit/optional-trailer configuration,
   followed by a distinct final Assignment and operational execution. A trio
   may be nominated when it becomes available after pickup/BOL and
   in-progress status, or return to service after repair/recovery.
2. Operational progress recorded by the responsible people.
3. An exception reported, routed to an accountable person, and resolved or
   explicitly left pending.
4. Delivery evidence, completion, and a traceable correction path.
5. A broker-visible customer status that contains only verified,
   customer-relevant information.

The broker alone decides whether to book, clarify, or decline any customer
offer, including one received through an outside broker. This commercial
decision is upstream of this slice and requires no supervisor capacity
review. Supervisors authorize operational capacity assignments only.

The slice includes the Load, Dispatch, and Execution services, with the
authority boundaries defined in the
[architecture document](./MVP_ARCHITECTURE.md).

## When

Start implementation only after:

- Each service's source-of-truth data and authority are explicit.
- The core workflow's ordered transitions and cross-service failure outcomes
  are reviewed against the normal, exception, replay, and correction
  scenarios.
- The successful, exception, and correction scenarios are written as
  observable acceptance criteria.
- The minimum load-ready, capacity-eligibility, milestone, and completion
  evidence requirements needed by those scenarios are chosen.
- The assignment handoff has defined pending/failure behavior and an
  idempotent retry or reconciliation path.
- The Dispatch-owned Reservation boundary is defined: a Reservation is an
  editable, revisioned planning record that atomically claims one load and
  every member of its driver/power-unit/optional-trailer capacity window.
  Final Assignment is a separate decision linked to the exact Reservation
  revision and maintains the claim without a gap or duplicate. Same-load and
  overlapping capacity-window conflicts return the existing claim and
  require a new human decision. Changes in Load revision or reported trio
  readiness refresh the snapshot, append history, and may mark it for review.
  A documented capacity concurrency limitation is not an acceptable
  substitute.
- The daily decision window is explicit: prior-day loads receive dispatcher
  nomination priority through 4:00 p.m. in the operating area's local time;
  same-day bookings may be nominated throughout the day. Supervisors
  prioritize prior-day nominations after 4:00 p.m. while same-day loads
  remain eligible. A next-morning load booked after 4:00 p.m. is directly
  assigned by the supervisor from currently available capacity. Ordinary
  loads target final Assignment by the calendar day before pickup.
  Same-booking-day pickups follow an emergency path whose detailed rules
  remain open. Dispatcher approval is not required; the dispatcher is
  notified and may report or challenge a readiness issue. Supervisors may
  bypass nomination priority and the preferred Reservation flow for a
  reasoned direct Assignment.
- Follow-on nominations require the current load's BOL and in-progress status,
  plus a dispatcher-verified next-available date/time. Do not nominate a
  follow-on pickup earlier than that time. Keep planning to the next
  availability window rather than scheduling months ahead. Ring 1 capacity
  is one stable driver/power-unit configuration with an optional single
  trailer; home-base reconfiguration with driver agreement must be recorded
  before nomination.
- Reservation and Assignment claims do not time out automatically. A
  Reservation remains a historical planning record after finalization;
  preserve the Assignment/execution record through delivery, but update the
  capacity-use window at pickup completion using verified next availability.
  Only non-overlapping future capacity windows may be reserved. Concurrent
  broker requirement changes and Dispatch Reservation/final-Assignment
  decisions follow commit order: whichever commits first wins. Define the
  durable Load/Dispatch barrier that enforces this and recovers partial
  failure before implementation.
- Reservation arbitration is deterministic: the first valid Dispatch
  transaction to commit wins a same-load or overlapping-trio-window race.
  Return a conflict with the existing claim/window so the supervisor can
  choose again; do not wait for a comparison window or silently assign the
  runner-up. Keep the reservation ledger inside Dispatch for Ring 1.
- Before implementing the deadline logic, define the maximum follow-on
  planning horizon and the after-hours/weekend route for same-day bookings
  when no supervisor is working. Use the departure area's time zone for
  cutoff and calendar-day decisions.

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
- Dispatchers nominate previous-day loads through 4 p.m. and same-day loads
  throughout the day. The supervisor prioritizes previous-day nominations
  after 4 p.m.; next-morning loads booked after that cutoff receive direct
  supervisor Assignment from currently available capacity. Ordinary loads
  target final Assignment by the calendar day before pickup. Same-booking-day
  pickup follows an emergency path whose detailed policy remains open. A
  Reservation records editable planning state and claims the load and trio
  window, removes both from competing views for that window, and notifies the
  dispatcher without requiring approval. Final Assignment is a separate
  record linked to the exact Reservation revision.
- Follow-on nominations require the current load's BOL and in-progress
  status, plus dispatcher-verified next availability; the next pickup cannot
  be earlier. Keep the plan to the next availability window rather than
  scheduling months ahead. The trio is one stable driver/power-unit
  configuration with an optional single trailer. Home-base reconfiguration
  requires driver agreement and must be recorded before nomination.
- Readiness or requirement changes refresh the Reservation and may prompt
  the supervisor to close it; each closure requires a structured reason and
  dispatcher-verified status/next availability. Never infer availability
  from free text or claim closure. After final Assignment, reassess the
  requirements and remaining time. If the trio no longer fits before
  movement, confirm `no_start`, safely release it, seek replacement capacity,
  then outside capacity, and finally broker-led amendment/cancellation if
  needed. Preserve change time, trio status, execution milestone, release
  and next-available times, reposition/deadhead, and idle time. If movement
  has begun, use the Execution exception path rather than making capacity
  immediately available. Contractual claim entitlement remains a broker
  review, not a system decision.
- Persist assignment authority in Dispatch and operational facts/evidence in
  Execution. The assignment-to-execution handoff must be idempotent and make
  partial failure visible; a superseded unstarted execution must remain
  auditable and terminal as no-start.
- Keep dispatcher nominations non-reserving. At supervisor Reservation,
  atomically create a Dispatch-owned claim for the load and trio over a
  capacity-use window. Final Assignment links that Reservation revision
  while preserving the claim. Preserve the window while the execution
  handoff outcome is unknown; update its end from pickup milestones and
  verified next availability. A running execution may coexist with future
  claims only when their windows do not overlap. Closing/updating a claim
  does not establish driver rest, equipment serviceability, or general
  availability.
- Treat assignment timing as a business target, not an automatic lock
  timeout: ordinary loads target the calendar day before pickup; same-
  booking-day pickup follows a distinct emergency path. A client/UI/network error of
  unknown outcome is reconciled by stable request/assignment ID. Support
  staff repair technical state but do not create business approval; if an
  outage lasts past the assignment deadline, follow an explicit manual
  execution-notes contingency or have the broker cancel the load.
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
  handoff, a capacity-readiness challenge/recovery, and a correction of
  recorded information.
- Use explicit actor and authority checks for proposal, assignment, reporting,
  resolution, and correction.
- Keep customer-safe status separate from internal execution details.
- Make pending, rejected, failed, and completed outcomes distinguishable.
- Keep the detailed operational workflow as hypotheses and promote a rule
  into code only when the selected scenarios need it.
- Use tests to probe partial failure and to revise both the model and the
  service boundaries.
- Establish load, capacity, authority, and company-benefit structures before
  automating matching, ranking, or approval. Daily human nomination and
  supervisor preassignment are part of Ring 1; do not introduce automated
  matching, award ranking, one-click approval, or automatic assignment in
  this slice. First make candidate reasoning explainable; then test whether
  additional automation is useful and safe.

## Do not

- Build full brokerage/customer intake, negotiation, spot sourcing, or a load
  marketplace.
- Build automated matching, optimization, award ranking, automatic
  preassignment, or performance scoring in the first slice.
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
   dispatcher nomination does not reserve capacity; the supervisor creates
   an editable Reservation that atomically claims the load and trio window;
   the dispatcher is notified and may challenge without an approval step;
   the supervisor finalizes a separate Assignment linked to the exact
   Reservation revision; an execution is created; progress and selected
   delivery evidence are recorded; completion is visible with an audit
   history.
2. **Exception handoff:** a driver or carrier reports a movement issue; the
   execution records known facts; the accountable supervisor receives an
   actionable handoff; the broker can communicate only verified
   customer-relevant status; the issue is resolved or explicitly remains
   open.
3. **Readiness changes while reserved:** the dispatcher reports a trio
   change; the Reservation snapshot/history refreshes and becomes visible to
   the supervisor, who may keep, revise, finalize, or withdraw it with a
   reason. Withdrawal safely closes the claim, records verified component
   status/next availability, and returns the load to sourcing only when a
   viable replacement can meet timing.
4. **Capacity loss or changed requirements after Assignment:** before
   movement starts, a trio issue or customer change makes the assigned
   capacity unable or unsuitable. Record the revised requirements, execution
   milestone, and original trio status; terminalize the old execution as
   `no_start` before safely releasing its claim. Seek in-house replacement,
   then outside capacity, then broker-led amendment/cancellation if needed.
   Record the released trio's next availability, repositioning/deadhead, and
   idle time. If movement has started, use the Execution exception path
   instead of immediate release/requeue.
5. **Competing reservation claims:** concurrent requests attempt to claim
   the same load for different trios or overlapping capacity-use windows for
   the same trio; the first valid atomic transaction wins and the other
   receives a conflict with current claim/window data. Non-overlapping
   future windows for one trio may both be reserved. Final Assignment links
   the winning Reservation revision and preserves its active claim. Multiple
   nominations alone do not reserve capacity or cause a conflict.
6. **Customer change:** a requirement change refreshes an active Reservation
   and notifies the supervisor and dispatcher. After final Assignment,
   preserve requested/effective/recorded times, old and new requirements,
   affected trio, execution milestone, and the operational decision for
   broker review of possible customer-retention claims.
7. **Partial failure and replay:** a preassignment/assignment commits but
   notification delivery fails, or Execution is temporarily unavailable
   after final assignment; the system keeps the persisted claim authoritative,
   exposes pending delivery/handoff, retries or reconciles idempotently, and
   creates no duplicate execution or competing claim.
8. **Unassignment and status:** an authorized supervisor unassigns with a
   structured reason; dispatcher-verified next availability and component
   status are recorded. A load-side change does not mark healthy capacity
   out of service, and an unknown availability does not return it to
   candidate lists.
9. **Day-before responsibility:** an ordinary load approaching its
   assignment target receives a reason category, accountable next-action
   owner, and due time (for example, outer-fleet sourcing, supervisor
   decision backlog, dispatcher planning gap, or area-broker overbooking).
   The area broker retains commercial ownership.
10. **Correction:** an authorized person corrects a relevant recorded fact
    after completion; the original value and correction remain auditable, and
    the execution is not silently reopened.

The exact states, evidence source, initial capacity type, permissions, and
customer-visible fields are implementation decisions. Resolve them before
the first scenario depends on them, not by importing every rule in the broad
reference workflow.
