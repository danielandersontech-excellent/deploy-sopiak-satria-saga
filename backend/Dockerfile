# ============================================
# PT Sopiak Satria Saga - Backend API (Express.js)
# Multi-stage production build for Coolify deployment.
#
# Notes:
# - Includes postgresql-client so the backup feature (pg_dump / psql) actually works.
# - Copies the database/ folder so the bootstrap step can run the schema on first boot.
# - P1-11: NODE_ENV=production is set in BOTH stages.
#     Stage 1 (deps):       makes `npm ci --omit=dev` strictly drop devDependencies
#                           even if a future package sneaks one into `dependencies`.
#     Stage 2 (production): lets Express/Helmet/etc. take their production code paths
#                           (e.g. Express skips view-cache invalidation, error stacks
#                           are not leaked in default error handlers, etc.).
# - Tahap 10 Bug #3 (P3-2): Healthcheck now reads ${PORT:-3000} so the probe
#                           follows whatever port the app actually binds to.
#                           Previously hardcoded to 3000 — if PORT env was
#                           changed, healthcheck would probe the wrong port,
#                           container would be marked unhealthy, and Coolify
#                           would loop redeploy. Also bumped start-period
#                           from 40s to 60s to give bootstrap.js room to run
#                           migrations on first boot.
# ============================================

# --- Stage 1: Install production dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
# P1-11: tighten npm ci. NODE_ENV=production drops devDependencies even if
# --omit=dev is dropped by mistake; UPDATE_NOTIFIER=false silences npm's
# version-check call which adds ~300ms of startup latency to every CI build
# (and never helps in a container that's about to be discarded).
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# --- Stage 2: Production runtime ---
FROM node:20-alpine AS production
LABEL maintainer="PTSSS DevOps"
LABEL description="PTSSS Backend API - Express.js + Socket.io"

# dumb-init  → proper PID 1 signal handling (so SIGTERM stops the server)
# postgresql-client → required by backup.service.js (pg_dump, psql)
# wget       → used by Docker HEALTHCHECK
RUN apk add --no-cache dumb-init postgresql-client wget

# Non-root user for runtime
RUN addgroup -g 1001 -S ptsss && \
    adduser -S ptsss -u 1001 -G ptsss

WORKDIR /app

# Production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Application source
COPY backend/src/ ./src/
COPY backend/firebase-service-account.json* ./

# Schema file + migrations consumed by src/utils/bootstrap.js on first boot.
# Tahap 10: also copies the database/migrations/ folder so migrationRunner
# can find migration files at /app/database/migrations/.
COPY database/ ./database/

# Required runtime directories (uploads/logs/backups/private-uploads).
# private-uploads = berkas pelamar rekrutmen (volume backend_private_uploads),
# sengaja di luar folder uploads yang dilayani express.static. Dibuat di image
# dengan owner ptsss agar named volume yang baru dibuat mewarisi kepemilikannya.
RUN mkdir -p uploads logs backups downloads private-uploads && chown -R ptsss:ptsss /app

# P1-11: declare production explicitly so the running app (and any child
# process spawned by it) picks up production behaviour. Placed BEFORE
# `USER ptsss` to make sure the env is in the image, not just a build-time
# RUN. Also kept NPM_CONFIG_UPDATE_NOTIFIER=false so any in-container
# `npm` call (e.g. an operator running `npm ls` to debug) is quiet.
#
# Tahap 10 Bug #3 (P3-2): default PORT here so HEALTHCHECK below has a
# stable value even if Coolify doesn't inject PORT explicitly. App code
# already reads process.env.PORT || 3000.
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PORT=3000

USER ptsss

EXPOSE 3000

# Healthcheck — Coolify and `docker ps` both use this.
#
# Tahap 10 Bug #3 (P3-2): use ${PORT:-3000} substitution. The shell form
# of HEALTHCHECK (no JSON array — just CMD followed by a shell string)
# runs the command via /bin/sh, which does the env var expansion. If
# you later switch to JSON exec form (CMD ["wget", ...]), env vars
# won't be expanded — you'd need to use `sh -c "wget ..."` instead.
#
# start-period bumped from 40s → 60s: bootstrap.js now also runs
# migrations (Tahap 10 Bug #1), which can take an extra few seconds on
# first boot after a deploy with new migration files.
HEALTHCHECK --interval=10s --timeout=10s --start-period=60s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-3000}/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]