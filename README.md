# Trucking Transportation Management System

This repository is a **software-engineering study project**: we are
designing and building a realistic Transportation Management System (TMS)
for a trucking company that we define ourselves. We are the owners of the
model, not a customer proxy. We use real-world operating practices and legal
constraints to challenge our assumptions, combine useful patterns into a
coherent model, and learn by implementing and testing it. This is not a
customer-validated or production-ready business system.

The company model is a US trucking operation with its own fleet and
brokerage, initially sized around 50–100 trucks. Its working areas are LA
(the home area), West, Central, and East. The scale and organization are
design inputs, not product limits. We aim for a model that can grow without
locking us into hard structures that require wholesale redesign; any
organizational or legal assumption must be examined against real operations
and applicable law.

## Start here

1. [TMS vision and company model](docs/trucking/VISION.md) — what we are
   studying, the defined company, and product boundary.
2. [Roles and authority](docs/trucking/RESPONSIBILITIES.md) — the operating
   roles, area accountability, and decision rights.
3. [Operating workflow](docs/trucking/WORKFLOW.md) — the target load,
   assignment, execution, and capacity model, including later automation.
4. [System vision and capability rings](docs/trucking/SYSTEM_VISION.md) —
   business destination, technical topology, and staged capability layers
   through a production-candidate pilot.
5. [Core workflow, contracts, and logical schema](docs/trucking/CORE_WORKFLOW.md) —
   ordered business transitions, service interactions, conceptual ownership,
   and failure/notification behavior.
6. [TMS architecture](docs/trucking/MVP_ARCHITECTURE.md) — Load, Dispatch,
   and Execution ownership and service relationships.
7. [First-slice charter](docs/trucking/MVP_START.md) — the ready-load
   coordination workflow, acceptance scenarios, and deliberate exclusions.
8. [Decisions and open questions](docs/trucking/OPEN_QUESTIONS.md) — what to
   resolve when implementation reaches it.
9. [Development roadmap](docs/README_NEXT_STEPS.md) — modeling gates and the
   sequence from cleanup to later automation.
10. [Architecture principles](docs/PROJECT_IDEOLOGY.md) and
    [monorepo conventions](docs/monorepo.md).
11. [Local development infrastructure](infra/README.md) and
    [HTTP service contracts](docs/SERVICE_CONTRACT.md).

## Current state

The architecture and company operating model are being established before
the TMS product services are built. The retained code is limited to the
shared Node.js runtime, API gateway, account/profile and authentication
foundation, database and local developer tooling that can serve the TMS.
The Load, Dispatch, and Execution services are the planned domain core; they
are not yet implemented.

Do not treat a configured component, passing local check, scenario, or
company hypothesis as evidence of customer fit, compliance, or production
readiness. The system should become more realistic through explicit
decisions, source-backed assumptions, executable scenarios, and measured
behavior—not through infrastructure or automation added speculatively.

## Development

Requirements: Node.js version from [`.nvmrc`](.nvmrc), pnpm from the
`packageManager` field, and Docker Compose for local PostgreSQL and
observability services.

```sh
cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test:unit
docker compose -f infra/docker-compose.dev.yml config --quiet
```

Local infrastructure instructions and current Compose scope are documented
in [`infra/README.md`](infra/README.md). The development stack is for local
engineering, not deployment.

## Scope discipline

The first product workflow starts from a transportation commitment already
ready for operations and covers authorized capacity assignment, execution
progress, exception handoff, and completion. The operating model also
defines a later assignment approach: driver and dispatcher priorities inform
candidate ranking; the accountable supervisor weighs those preferences
against company benefit and authorizes the decision. Matching, one-click
approval, removing assigned capacity from competing candidates, and eventual
preassignment or automatic assignment are later stages, after the concepts,
authority, and evaluation criteria are explicit.

Customer booking, automated optimization, HOS/legal calculation, broad
carrier/customer portals, billing, and settlement are not part of the first
workflow. They remain possible later TMS capabilities only where business
practice, law, and a tested workflow justify them.

This project is available under the [MIT License](LICENSE).
