# Local TMS development environment

The development stack runs the retained TMS foundation: PostgreSQL, the API
gateway, authentication, account profiles, and local observability. Load,
dispatch, and execution services are not implemented yet.

## Start the stack

From the repository root:

```sh
cp -n .env.example .env
pnpm install
pnpm build
pnpm docker:up
```

The gateway is available at `http://localhost:3000`; the optional local Nginx
entry point is `http://localhost:8080`. Grafana is at `http://localhost:3005`
and Prometheus at `http://localhost:9090`. Local database and observability
ports bind to loopback.

The first PostgreSQL initialization creates separate `users` and `auth`
databases. The init script only runs for a new data directory. If database
names change after initialization, create the databases explicitly rather
than assuming the existing volume was reinitialized.

Prisma migrations run when the corresponding application container starts.
To apply them to already-running containers:

```sh
pnpm docker:migrate:users
pnpm docker:migrate:auth
```

## Provision an account

There is no public self-registration route. Create or update accounts through
the trusted local operator command after the stack is healthy:

The role-model migration invalidates pre-JWT sessions and does not guess how
legacy `user` or `admin` accounts map to TMS authority. Reprovision each
existing account with its explicit TMS role grants before login.

```sh
read -r -p "Account email: " AUTH_PROVISION_EMAIL
read -r -s -p "Account password: " AUTH_PROVISION_PASSWORD
printf "\n"
read -r -p "Role grants (comma-separated): " AUTH_PROVISION_ROLE_GRANTS
export AUTH_PROVISION_EMAIL AUTH_PROVISION_PASSWORD AUTH_PROVISION_ROLE_GRANTS
docker compose -f infra/docker-compose.dev.yml exec \
  -e AUTH_PROVISION_EMAIL -e AUTH_PROVISION_PASSWORD -e AUTH_PROVISION_ROLE_GRANTS \
  auth-service pnpm --filter auth-service provision:account
unset AUTH_PROVISION_EMAIL AUTH_PROVISION_PASSWORD AUTH_PROVISION_ROLE_GRANTS
```

Use role identifiers from the
[responsibility model](../docs/trucking/RESPONSIBILITIES.md). Add `:la`,
`:west`, `:central`, or `:east` only for area-scoped grants, for example
`chief_supervisor,area_supervisor:la`. Area supervisors and brokers require
an area; fleet dispatchers may optionally have one. Other roles do not accept
area scope, and role grants do not replace resource- or relationship-specific
authorization. Reprovisioning an existing email replaces all its grants,
resets its password, and revokes its active sessions.

## Operate the stack

```sh
pnpm docker:status
pnpm docker:health
pnpm docker:logs
pnpm docker:down
```

`pnpm docker:down` preserves named volumes. Removing the local database and
observability data is destructive; use `docker compose -f
infra/docker-compose.dev.yml down --volumes` only when that reset is intended.

The checked-in credentials and token secrets are development defaults only.
Set unique values in `.env` for local use, and never expose this stack or reuse
these values in a deployed environment.

## Current boundaries

- PostgreSQL is the only application datastore and uses separate auth/profile
  databases for local service ownership.
- Access is through the gateway; the auth and profile services are internal.
- Prometheus scrapes the HTTP services, while the OpenTelemetry Collector
  exports traces to the local Tempo instance.
- Grafana dashboards and data sources are provisioned from this repository.
- Local observability is diagnostic, not durable business history or a
  production monitoring design.
