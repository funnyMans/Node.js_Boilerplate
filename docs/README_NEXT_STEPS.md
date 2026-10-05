# Roadmap: strengthening the current foundation

This roadmap covers the existing implementation; it is not a complete product
backlog or a deployment plan. Read it alongside
[`PROJECT_IDEOLOGY.md`](./PROJECT_IDEOLOGY.md), which defines the longer-term
direction and the questions that still need evidence. Do not add services just
to make the stack larger. Each phase should leave behind a readable
explanation, repeatable evidence, and a clear statement of what has and has
not been verified.

## Current focus — improve the existing baseline

Work through the application-quality roadmap below: prefer changes that
improve type safety, clarify boundaries, strengthen tests, or make everyday
development more predictable. Continue using the order journey and local
observability as the system-level regression check when a change affects
them. New product capabilities and deployment choices should follow explicit
domain and operational decisions rather than assumptions.

The operational failure drills in Phase 5 remain useful follow-up work, but
they do not block this application-quality track. Kubernetes, GraphQL/Apollo
Federation, RabbitMQ, AI agents, and deployment are not requirements of this
roadmap; revisit them only when a defined need justifies their trade-offs.

## Application code and developer-experience roadmap

This track complements the system-operation phases above; it does not propose
a rewrite or a more elaborate architecture for its own sake. The repo already
has strict TypeScript, shared runtime/bootstrap helpers, Zod validation at
several HTTP boundaries, unit and integration tests, a full local order
journey, and architecture documentation. The goal is to understand and improve
the seams that remain inconsistent.

### Current assessment

- **Not a production product by design:** payments and inventory use local
  implementations, Moto is in-memory, and the normal development stack is not
  a deployment target. These are deliberate learning boundaries, not missing
  launch blockers.
- **NATS delivery now has a broker-acknowledged publisher path:** the orders
  outbox publishes to a file-backed JetStream stream and waits for a publish
  acknowledgement; event IDs deduplicate retries within a bounded window.
  There is still no application NATS consumer, so no consumer-processing
  acknowledgement or end-to-end event side effect is claimed.
- **The explicit-`any` lint rule is now enforced:** initial cleanup replaced
  broad types and casts in shared infrastructure, Prisma mapping, and test
  doubles with narrower contracts. Further type-safety work should focus on
  boundary validation and unsafe assertions rather than merely satisfying a
  lint rule.
- **Service layering is uneven:** `users` and `auth-service` have explicit
  domain, application, adapter, and HTTP boundaries, while `inventory` and
  `payments` use thinner application and infrastructure structures. That can
  be appropriate for simpler domains, but the conventions and trade-offs
  should be explicit rather than accidental.
- **Contracts are mostly compile-time types:** `packages/contracts` exports
  TypeScript types, while services define runtime Zod schemas at their
  boundaries. This means type sharing alone does not validate data crossing
  HTTP or event boundaries.
- **Package-level commands are inconsistent:** several workspaces have no
  `test` script even though root Vitest commands find their tests, and the
  users start output path differs from the other HTTP services. Root-level
  commands work today; improve per-package ergonomics without breaking them.
- **Documentation must distinguish configured behavior from dated evidence:**
  the live stack is intentionally not recreated for every configuration
  change, so current Compose files and historical runtime checks can differ.
  Keep those states explicit instead of presenting an old run as current
  verification.

### Track 1 — reconcile the engineering baseline

**Goal:** make the actual code and the learning materials agree before
refactoring. Resolve stale statements, list the current conventions and their
exceptions, and capture the clean-worktree commands used for build, lint,
unit/integration tests, and the opt-in order journey.

**Done when:** the walkthrough, operations guide, roadmap, and scripts give a
consistent account of current behavior; intentional differences between
services are called out; no implementation claim is presented as verified
without evidence.

### Track 2 — make shared infrastructure type-safe

