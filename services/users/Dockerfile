FROM node:24.20 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app
ENV CI=true
ENV DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/app

# Copy only manifest files first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
# Copy workspace package.json files into their expected paths (preserve structure)
COPY packages/common/package.json packages/common/package.json
COPY packages/common-infra/package.json packages/common-infra/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Copy this service package.json
COPY services/users/package.json ./services/users/package.json

# Install deps (frozen lockfile for determinism)
RUN pnpm install --frozen-lockfile --shamefully-hoist --config.confirmModulesPurge=false

# Copy package sources required for builds
COPY packages/common ./packages/common
COPY packages/common-infra ./packages/common-infra
COPY packages/contracts ./packages/contracts

# Copy remaining service sources after install to leverage cache for local edits
COPY services ./services

# Turbo builds workspace dependencies before this service to avoid concurrent
# package scripts cleaning shared output while another service is compiling.
RUN pnpm exec turbo run build --filter=users-service...

# Ensure Prisma generated client (JS) is available in the built output
RUN if [ -d "services/users/generated" ]; then cp -a services/users/generated services/users/dist/generated; fi


FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy built app and node_modules from builder
COPY --from=builder /app /app

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "services/users/dist/src/server.js"]
