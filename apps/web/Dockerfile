# Web tier image. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t waylorn-web .
# Signing, SBOM and provenance are attached by the release pipeline (ADR 0005).
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @waylorn/web...
RUN pnpm --filter @waylorn/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output contains only the traced runtime dependencies.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
# Run with a read-only root filesystem; Next.js writes only to its cache directory.
CMD ["node", "apps/web/server.js"]
