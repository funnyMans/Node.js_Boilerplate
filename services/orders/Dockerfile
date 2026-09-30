FROM node:24.20 AS builder

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app
ENV CI=true

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/common/package.json packages/common/package.json
COPY packages/common-infra/package.json packages/common-infra/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/orders/package.json services/orders/package.json

RUN pnpm install --frozen-lockfile

COPY packages/common packages/common
COPY packages/common-infra packages/common-infra
COPY packages/contracts packages/contracts
COPY services/orders services/orders

RUN pnpm exec turbo run build --filter=orders-service...
RUN cp -a services/orders/generated services/orders/dist/generated

FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

COPY --from=builder /app /app

ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "services/orders/dist/server.js"]
