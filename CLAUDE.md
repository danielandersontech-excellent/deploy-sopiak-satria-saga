# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

One monorepo containing four deployables for PT Sopiak Satria Saga's security-guard management system. Code, comments, commit messages, and UI strings are in **Indonesian** — match that.

| Component | Location | Stack | Port |
|---|---|---|---|
| Backend API + realtime | `backend/` | Express 4 + Socket.io 4 + PostgreSQL 16 | 3000 |
| Web admin (PWA) | `web-admin-next/` | Next.js 14 App Router | 3001 |
| Public website | `website/` | Next.js 14 App Router | 3002 |
| Mobile app | repo root (`App.tsx`, `src/`) | React Native + Expo SDK 54 | — |

Root `package.json` is the **mobile app's** manifest; each of the other three has its own `package.json`/`node_modules`. Deploy target is Coolify; TLS/routing come from Traefik labels inside `docker-compose.yml` (no nginx/certbot).

## Commands

```bash
# Full local stack
docker compose up --build -d
docker compose logs backend | grep -A 20 "INITIAL SEED CREDENTIALS"   # seed PINs, printed ONCE

# Backend alone
cd backend && npm run dev          # nodemon
cd backend && npm start
cd backend && npm run seed         # or seed:full
cd backend && npm test             # jest configured, but NO test files exist yet

# Web admin / website
cd web-admin-next && npm run dev   # :3001, npm run lint available
cd website && npm run dev          # :3002, no lint script

# Mobile
npx expo start                     # from repo root
```

### Verification gate (run before pushing to a deploying branch)

There is no unit-test suite. Correctness is guarded by dependency-free static analyzers:

```bash
node verify/run-all.js       # runs all five below
node verify/analyze.js           # import/module resolution vs package.json + fs
node verify/check-boundaries.js  # missing 'use client' — #1 cause of Next 14 build failures
node verify/sql-check.js         # SQL structural sanity
node verify/schema-xref.js       # tables queried in backend exist in schema
node verify/env-audit.js         # env vars in code vs docker-compose

node verify-fixes.js         # root-level cumulative regression check (Tahap 11–21)
```

Exit 0 = pass. These catch deploy-time bugs far faster than a failed Coolify build.

## Backend architecture

Strict layering — do not skip a layer:

```
routes/ → controllers/ → services/ → repositories/ → config/database.js
```

- **routes** attach `auth` and `requireRole(...)` from `middleware/auth.js`, plus `upload`/`uploadLimiter` for multipart endpoints. See `routes/laporan.routes.js` for the canonical shape.
- **controllers** are thin: unwrap `req`, call the service, `res.status(e.status || 500).json({ error: e.message })`. Photo watermarking/CDN handling lives here (`laporan.controller.js`).
- **services** own business logic **and are where data scoping is applied**.
- **repositories** extend `BaseRepository` (`repositories/base.repository.js`).

### Data isolation (`utils/scope.js`) — the most important invariant

Every read path that can see cross-tenant data must call:

```js
const scope = await getScopeFilter(user);
applyLokasiScope(filters, scope);
```

Rules: `admin`/`supervisor` unrestricted; `komandan`/`anggota` limited to `user.lokasi_id`; `klien` limited to all `lokasi` rows with their `client_id`; anything unrecognized → **deny** (fail closed, never fail open). A restricted user passing `?lokasi_id=X` outside their scope gets `lokasi_ids: []` (deny-all sentinel), never a widened view. Repos understand both `filters.lokasi_id` (single uuid) and `filters.lokasi_ids` (uuid[]; empty array ⇒ `AND FALSE`).

Roles are `anggota | komandan | supervisor | admin | klien` (`klien` was added to `users_role_check` by migration 003).

### BaseRepository SQL-injection rule

