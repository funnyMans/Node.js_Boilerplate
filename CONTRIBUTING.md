# Contributing

This repository is a learning lab, not a production product or deployment
template. The branch flow provides a safe way to study change promotion and
preserve history; `main` is the stable reference line and is not a deployment
target.

## Branch flow

```text
feature/*, fix/*, chore/* ── pull request ──> dev
                                             │
                                             └── promotion pull request ──> stage
                                                                            │
                                                                            └── promotion pull request ──> main
```

- Create normal feature, fix, and maintenance branches from `dev`. Open their
  pull requests against `dev`.
- Promote a tested set of changes from `dev` to `stage` with a pull request.
  Use `stage` to practice integration and stabilization; it is not a deployment
  target.
- Promote a verified candidate from `stage` to `main` with a pull request.
  `main` is the stable reference snapshot of the learning lab.
- Merge ordinary feature/fix/maintenance PRs with squash. Merge promotion PRs
  (`dev` -> `stage`, `stage` -> `main`) with a merge commit so the source
  commits remain ancestors of the destination and later promotions contain
  only new work.
- If a `stage`-only fix is needed, make a focused fix branch from `stage`,
  merge it into `stage`, then merge `stage` back into `dev` before the next
  promotion so the branch histories remain aligned.
- For a fix that must first land on the stable `main` line, branch from
  `main`, open a pull request to `main`, and then merge `main` into `stage` and
  `dev` to forward-port it while preserving ancestry.
- Do not push directly to `main`, `stage`, or `dev`, or force-push them.

GitHub protects all three branches with required pull requests and resolved
review conversations. Non-fast-forward updates and deletion are blocked.
Required CI checks remain enabled for `stage` and `main`; they are temporarily
exempted on `dev` while automatic CI is paused there. This exception does not
remove the pull-request or history protections. Promotion merge commits
preserve branch ancestry. Approving reviews are not currently required because
the repository has one maintainer.

## Pull request requirements

- Use a concise Conventional Commit title, for example
  `fix(orders): preserve trace context on retry`.
- Keep a pull request focused. Include the reason, behavior change, and
  verification evidence in its description.
- Resolve every review conversation before merge.
- For PRs targeting `dev`, run the relevant local checks and include their
  results; CI is temporarily not triggered for those PRs. PRs targeting
  `stage` or `main` must pass the required checks: workspace build, lint, unit
  tests, ETL unit tests, Compose configuration, sequential image builds, the
  six-service contract probe, and the order journey.
- Keep changes focused on a learning goal or on making the current system
  more understandable, reliable, or verifiable. Explain the problem, the
  chosen design, a simpler alternative, and how the result was verified.
- Update directly affected operating guides, architecture diagrams, and
  roadmap status in the same pull request.
- Never include `.env` files, credentials, generated clients, caches, or
  machine-specific configuration.
- Merge feature/fix/maintenance PRs with squash. Use a merge commit for
  branch promotions and forward/back-merges; do not squash those PRs. Delete
  merged feature branches after merging.

## Local validation

Install dependencies with the lockfile, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test:unit
pnpm etl:test
docker compose -f infra/docker-compose.dev.yml config --quiet
docker compose -f infra/docker-compose.dev.yml -f infra/docker-compose.e2e.yml config --quiet
```

The CI Compose integration job additionally builds each image sequentially,
starts the E2E dependency graph without rebuilding, probes service contracts,
seeds the S3 mock, and runs the order journey. It is required for PRs targeting
`stage` and `main`; see [`infra/README.md`](infra/README.md) for the local
operator procedure.

## Deployment and future learning topics

There is no deployment or release target. Kubernetes, GraphQL/Apollo
Federation, RabbitMQ, AI agents, and other technologies may become future
learning exercises, but they are not implementation commitments. Before
adding one, document the learning objective, the simpler alternative, the
complexity it introduces, and the evidence that will demonstrate the concept.
