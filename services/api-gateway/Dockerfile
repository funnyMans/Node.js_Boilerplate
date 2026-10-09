FROM node:24.20 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app

# Copy only manifest files first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
# Copy workspace package.json files into their expected paths (preserve structure)
COPY packages/common/package.json packages/common/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Copy this service package.json
COPY services/api-gateway/package.json ./services/api-gateway/package.json

# Install deps (frozen lockfile for determinism)
RUN pnpm install --frozen-lockfile

# Copy package sources required for builds
COPY packages/common ./packages/common
COPY packages/contracts ./packages/contracts

# Copy remaining service sources after install to leverage cache for local edits
COPY services ./services

# Build this package
RUN pnpm exec turbo run build --filter=service-api-gateway...


FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Copy built app and node_modules from builder
COPY --from=builder /app /app

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "services/api-gateway/dist/server.js"]