**Goal:** remove avoidable `any` and unsafe casts from shared helpers and
adapters, starting with the narrowest reusable APIs. Inspect actual callers
first: type NATS subscriptions against the installed NATS API, decide whether
the BullMQ helper is part of the supported local design, replace broad
Temporal health inputs with a clear contract, and use generated Prisma types
where possible.

**Progress:** ESLint now rejects explicit `any` across the workspace. The
first cleanup typed NATS subscriptions, health probes, BullMQ factories, and
Prisma session persistence. BullMQ factories now pass URL-based connection
options accepted by BullMQ, and workers default
`maxRetriesPerRequest` to `null`; focused factory tests cover those options.
Health caches are isolated by dependency client or Temporal address, Temporal
client health checks call `ensureConnected()`, and NATS health uses explicit
closed/draining state. Core NATS subscriptions no longer imply JetStream
acknowledgement; failed handlers unsubscribe and log the failure.

**Done when:** shared public APIs express their supported inputs and outcomes
in types; unit tests cover success, unavailable dependencies, and cleanup
behavior; no runtime behavior was silently changed to satisfy the compiler.

### Track 3 — make boundary contracts explicit

**Goal:** follow one HTTP request and one event across service boundaries.
Choose where runtime schemas live, avoid duplicating definitions without a
reason, and make versioning and validation behavior clear for events as well
as HTTP. Keep HTTP DTOs, domain models, and persistence records distinct where
their responsibilities differ.

**Progress:** the shared event registry now ties each supported event name to
its payload type, and the event factory preserves that literal event name.
This catches event/payload mismatches at compile time. The package README now
states clearly that TypeScript types do not validate untrusted runtime data;
receiver-side parsing remains follow-up work.

The first API-gateway boundary hardening validates successful auth-service
session responses at runtime (including the role and expiration timestamp)
instead of trusting a TypeScript cast. Session validation requests now have a
five-second timeout; malformed responses and transport failures continue to
surface to the gateway guard as auth-service unavailability. User IDs in
gateway profile routes are also encoded as single path segments before being
forwarded downstream. The auth-service users client likewise validates
successful user-creation and lifecycle responses against their expected
shapes, reuses the shared user-status registry, and applies a five-second
timeout to both users-service calls. In the `users` service, profile updates
now map only the explicit user-not-found application error to HTTP 404;
unexpected repository failures propagate to Fastify's error handling instead
of being misreported as missing users.
The `inventory` HTTP boundary now maps explicit inventory conflict/not-found
errors and logs unexpected failures while returning a generic 500 response,
instead of classifying errors by message substrings or exposing arbitrary
repository error messages to callers.
The `orders` Temporal activities now classify malformed JSON from a successful
downstream response as a non-retryable contract failure, while preserving
retryability for response-body transport/read errors and transient HTTP
statuses.
The `payments` HTTP boundary now logs unexpected adapter/provider failures and
returns a generic internal error instead of exposing raw exception messages;
known `PaymentServiceError` responses retain their explicit status and code.
The opt-in orders journey now parses login sessions, order responses, outbox
snapshots, and NATS events against runtime schemas, using shared role, order
status, and event-name registries where available. This makes the integrated
journey fail directly on contract drift rather than trusting test-only casts.

### Shared application utilities — progress

`packages/common/src/env.ts` now validates the complete Zod configuration
object in one pass. Startup diagnostics report all invalid keys together,
schema defaults continue to apply, and values are not echoed in error output.

### Local infrastructure — progress

All 13 published ports in the documented development Compose stack now bind
to `127.0.0.1`, including the E2E overlay. The services remain reachable from
each other over the Compose network; the host mappings are for local developer
tools and browser access. The legacy `infra/docker-compose.yml` is documented
as incomplete and is not part of the supported application stack.

**Done when:** malformed external data is rejected at the receiving boundary;
cross-service request/event shapes have focused tests; event compatibility
rules are documented; errors remain actionable without leaking credentials
or sensitive payloads.

### Track 4 — standardize architecture deliberately

