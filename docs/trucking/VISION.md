# Reference vision and product boundary

## Purpose

Use a realistic trucking operation to reason about how a backend can support
clear ownership, authorized decisions, durable work handoffs, and recovery
from partial failures. The project itself is a reusable backend foundation;
this business model is a learning and design reference, not a commitment to
build a company-wide application.

The reference operation's central loop is intentionally simple to state:
transportation work is accepted for service, suitable capacity is assigned,
the driver or carrier reports progress, operational exceptions reach an
accountable person, and completion is recorded. A broker communicates
verified customer-facing updates while a supervisor retains operational
accountability.

## Reference company

Use a US trucking company with its own fleet and brokerage as the example:
roughly 50–100 trucks, drivers, brokers, dispatchers, area supervisors, and
transportation leadership. The numbers are illustrative, not product limits.
The working geography is LA, West, Central, and East; LA is its own area.

The example should include the people who participate in this loop. That
does not mean combining every company department or every logistics
responsibility into one product. The working geography is LA, West, Central,
and East; LA is treated as the company's home area.

This model is one plausible organization, not a universal industry standard.
Real carrier, broker, worker, and customer relationships depend on actual
contracts and law. Validate them with qualified professionals before
operational use.

## Candidate first product slice

If this domain is implemented, start with one end-to-end coordination slice:

- Begin with a transportation commitment that is ready for operations; it
  need not include the full customer-booking or carrier-sourcing process.
- Identify its accountable supervisor and record one authorized capacity
  assignment.
- Record essential progress and delivery evidence, with a clear route for an
  exception to reach the people responsible for acting on it.
- Let the broker communicate verified, customer-relevant status without
  exposing internal execution details.
- Complete the work with an auditable history and an explicit correction path.

This is a candidate boundary for future discovery, not an approved
implementation plan. First validate that real users need it and that the
repository is the right place to build it.

## Outside that initial slice

The broad operating model includes topics that are deliberately not
requirements for the first product slice:

- Full brokerage intake, customer/spot-carrier negotiation, or a load
  marketplace.
- Automated matching, preassignment stages, award-based priority, and
  performance scoring.
- Workforce scheduling and absence planning; legal HOS calculations;
  equipment maintenance; billing, settlement, or insurance workflows.
- Complete customer, carrier, CRM, ERP, or TMS functionality; broad
  integrations, analytics, forecasting, and data reuse.
- A particular deployment topology, microservice split, user-interface
  arrangement, or event broker.

The operating rules for these subjects are useful discussion material, not
software requirements. Add a capability only when a specific workflow needs
it and its owner, failure behavior, and value are understood.
