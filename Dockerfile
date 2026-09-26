# Wonderloop as a self-contained Node server, for any host that runs a container: a VPS, Fly,
# Render, a home server, or docker compose with the Firebase emulators (docker-compose.yml).
# Build context is the repository root, because the content lives beside the app.
#
#   docker build -t wonderloop .
#   docker run -p 3000:3000 --env-file web/.env.production.local wonderloop

FROM node:22-alpine AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY content ./content
# The build typechecks a test that reads the emulator ports from firebase.json at the root.
COPY firebase.json firestore.rules firestore.indexes.json storage.rules ./
COPY web ./web
# The client config is baked in at build time (NEXT_PUBLIC_*), so pass it as build args or an
# env file at build. Emulator mode is the default when nothing is given.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_USE_EMULATORS=true
ARG NEXT_PUBLIC_EMULATOR_HOST=localhost
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_USE_EMULATORS=$NEXT_PUBLIC_USE_EMULATORS \
    NEXT_PUBLIC_EMULATOR_HOST=$NEXT_PUBLIC_EMULATOR_HOST \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S wonderloop && adduser -S wonderloop -G wonderloop
# The standalone output carries its own traced node_modules (including the hashed
# firebase-admin alias, see docs/deploy-runbook.md), the static assets and the public folder.
COPY --from=build --chown=wonderloop:wonderloop /app/web/.next/standalone ./
COPY --from=build --chown=wonderloop:wonderloop /app/web/.next/static ./web/.next/static
COPY --from=build --chown=wonderloop:wonderloop /app/web/public ./web/public
USER wonderloop
EXPOSE 3000
CMD ["node", "web/server.js"]
