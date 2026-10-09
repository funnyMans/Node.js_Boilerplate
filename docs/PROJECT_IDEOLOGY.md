# TMS study principles

## What we are doing

This is a software-engineering study project. We are designing a realistic
Transportation Management System (TMS) for a trucking company whose owners
and operating model we define ourselves. We have no customer whose needs
dictate the product. That freedom is not permission to invent arbitrary
workflows: use real-world company practices, operating constraints, and
applicable law to build a coherent model, then challenge it with scenarios
and implementation evidence.

We are not claiming to operate a real carrier, provide legal advice, or have
a customer-validated or production-ready system. Record which statements are
researched facts, selected model decisions, hypotheses, implemented
behavior, and verified behavior.

## The company model

The initial model is a US trucking company with its own fleet and brokerage,
approximately 50–100 trucks, and four operating areas: LA (the home area),
West, Central, and East. Roles, authority, regional allocation, and capacity
are described in the [company vision](./trucking/VISION.md),
[responsibilities](./trucking/RESPONSIBILITIES.md), and
[operating workflow](./trucking/WORKFLOW.md). Numbers are modeling
assumptions, not legal or product constraints.

Combine patterns from real operating models only after naming their
assumptions and testing them against this company's scale, geography, and
responsibility structure. Prefer explicit policy and data over rigid
organizational structures that force an all-or-nothing redesign as the
company grows.

## Product direction

Start with the architecture and the information/authority structure. The
first vertical slice begins with a load ready for operations and covers
supervisor-authorized capacity assignment, execution updates, exception
handoff, and completion. See the
[first-slice charter](./trucking/MVP_START.md) and
[target architecture](./trucking/MVP_ARCHITECTURE.md).

Assignment is a deliberate human decision in the initial model. Drivers and
dispatchers can express priorities; the accountable supervisor considers
those preferences alongside company benefit for that load. The system should
make this work easier and more consistent, not hide the decision logic.
Define the data and policy before implementing matching, ranking, one-click
approval, capacity removal from other candidates, preassignment, or
automatic assignment. Add automation incrementally when its recommendations
are explainable, safe, and measurably useful.

## Engineering principles

1. **Business correctness and legal boundaries.** Model who owns each
   decision, what facts support it, and which legal or contractual source
   constrains it. Do not encode legal calculations from unverified
   assumptions; identify authoritative references and seek qualified review
   where needed.
2. **Explicit ownership.** Load, Dispatch, and Execution each own their
   records and invariants. No service reads or writes another service's
   tables directly. Keep identity, authorization, capacity eligibility, and
   operational evidence distinct.
3. **Human authority before automation.** Preserve the accountable person's
   decision and its rationale. Recommendations must not silently become
   assignments. Automation requires defined inputs, constraints, outcomes,
   override paths, and evaluation evidence.
4. **Visible partial failure.** Cross-service work can fail after one side
   commits. Make pending, failed, retried, and completed outcomes explicit;
   use idempotency and reconciliation instead of success-shaped fallbacks or
   distributed transactions.
5. **Auditable operational history.** Preserve who reported, changed,
   authorized, or corrected a fact, when, and on what basis. Do not erase
   original operational evidence to make a corrected record look as if it
   was always true.
6. **Least privilege and data minimization.** Access follows role grants and
   area scope. Customer-visible status is a deliberate projection, not an
   unrestricted view into execution data. Keep credentials, personal data,
   and commercial information out of logs unless a protected need is clear.
7. **Grow from evidence.** Build the smallest end-to-end behavior that tests
   the model. Measure workflow and system behavior before adding services,
   queues, caches, optimization, or scaling mechanisms.

## Architecture

The selected initial domain boundaries are separate Load, Dispatch, and
Execution services. This makes their different sources of truth and decision
authority explicit, while accepting the additional network and operational
cost. Do not split further without evidence.

Use TypeScript, Fastify, PostgreSQL/Prisma, and shared runtime helpers where
they support these boundaries. Frameworks and persistence belong at the
service edges; domain rules should remain testable without a live database
or HTTP server. Share stable technical contracts, not business policy.

Prefer a direct request where the caller needs an immediate decision and
availability coupling is acceptable. Use a durable asynchronous handoff only
when the workflow needs independent retry or delivery. Select the transport
after its required consistency, recovery, and operational behavior is
defined; existing dependencies are not a reason by themselves to adopt it.

## Validation and learning

For each substantial decision, record:

- The operating problem and the actor who owns it.
- The current model, evidence/source, and assumptions.
- Alternatives considered and why they were not selected.
- Normal, exception, duplicate, delayed, and correction scenarios as
  applicable.
- What test or measurement could disprove the decision.

Update the model when a real-world constraint, applicable law, or test shows
that an assumption is wrong. Keep the target architecture separate from
implementation status. A successful local build or test proves only the
behavior it exercises.

## Explicit exclusions until justified

Do not build full brokerage intake, legal/HOS calculation, fleet maintenance,
billing/settlement, broad external portals, analytics, a customer-specific
integration suite, or autonomous load optimization as part of the first
slice. They may be considered later as TMS capabilities when a modeled
workflow and its owner require them.
