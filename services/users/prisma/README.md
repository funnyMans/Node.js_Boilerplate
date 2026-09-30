Prisma modular layout

This service keeps the Prisma schema in a modular form:

- `prisma/schema.prisma` holds the shared generator and datasource config
- model definitions live in `prisma/models/*.prisma`
- the generated Prisma client is emitted to `generated/prisma/client`

We intentionally keep generated artifacts outside `src/` so the source tree stays clean and service-local build outputs remain predictable.

The canonical generated output is:

`services/users/generated/prisma/client`

Use:

pnpm --filter service-users run prisma:generate

and then run Prisma migrations or client generation as needed.