**Goal:** decide which patterns are worth keeping in each service. Use the
more explicit `users` or `auth-service` structure as a teaching example, not
as a mandate to copy every folder into every small service. Clarify when a
service needs a domain model, use case, repository port, or mapper, and keep
simple orchestration simple.

**Done when:** each service has an understandable request-to-persistence
flow; application logic can be tested without a live database where useful;
folders represent meaningful boundaries rather than empty ceremony; targeted
refactors preserve the external contract and pass regression tests.

### Track 5 — improve package-level DX and test confidence

**Goal:** make the same basic workflows discoverable and predictable across
workspaces. Align package scripts and build/start entrypoints, document which
tests need infrastructure, and measure test gaps by behavior (not by chasing
an arbitrary coverage percentage). Keep root commands as the supported
workspace interface.

**Done when:** a contributor can find and run a service's build, lint, and
relevant tests consistently; the clean build does not depend on stale
generated output; changed behavior has focused tests plus the appropriate
integration check. Decide separately whether and when to resume automatic CI
for `dev`; its pause is an explicit workflow setting, not a code-quality fix.

### Track 6 — practice failure and recovery on the proven design

After the preceding changes, resume the existing Phase 5 drills: induce one
bounded local dependency or delivery failure at a time, observe retries and
signals, restore the dependency, and verify recovery. Do not add infrastructure
or production integrations merely to create a more complicated exercise.

## Phase 1 — Make the current setup the source of truth

**Goal:** accurately document the Compose stack, its dependencies, health
semantics, ports, monitoring coverage, and one-shot jobs.

**Current work:** documentation has been aligned with the checked Compose
configuration. The local operations guide documents individual image builds
followed by `up --no-build`, configured health checks, trace-export targets,
and the distinction between a successful init job and a healthy long-running
service. Architecture notes and Mermaid sources now label implemented local
components separately from optional future choices.

**Verified:** on 2026-09-29 the gateway and its declared dependency set were
started with `docker compose ... up -d --no-build --wait api-gateway`. Compose
reported the gateway and its health-checked dependencies healthy; the S3 init
job exited successfully. That specific check did not start the full
development stack (Dagster, Nginx, Prometheus, Grafana, or OTel collector).
Later dated checks exercised the full E2E stack; the current Compose health
coverage is listed in [`infra/README.md`](../infra/README.md).

**Current status:** the local Compose configuration, operations guide,
architecture maps, and tool boundaries have been reconciled for the current
known workflows. The main full stack and order journey have historical live
verification; recent configuration changes were validated without recreating
active containers and must not be described as active runtime behavior yet.
Compose now defines health checks for Temporal, Nginx, Prometheus, Grafana,
and the OTel collector. Tempo remains without a native Compose health check.
The Moto S3 probe uses `ListBuckets`, which proves API response only; bucket
and seed presence belong to the separate init job. Clean-worktree validation
commands and evidence remain part of the broader engineering-baseline track.

## Phase 2 — Prove a critical journey end to end

**Goal:** make the order flow a repeatable integration scenario from client to
persisted and delivered effects.

Trace one request through gateway authentication, orders persistence, the
transactional outbox, NATS, Temporal, payment and inventory activities, and
the raw S3 export. Record the expected database rows, event/workflow state,
response, and logs/traces for success and failure cases. The opt-in
`pnpm docker:order-journey` check covers authentication rejection, successful
payment/inventory confirmation, NATS publication, raw export, Temporal
dispatch, and the inventory-unavailable/refund/cancel compensation path. It
uses a separate Compose override with a deterministic local fake Stripe
adapter; the normal development configuration does not enable that adapter.

**Verified 2026-09-29:** the live journey passed with one test. The successful
order was charged, reserved, and confirmed; the insufficient-inventory order
completed its workflow after refund and cancellation. The test also verified
unauthenticated rejection, matching correlation/event IDs, outbox delivery
timestamps, raw JSONL content in Moto, and both Temporal terminal states.
`docker:e2e-up` reused existing images after rebuilding only the payments
image; it did not build the full stack together.

