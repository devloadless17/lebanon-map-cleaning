# syntax=docker/dockerfile:1

# bookworm-slim, not alpine: glibc-only prebuilt binaries fail silently on musl, and Prisma
# ships prebuilt engines.
FROM node:22-bookworm-slim AS base
WORKDIR /app
# npm 10 spuriously desyncs lockfiles that use overrides on upstream patch releases.
RUN npm i -g npm@11

FROM base AS deps
# Only the manifests first, so a source-only change reuses this layer.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# "prepare": "husky" breaks npm ci inside Docker, where there is no git hooks directory.
RUN npm pkg delete scripts.prepare && npm ci

FROM deps AS build
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
RUN npm run build --workspace @lebanon/contracts \
 && npm run build --workspace @lebanon/api
# Safe after the build: prune never runs lifecycle scripts.
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
# Workspaces hoist everything here, including the @lebanon/contracts symlink into packages/.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# Migrations are read from disk at deploy time, so they must be IN the image — tsc does not
# copy non-imported files.
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
# `prisma migrate deploy` reads the connection URL from here, not from schema.prisma.
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

USER node
EXPOSE 4100

# Liveness only: a readiness probe here would bill Google on every container healthcheck and
# fail the deploy gate on a transient blip.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
