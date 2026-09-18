# Fly.io image. Build: next build in standalone mode; run: node server.js on :3000.
# NEXT_PUBLIC_* are inlined at build time, so they arrive as build args (see scripts/deploy-fly.ts).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_ELEVENLABS_AGENT_ID
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_ELEVENLABS_AGENT_ID=$NEXT_PUBLIC_ELEVENLABS_AGENT_ID \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Course data is read with fs at runtime; copy it whole rather than trusting file tracing.
COPY --from=build /app/data ./data
# demo-reset runs inside the machine: `fly ssh console -C "node scripts/demo-reset.ts --seed"`.
COPY --from=build /app/scripts/demo-reset.ts ./scripts/demo-reset.ts
COPY --from=build /app/src/types ./src/types
EXPOSE 3000
CMD ["node", "server.js"]
