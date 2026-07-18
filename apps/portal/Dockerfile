# Build context MUST be the repo root: docker build -f apps/portal/Dockerfile -t kbi-portal .
# Uses Next.js standalone output (see next.config.mjs).

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/portal/package.json apps/portal/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/portal apps/portal
# NEXT_PUBLIC_* is inlined at build time; override with --build-arg as needed.
ARG NEXT_PUBLIC_API_BASE=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter @vibearning/shared build \
    && pnpm --filter @vibearning/portal build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Standalone output bundles only what the server needs.
COPY --from=build /repo/apps/portal/.next/standalone ./
COPY --from=build /repo/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=build /repo/apps/portal/public ./apps/portal/public
EXPOSE 3001
CMD ["node", "apps/portal/server.js"]
