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

# Schema file consumed by src/utils/bootstrap.js on first boot
COPY database/ ./database/

# Required runtime directories (uploads/logs/backups)
RUN mkdir -p uploads logs backups downloads && chown -R ptsss:ptsss /app

# P1-11: declare production explicitly so the running app (and any child
# process spawned by it) picks up production behaviour. Placed BEFORE
# `USER ptsss` to make sure the env is in the image, not just a build-time
# RUN. Also kept NPM_CONFIG_UPDATE_NOTIFIER=false so any in-container
# `npm` call (e.g. an operator running `npm ls` to debug) is quiet.
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

USER ptsss

EXPOSE 3000

# Healthcheck — Coolify and `docker ps` both use this
HEALTHCHECK --interval=10s --timeout=10s --start-period=40s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
