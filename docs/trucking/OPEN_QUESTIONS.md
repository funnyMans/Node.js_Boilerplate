# Decisions for the first implementation slice

The first product slice is selected: start with a commitment already ready
for operations, then coordinate authorized assignment, execution, exception
handoff, and completion. These questions are gates only when the
implementation depends on their answers; do not expand scope to settle
unrelated details. See the [first-slice charter](./MVP_START.md) for the
boundary and acceptance scenarios.

## Resolve when the first slice needs the answer

1. **Boundary and source of truth:** Where does the product begin and end?
   Which system owns the load, assignment, execution state, and customer
   communication when other company systems are involved?
2. **Authority and access:** Which people need accounts, what can each role
   view or change, and who is accountable when the normal owner is
   unavailable?
3. **Exception handoff:** Which person records the initial facts, who must
   acknowledge and decide, and how is an unacknowledged or cross-area issue
   escalated? The exact response depends on the incident; this model defines
   ownership, not a universal playbook.
4. **Evidence and corrections:** Which signals establish operational
   milestones, how are stale, missing, or conflicting updates handled, and
   how can an authorized person correct a closed record without erasing its
   history?
5. **Safe eligibility:** Which authoritative source can confirm that the
   driver, equipment, and load are eligible for the proposed movement? The
   first slice should consume verified eligibility rather than inventing a
   complete legal or HOS rules engine.

## Park until a specific feature needs them

- Brokerage booking, customer and spot-carrier negotiation, managed-carrier
  contracts and compensation, carrier onboarding, and rate-change policy.
- Automated matching, regional sourcing strategies, preassignment windows,
  driver preferences, award rankings, scoring formulas, and reward amounts.
- Staffing rosters, planned-absence coverage, area-presence targets, and
  prolonged business-continuity policies.
- Detailed safety and incident playbooks, load-specific legal requirements,
  HOS calculations, equipment maintenance, complex freight, and
  customer-specific cancellation rules.
- Settlement, billing, analytics, forecasting, broad integrations, data
  retention, and full CRM/ERP/TMS capabilities.

These topics remain in the workflow document as hypotheses about how the
example company might operate. They are not commitments to build software
for every described rule. Add implementation detail only when discovery
shows that the chosen workflow depends on it.