**Phase status:** complete for the local success and compensation paths. Real
Stripe behavior and transient dependency outage/retry behavior remain
unverified.

**Done when:** a focused automated test or concise operator procedure can
prove the flow, exercise a business failure, show compensation behavior, and
locate the failure stage. The repeatable journey now covers the authenticated
success path through payment charge, inventory reservation, and confirmation,
plus insufficient inventory through refund and cancellation. Transient
dependency outage/retry behavior and real Stripe provider behavior remain
separate verification work.

## Phase 3 — Extend traceability across asynchronous work

**Goal:** preserve one W3C trace across the HTTP request, durable outbox, and
each asynchronous delivery stage while keeping correlation IDs as the
business-level join key.

**Implemented:** the orders request's `traceparent`/`tracestate` carrier is
stored with the transactional outbox event. NATS publication injects those
headers, raw S3 export and Temporal workflow start create spans, workflow
input carries the Temporal start context, and workflow activities create
spans and pass context to payments/inventory. Baggage is intentionally
excluded from durable storage and NATS headers. The E2E journey now checks
that the stored trace ID matches its caller-supplied ID and that NATS
publication is a child span.

**Verified 2026-09-29:** common, common-infrastructure, and orders
TypeScript builds passed; focused trace, orders-route, activity, metrics, and
NATS tests passed (11 passed). All six HTTP service images were rebuilt
sequentially, the full E2E Compose stack was recreated with `--no-build
--wait`, the migration applied, all configured health checks passed, and the
one-shot S3 init exited `0`. The six-service contract probe and live
success/compensation order journey passed. The journey verified that the
outbox trace ID matched its caller-supplied trace ID, the NATS publish used a
child span ID, and the same trace IDs appeared in orders, payments, and
inventory logs. Prometheus reported all six application targets up and loaded
the NATS, workflow-start, and raw-export terminal alerts.

**Remaining limits:** this repository has no application NATS consumer; the
journey subscribes only to inspect headers. Tempo and Grafana are now
configured in the local stack for trace storage and search, but the current CI
journey does not verify trace search or retention. A controlled dependency
fault remains for the later failure-drill phase.

**Phase status:** complete for trace context persistence and propagation
through the exercised local order journey. NATS consumer-side continuation is
not in scope because there is no application consumer. Trace search is
configured locally but is not yet covered by automated verification.

## Phase 4 — Add measured recovery and data-lifecycle safeguards

**Goal:** establish safe foundations for local secrets, process recovery,
bounded retries, operator requeue, shutdown, and retention before inducing a
failure.

**Implemented; local lifecycle and outbox behavior verified:** Compose
credentials and tokens can be overridden through `.env`; production-mode
config rejects the known local service/auth tokens. The six HTTP containers use
`restart: unless-stopped` and a 40-second stop grace period. NATS, raw-export,
and Temporal-dispatch outbox stages cap their delivery attempts at 10 with
backoff; Temporal workflow activities retain Temporal's separate retry
policy. Exhausted workflow/raw-export stages have terminal timestamps,
metrics, and alerts. Outbox retention is opt-in (`OUTBOX_RETENTION_DAYS=0`
disables it) and only removes rows after NATS, Temporal start, and raw export
are complete. The migration, explicit local development-mode wiring, terminal
alert rules, and running retention default (`0`) were verified; retention
remains disabled. Production-mode secret rejection is implemented but was not
runtime-tested in this Compose verification, so this phase's secret/config
guardrail verification is still partial.

Postgres, Redis, NATS, and Temporal also have explicit restart policies and
graceful stop periods. These recover a process after an unexpected exit; they
do not re-run Compose dependency ordering or restore application readiness.
Moto deliberately has no automatic restart policy because its in-memory
objects would disappear on restart; reseeding remains a separate operator
action.

