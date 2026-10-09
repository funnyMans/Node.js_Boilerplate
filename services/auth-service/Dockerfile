FROM node:24.20 AS builder
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
ENV DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/common/package.json packages/common/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/auth-service/package.json services/auth-service/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages/common ./packages/common
COPY packages/contracts ./packages/contracts
COPY services/auth-service ./services/auth-service

RUN pnpm exec turbo run build --filter=auth-service...
RUN if [ -d "services/auth-service/generated" ]; then cp -a services/auth-service/generated services/auth-service/dist/generated; fi

FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY --from=builder /app /app
CMD ["node", "services/auth-service/dist/server.js"]