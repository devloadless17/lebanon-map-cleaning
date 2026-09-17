# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN npm i -g npm@11

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm pkg delete scripts.prepare && npm ci

FROM deps AS build
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

# NEXT_PUBLIC_* values are inlined at BUILD time, so they arrive as build args. Changing one
# needs a rebuild, not a restart — a restart looks like the value was ignored.
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=""
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=""
ENV NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY \
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace @lebanon/contracts \
 && npm run build --workspace @lebanon/web

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# The standalone output already contains the exact dependency subset the server needs.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER node
EXPOSE 4101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4101/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