**Verified 2026-09-30:** a bounded drill used one existing completed order.
The expired-lock paths marked its workflow-start and raw-export stages
terminal after 10 attempts; their metrics reached `1`, and both Prometheus
alerts reached `firing`. The documented one-row requeue statements restarted
only those stages; they completed, cleared their terminal timestamps/gauges,
and did not alter the NATS state. A separate simulated exhausted NATS publish
reached `FAILED`, raised its gauge and alert to `firing`, and the documented
NATS requeue republished the event with its W3C trace header and cleared the
gauge. These were controlled database-state drills, not dependency outages.

The retention sweep was tested with one disposable completed row dated more
than 10 years ago while runtime retention was temporarily set to 3650 days.
The row was pruned and logged; the normal runtime value was restored to `0`,
and no other outbox row was eligible. The current bounded verification also
confirmed that all three terminal alerts returned to `inactive` after recovery.
The disposable row remains deleted. The drill confirms eligibility and the
sweep path, but did not stress-test a 500-row batch. Attempt counters were
placed at the configured limit to exercise terminal transitions; this did not
run ten real dependency failures or measure the full backoff schedule.

**Verified 2026-09-30:** all six HTTP services exited `0` on SIGTERM with
`OOMKilled=false`. The users image previously launched a stale entrypoint
without the shared shutdown handler; the build now clears `dist` and all
launch paths point to `dist/src/server.js`. The same live drill exposed an
orders startup race: a signal during Temporal workflow-bundle compilation
could request worker shutdown before `Worker.run()`, leaving the connection
held until Docker killed the process with exit `137`. The worker now starts
its run loop before honoring shutdown in that race. A focused regression test
failed before the fix and passed afterward; the rebuilt orders container
logged `STOPPED` and shutdown completion and exited `0`. The orders container
was restarted, the full stack recovered healthy, and both the service-contract
probe and order journey passed again. Changing Compose Postgres credentials
does not rotate the user or password in an initialized named volume.
Retention does not delete raw objects or Temporal history.

**Done when:** terminal recovery/requeue and retention eligibility are
verified, all six HTTP processes stop within the configured window, and local
secrets/config behavior is validated without claiming production secret
management.

## Phase 5 — Run controlled failure and recovery drills

Only after Phases 3 and 4 are verified, make one dependency or delivery stage
unavailable at a time. Record readiness behavior, retry/backoff, terminal
state, Prometheus alert transitions, logs, and trace/correlation IDs; restore
the dependency and prove recovery. Start with reversible local faults (for
example, temporarily blocking the raw-export endpoint or stopping one
dependency), preserve named volumes, and restore the service before testing a
different failure.

**Done when:** each drill has a bounded procedure, an expected signal at each
layer, an observed result, and a documented recovery action. Do not use
unbounded outages or volume deletion as a fault-injection shortcut.

## Phase 6 — Automate the proven checks

After the local procedures are stable, put Compose validation, focused tests,
builds, service-contract probes, and the order journey into staged CI checks.
Keep memory-heavy image builds sequential or otherwise explicitly resource
bounded, and report the failing service/stage rather than only a generic job
failure.

**First CI slice added:** `.github/workflows/ci.yml` runs on pushes to `main`,
pull requests, and manual dispatch. It installs from the frozen pnpm lockfile,
checks workflow formatting, builds the workspace, then runs lint and unit
tests. Building first also generates the workspace declarations and Prisma
clients required by lint's import resolver on a clean runner. The build gets a
CI-only placeholder `DATABASE_URL` so Prisma configuration and client
generation work without a running database; the build does not connect to it.
A separate lightweight job validates the development and E2E Compose
configurations without building images or starting containers. This is the
initial gate, not proof that the live service contracts or order journey pass
on a clean CI runner. A dedicated Python 3.12 job installs the ETL requirements
and runs the ETL unit tests independently.

