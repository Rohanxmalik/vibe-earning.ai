# Build context MUST be the repo root: docker build -f apps/api/Dockerfile -t kbi-api .
# (the API depends on the @vibearning/shared workspace package)

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

# Copy sources and build shared -> generate prisma client -> build api -> prune to a
# self-contained prod bundle (production deps only; no nest/jest/ts toolchain).
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vibearning/shared build \
    && pnpm --filter @vibearning/api exec prisma generate \
    && pnpm --filter @vibearning/api build \
    && pnpm --filter @vibearning/api deploy --prod /app \
    && cd /app && node_modules/.bin/prisma generate

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# Pruned bundle: dist + prisma + production node_modules (incl. @prisma/client + prisma CLI).
COPY --from=build /app /app
EXPOSE 3000
# Apply migrations on boot, then start. PORT/DATABASE_URL/REDIS_URL/etc come from env.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
