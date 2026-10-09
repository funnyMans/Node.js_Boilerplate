# TMS MVP and trucking work model

This section defines the product starting point for a self-directed TMS MVP
and records the working business hypotheses behind it. There is no real
customer requirement or validated company model. Use real-world trucking as
input, then test and revise the model through implementation. The initial
product slice is bounded; it is not a plan to build a complete TMS at once.

Start with these product documents:

1. [First-slice charter](./MVP_START.md): what, when, where, why, how, what
   to do, and what not to do.
2. [Target architecture](./MVP_ARCHITECTURE.md): the selected Load, Dispatch,
   and Execution service boundaries and their relationships.
3. [Vision and boundaries](./VISION.md): the product purpose, company model,
   and scope exclusions.

The broader domain references remain useful, but are hypotheses rather than
implementation requirements:

1. [Actors and authority](./RESPONSIBILITIES.md): illustrative roles,
   decision rights, and handoffs.
2. [Load workflow](./WORKFLOW.md): the broader sourcing and execution model,
   including details deliberately deferred from the first slice.
3. [Questions for later](./OPEN_QUESTIONS.md): decisions to resolve when the
   first workflow actually depends on them.

The example assumes a small US trucking company with its own fleet and
brokerage. It is not universal industry practice or legal advice. Validate
employment, carrier, brokerage, and safety rules before any real operational
use.
