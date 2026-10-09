# TMS study vision and company model

## Purpose

Study how to design and build a realistic trucking TMS by modeling a
company's work, responsibilities, decisions, and constraints in software.
We define the company and own the model; there is no real customer whose
requirements we are fulfilling. Use real-world practice and applicable law
to inform the model, state assumptions, and revise them through research,
scenario testing, and implementation. This is a learning system, not a
production business product.

The first product loop begins with transportation work already ready for
operations: an accountable supervisor authorizes capacity, a driver or
carrier reports progress, operational exceptions reach the responsible
people, and completion is recorded. Commercial booking and full carrier
sourcing are outside this first slice.

## Reference company

Use a US trucking company with its own fleet and brokerage. Model an initial
fleet of approximately 50–100 trucks and the people needed to operate it:
transportation leadership, brokers, area supervisors, shared fleet
dispatchers, drivers, and appropriate contract-capacity roles. These are
design inputs, not product limits.

The working geography has four areas: LA (the company's home area), West,
Central, and East. Preserve area ownership and cross-area coordination in
the model without assuming that every employee belongs to exactly one
permanent unit. A chief supervisor also serves as LA-area supervisor; other
area supervisors retain accountability for their own departures and report
through the chief.

This model is one plausible organization, not a universal industry standard.
Real carrier, broker, worker, and customer relationships depend on actual
contracts and law. Validate them with qualified professionals before
operational use.

## First product slice

Implement one end-to-end coordination slice:

- Begin with a transportation commitment that is ready for operations; it
  does not include the full customer-booking or carrier-sourcing process.
- Identify its accountable departure-area supervisor and record one
  supervisor-authorized capacity assignment.
- Allow drivers and dispatchers to express priorities as decision inputs;
  preserve the supervisor's authority to weigh those preferences against
  company benefit for the specific load.
- Record essential progress and delivery evidence, with a clear route for an
  exception to reach the people responsible for acting on it.
- Let the broker communicate verified, customer-relevant status without
  exposing internal execution details.
- Complete the work with an auditable history and an explicit correction path.

This is an internally selected learning/product boundary, not a claim of
customer validation. See the [first-slice charter](./MVP_START.md) for its
start conditions and acceptance scenarios.

## Outside that initial slice

The broad operating model includes topics that are deliberately not
requirements for the first product slice:

- Full brokerage intake, customer/spot-carrier negotiation, or a load
  marketplace.
- Automated matching, preassignment stages, award-based priority, and
  performance scoring in the first slice. Define their inputs and decision
  policy first; evaluate recommendation/ranking before approval or automatic
  assignment.
- Workforce scheduling and absence planning; legal HOS calculations;
  equipment maintenance; billing, settlement, or insurance workflows.
- Complete customer, carrier, CRM, ERP, or TMS functionality; broad
  integrations, analytics, forecasting, and data reuse.
- Additional service splits beyond Load, Dispatch, and Execution; a specific
  user-interface arrangement or event broker.

The operating rules for deferred subjects remain parts of the evolving TMS
company model, not first-slice software requirements. Add a capability only
when its workflow, owner, constraints, failure behavior, and value are
understood.