**Integration stage added:** a dependent job builds the six HTTP images and
the shared ETL image in separate sequential steps, starts the gateway and its
Compose dependency graph with `--no-build --wait`, runs the six-service
contract probe, seeds the E2E S3 mock, and runs the authenticated order
journey. It collects Compose logs after a failed step and always attempts
stack teardown. It waits for the lint/build, Compose-validation, and ETL jobs
to complete first so this memory-intensive stage does not overlap them.

**Verified 2026-09-30:** the initial hosted integration attempts caught and
fixed two clean-build assumptions: Turbo needs root `turbo.json` inside each
Node service build context, and Prisma generation needs `DATABASE_URL` during
image build. All six Node Dockerfiles now copy `turbo.json`; the five Prisma
builder stages use a non-secret placeholder URL that is absent from the final
runtime stages. The successful hosted run then built all six HTTP images and
the shared ETL/Moto image in separate sequential steps, started the E2E
dependency graph with `--no-build --wait`, passed the six-service contract
probe, seeded the S3 mock, and passed the authenticated order journey. The
failure-log collection and teardown steps also completed as configured. See
the [successful GitHub Actions run](https://github.com/funnyMans/Node.js_Boilerplate/actions/runs/36764059658).

This proves the local operator contract and order-journey commands on a clean
hosted runner. It does not build images in parallel or start optional Dagster,
Prometheus, Grafana, Nginx, the OTel collector, or Tempo as part of the
integration job.

The `deepmerge-ts` alert is addressed by a scoped pnpm override for
`@prisma/config`, selecting patched `deepmerge-ts` 8.0.2 while keeping the
Prisma 7.10.0 CLI and client unchanged. A frozen install, forced full workspace
build (including Prisma client generation), lint, and all 80 unit tests passed
with that override. GitHub Dependabot subsequently marked the alert fixed.

Prisma 8 remains a separate compatibility migration. Registry metadata lists
`prisma` 8.0.0-rc.19 as latest, but `@prisma/client` remains at 7.10.0 and
returns 404 for 8.0.0-rc.19. Do not mix the CLI prerelease with the v7 client;
start the major migration once Prisma publishes matching packages, then test
all five service schemas, adapters, migrations, Docker builds, and integration
journeys as a dedicated change.

**Phase status: complete for current local contracts and journey.** A clean
hosted CI run proves the workspace build, lint, unit and ETL tests, Compose
configuration, sequential image builds, six-service contract probe, and
critical order journey. Automatic CI for pushes and PRs targeting `dev` is
temporarily paused; required checks remain active for `stage` and `main`.
Manual workflow dispatch remains available. CI is a regression and learning
tool, not a deployment pipeline.

## Branch workflow and merge policy

The repository uses `main` as its stable reference branch, with protected
`stage` and `dev` branches for integration and ongoing development. Normal
feature/fix branches target `dev`; promotion pull requests advance `dev` to
`stage`, then `stage` to `main`. Ordinary change PRs use squash; promotion and
branch synchronization PRs use merge commits to preserve shared ancestry and
prevent previously promoted work from reappearing in later PRs. All three
branches require pull requests and resolved review threads; deletion and
non-fast-forward updates are blocked. Required CI checks apply to `stage` and
`main`, but are temporarily exempted on `dev` while automatic CI is paused
there. The repository currently has one maintainer, so approving reviews are
not required. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for the branch flow, PR requirements,
and local validation commands.

## Deployment — not yet defined

The current repository has no supported deployment path or deployment
milestone. The project's production-minded direction does not by itself define
an environment, reliability target, or release process. Establish those
requirements before treating deployment as implementation work. Kubernetes,
GraphQL/Apollo Federation, RabbitMQ, and AI agents are not scheduled
commitments.

## Working rule

For each change, explain the project objective, relevant scenario, design
choice and simpler alternative, failure behavior, and verification evidence.
Update the relevant guide and diagrams, and state what remains unverified.
Prefer a small targeted check before starting the full stack; use a no-build
stack start when live integration evidence is needed and resource headroom
allows it.
