# Roadmap: operating the services as one system

This roadmap prioritizes evidence that services work together over adding
services. Each phase should leave behind a documented explanation, repeatable
checks, and a clear statement of what has and has not been verified.

## Phase 1 — Make the current setup the source of truth

**Goal:** accurately document the Compose stack, its dependencies, health
semantics, ports, monitoring coverage, and one-shot jobs.

**Current work:** documentation has been aligned with the checked Compose
configuration. The local operations guide documents individual image builds
followed by `up --no-build`, configured health checks, trace-export targets,
and the distinction between a successful init job and a healthy long-running
service. Architecture notes and Mermaid sources now label implemented local
components separately from future production options.

**Verified:** on 2026-09-29 the gateway and its declared dependency set were
started with `docker compose ... up -d --no-build --wait api-gateway`. Compose
reported the gateway and its health-checked dependencies healthy; the S3 init
job exited successfully. The full development stack (Dagster, Nginx,
Prometheus, Grafana, and OTel collector) was not started in this check.

**Done when:** documentation matches the checked Compose services and files,
monitoring targets are explicit, and a no-build start has been checked against
the readiness expectations without rebuilding all images together. The
documented core order-service dependency set has passed that live no-build
readiness check; the optional full-stack monitoring/ETL processes have not
been started as part of this verification.

**Remaining gaps:** `temporal`, `nginx`, Prometheus, Grafana, and the OTel
collector have no Compose health checks. The Moto S3 mock has a TCP readiness
check, and the bucket init job now waits for that check. This only proves the
listener accepts connections, not that S3 operations or seeded objects are
correct.

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
journey subscribes only to inspect headers. The local OTel collector logs
spans but has no searchable trace store. A controlled fault remains for the
later failure-drill phase.

**Phase status:** complete for trace context persistence and propagation
through the exercised local order journey. NATS consumer-side continuation is
not in scope because there is no application consumer. Searchable trace
storage is still a separate observability improvement.

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

**First hosted-run findings:** the prerequisite jobs passed, then the users
image exposed two clean-build assumptions: Turbo needs the root `turbo.json`
inside the build context, and Prisma generation needs a `DATABASE_URL` during
the image build. The root Turbo config is now copied into all six Node service
build contexts; the five Prisma service builder stages also set a non-secret
placeholder URL that is not present in the final runtime stages. The next
hosted run must verify all image builds, the live contract probe, and the order
journey end to end. Image builds are intentionally sequential.

The `deepmerge-ts` alert is addressed by a scoped pnpm override for
`@prisma/config`, selecting patched `deepmerge-ts` 8.0.2 while keeping the
Prisma 7.10.0 CLI and client unchanged. A frozen install, forced full workspace
build (including Prisma client generation), lint, and all 80 unit tests passed
with that override. The alert status should be checked again on GitHub after
the dependency commit is pushed.

Prisma 8 remains a separate compatibility migration. Registry metadata lists
`prisma` 8.0.0-rc.19 as latest, but `@prisma/client` remains at 7.10.0 and
returns 404 for 8.0.0-rc.19. Do not mix the CLI prerelease with the v7 client;
start the major migration once Prisma publishes matching packages, then test
all five service schemas, adapters, migrations, Docker builds, and integration
journeys as a dedicated change.

**Done when:** a clean CI run proves the same contracts and critical journey
used by the local operator procedure.

## Later — Deployment

Production infrastructure, CI/CD delivery, secret-manager integration, and
deployment are intentionally deferred. Choose those after local behavior,
failure/recovery evidence, and operational contracts are repeatable.

## Working rule

For each phase, update the relevant guide and diagrams, retire a document only
when its material has been moved or is genuinely obsolete, and verify the
application at a risk-appropriate scope. Prefer a small targeted check before
starting the full stack; use a no-build stack start when live integration
evidence is needed and resource headroom allows it.
