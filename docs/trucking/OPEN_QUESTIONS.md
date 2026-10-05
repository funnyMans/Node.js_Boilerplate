# Questions for implementation

The business vision is ready to guide an initial design. These questions
need answers when choosing and implementing the first real workflow; they do
not block the current discussion.

## Resolve for the first end-to-end workflow

1. What range between device-confirmed arrival and the paperwork's pickup or
   delivery time counts as a small discrepancy versus an issue to investigate?
2. What interval requires dispatcher follow-up if a supervisor does not
   acknowledge an incident notification?
3. Who may raise a safety/serviceability hold, who can stop work, and who can
   clear a hold? A driver must be able to report unsafe conditions directly.
4. For real operations, which legal entity and agreement applies to each
   capacity type, and what contractor direction is permitted? Validate with
   qualified counsel.
5. What correction/audit mechanism should preserve post-POD load updates
   without making the closed execution editable?

## Decide only when the related workflow is in scope

- Research the load-specific legal, safety, equipment, freight, route, and
  driver-qualification requirements; make matching apply relevant checks and
  exclude non-applicable ones.
- Exact rules for when a long-term broker shortage begins and ends, and how
  to prioritize homebound trips while new bookings are restricted.
- How many trips to retain and how far ahead to shorten planning during a
  prolonged broker/supervisor shortage.
- Weekday/weekend dispatcher scheduling to meet the 7-on-duty target; this
  remains a company staffing decision, not a dispatch-system rule.
- Broker territory exceptions, the exact West two-thirds return trigger, and
  when the return-focused broker stops sourcing.
- Regional decision windows, contractor-quality notices/review, and
  customer-specific cancellation terms.
- The measurement basis/time window for the provisional 10%-50% area coverage
  guardrail.
- Detailed LTL, split-load, or partner-terminal workflows.
- Any later choice of one application versus role-focused applications or
  API access.

Analytics, forecasts, scorecards, secondary data use, data retention,
department systems, and broad integrations are not open requirements for the
current work-platform vision.
