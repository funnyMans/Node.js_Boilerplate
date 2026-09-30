FROM node:24.20 AS builder

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app
ENV CI=true

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/inventory/package.json services/inventory/package.json

RUN pnpm install --frozen-lockfile --shamefully-hoist --config.confirmModulesPurge=false

COPY packages/common packages/common
COPY services/inventory services/inventory

RUN pnpm exec turbo run build --filter=inventory-service...

FROM node:24.20

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY --from=builder /app /app

ENV NODE_ENV=production
EXPOSE 3011
CMD ["node", "services/inventory/dist/server.js"]
