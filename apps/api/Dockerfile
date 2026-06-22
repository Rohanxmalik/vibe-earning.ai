# Build context MUST be the repo root: docker build -f apps/api/Dockerfile -t kbi-api .
# (the API depends on the @kbi/shared workspace package)

FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /repo

# Install deps first (cache-friendly): copy only manifests + lockfile.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Copy sources and build shared -> generate prisma client -> build api.
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @kbi/shared build \
    && pnpm --filter @kbi/api exec prisma generate \
    && pnpm --filter @kbi/api build

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /repo
ENV NODE_ENV=production
# Carry the full workspace (incl. node_modules + generated prisma client + prisma CLI).
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
# Apply migrations on boot, then start. PORT/DATABASE_URL/REDIS_URL/etc come from env.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
