# Contributing

This repository uses a small, protected branch flow so changes are tested
before they reach the production-designated `main` branch. `main` remains the
default branch and is the public stable line; this repository does not deploy
from it automatically.

## Branch flow

```text
feature/*, fix/*, chore/* ── pull request ──> dev
                                             │
                                             └── promotion pull request ──> stage
                                                                            │
                                                                            └── release pull request ──> main
```

- Create normal feature, fix, and maintenance branches from `dev`. Open their
  pull requests against `dev`.
- Promote a tested set of changes from `dev` to `stage` with a pull request.
  Use `stage` for release-candidate verification and stabilization; do not
  treat it as a deployment target.
- Promote a verified candidate from `stage` to `main` with a pull request.
  `main` is the stable, production-designated branch.
- If a release-candidate-only fix is needed, make a focused fix branch from
  `stage`, merge it into `stage`, then bring the same fix back into `dev`
  before the next promotion.
- For an urgent production-line fix, branch from `main`, open a pull request
  to `main`, and then forward-merge that fix into `stage` and `dev`.
- Do not push directly to `main`, `stage`, or `dev`, or force-push them.

GitHub protects the three integration branches with required pull requests,
linear history, resolved review conversations, and all required CI checks.
Approving reviews are not currently required because the repository has one
maintainer; add a second maintainer and enable required approval before
accepting outside contributions that need independent review.

## Pull request requirements

- Use a concise Conventional Commit title, for example
  `fix(orders): preserve trace context on retry`.
- Keep a pull request focused. Include the reason, behavior change, and
  verification evidence in its description.
- Resolve every review conversation before merge.
- Keep all required CI checks green. The current checks cover workspace build,
  lint, unit tests, ETL unit tests, Compose configuration, sequential image
  builds, the six-service contract probe, and the order journey.
- Update directly affected operating guides, architecture diagrams, and
  roadmap status in the same pull request.
- Never include `.env` files, credentials, generated clients, caches, or
  machine-specific configuration.
- Merge with squash so each integration branch receives a focused commit;
  delete the source branch after merging.

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
seeds the S3 mock, and runs the order journey. It is the authoritative
integration check; see [`infra/README.md`](infra/README.md) for the local
operator procedure.

## Releases and versioning

There is no automated deployment or release process. Treat the repository as
one public boilerplate product and use Semantic Versioning for releases from
`main`: patch for compatible fixes, minor for compatible additions, and major
for breaking changes. Choose and document the next version in the promotion
pull request from `stage` to `main`; update the root project version and any
published package versions affected by the release. Create a `vX.Y.Z` tag
only after the verified promotion PR has merged. Do not imply that a GitHub
release deploys the application.
