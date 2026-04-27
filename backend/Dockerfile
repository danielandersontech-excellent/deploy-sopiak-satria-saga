# ============================================
# PT Sopiak Satria Saga - Backend API (Express.js)
# Multi-stage production build for Coolify deployment.
#
# Notes:
# - Includes postgresql-client so the backup feature (pg_dump / psql) actually works.
# - Copies the database/ folder so the bootstrap step can run the schema on first boot.
# ============================================

# --- Stage 1: Install production dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
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

USER ptsss

EXPOSE 3000

# Healthcheck — Coolify and `docker ps` both use this
HEALTHCHECK --interval=10s --timeout=10s --start-period=40s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