`isValidColumn()` (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) is the **only** function permitted to decide whether a string may be interpolated as a column name. `findAll`/`count` silently drop invalid keys (query-string is attacker-controlled — don't give an oracle); `create`/`update` throw. Never build SQL identifiers any other way.

### Auth

Two client shapes share one backend:

- **Web admin**: httpOnly cookies `ptsss_token` (access, ~30m) + `ptsss_refresh` (~7d). JS must never read tokens — `lib/api.ts` uses `credentials: 'include'` only. `localStorage` holds the non-sensitive user object under `ptsss_admin_user`.
- **Mobile**: tokens in `expo-secure-store` (`src/lib/apiClient.ts`), sent as `Authorization: Bearer`. There is a one-time migration path from legacy AsyncStorage keys.

Both clients collapse concurrent 401s into a single refresh via a module-level `isRefreshing`/`refreshPromise` lock, then retry once. Refresh rotation is atomic (`rotateRefreshToken` — `DELETE ... RETURNING` inside a transaction) and a reused token throws `REFRESH_TOKEN_REUSED`.

`middleware/auth.js` re-checks the DB on every request: users with `status_penempatan = 'nonaktif'` and clients not `status_klien = 'Aktif'` are rejected 401 immediately rather than at token expiry. Note `status` is duty state (`on_duty`/`off_duty`), **not** an access gate.

`JWT_SECRET` shorter than 32 chars, or matching `/GANTI|ganti-ini|REPLACE|example|change.?me/i`, causes `process.exit(1)` at boot.

### Socket.io (`realtime/socketio.js`)

Anonymous handshakes are rejected. Token lookup order: cookie `ptsss_token` → `handshake.auth.token` → `Authorization` header → `handshake.query.token`. Clients join role and lokasi rooms; events are documented in the file header (`panic:alert`, `absensi:new`, `laporan:validated`, …).

### Bootstrap & migrations

`utils/bootstrap.js` runs on every backend boot (Coolify persists volumes, so Postgres' `docker-entrypoint-initdb.d` only ever fires once):

1. Check `REQUIRED_TABLES` — if any is missing, load all of `database/ptsss_db.sql`.
2. `runMigrations()` (`utils/migrationRunner.js`) scans `database/migrations/`, SHA256s each file, applies unapplied ones **each inside its own transaction**, records them in `schema_migrations`.
3. Seed default users with crypto-random PINs and `must_change_pin = true`.

Behavior is controlled by `AUTO_BOOTSTRAP` (`true` | `false` | `schema-only`), `BOOTSTRAP_STRICT` (defaults true in production — crash-loop rather than serve a broken backend), and `MIGRATIONS_FORCE_REPLAY` (dev escape hatch).

**Writing a migration**: name it `NNN_short_description.sql`; use `IF NOT EXISTS` everywhere; **never** write `BEGIN`/`COMMIT` inside the file (the runner already wraps it — nesting closes the runner's transaction early); **never** edit an already-applied migration (checksum mismatch warns). Test with `node database/migrate.js`.

On a server that first meets this system, all existing migration files are pre-populated as "already applied" so manually-run migrations (002–004) aren't replayed.

### Logging policy

Use `utils/logger.js` (async stream → `logs/app.log`, `error.log`, `access.log`, rotated at `LOG_MAX_SIZE` MB). `console.*` is deliberate and allowed **only** in: `app.js` startup banner + FATAL pre-exit paths, the bootstrap seed-credentials block (PINs must not reach log files), `utils/seed*.js`, the `middleware/auth.js` JWT_SECRET fatal block, and `database/migrate.js` — all sync-stdout or secret-bearing cases. Don't convert these to `logger`.

In production the Express error handler returns a generic `Internal server error`; full detail goes to the logger only.

## Frontend notes

- **Web admin** routes are grouped `app/(auth)/` and `app/(dashboard)/`. `middleware.ts` redirects to `/login` only when **both** cookies are absent — a missing access cookie alone must fall through so `apiFetch` can refresh transparently.
- Per-role menu visibility is the `ROLE_MENUS` map in `web-admin-next/lib/api.ts`; `klien` is read-only. Adding a dashboard page means adding its path there.
- API surface is built from the `crud(base)` factory in the same file — extend an existing export rather than hand-rolling fetches.
- **Colors** belong in `styles/globals.css` as CSS custom properties. Inline hex in components was deliberately removed; keep brand colors discoverable in one file.
- Any string rendered as HTML in web-admin must go through `escapeHtml()`.

## Mobile notes

- `metro.config.js` proxies `/api/*`, `/ping`, `/uploads/*` from Metro (8081) to backend `127.0.0.1:3000`, working around Windows Firewall blocking port 3000 from the phone. In dev the app talks to the Metro host URI; in production `API_URL` comes from `app.json` → `expo.extra.apiUrl` (change the backend domain there, not in code).
- Screens are organized by role: `src/screens/{anggota,komandan,supervisor,klien,shared}/`.
- `src/services/offlineSync.ts` + `offlineDatabase.ts` implement a SQLite queue with priority (panic > absensi > laporan), exponential backoff with jitter, a circuit breaker, and a dead-letter queue. Submissions carry an `idempotency_key`; the backend enforces uniqueness via partial unique indexes added in migration 006, so replayed queue items can't duplicate rows.

## Environment

Copy `.env.example` → `.env`. Locally set `COOKIE_SECURE=false`, empty `COOKIE_DOMAIN`, `CORS_ORIGIN=http://localhost:3001`. `CORS_ORIGIN` is a comma-separated allow-list; `*` is ignored (credentials are enabled). `app.set('trust proxy', 1)` assumes exactly one proxy hop — bump it only if another proxy layer is added, never to `true`.

Detailed deploy walkthrough: `PANDUAN_DEPLOY_COOLIFY.md`. Troubleshooting table and hardening history (Tahap 1–10): `README.md`.
