# PT Sopiak Satria Saga — Sistem Manajemen Keamanan

Sistem manajemen keamanan satpam terintegrasi: web admin, backend API + realtime, dan mobile app untuk anggota lapangan.

## Arsitektur

| Komponen | Stack | Port | Domain produksi |
|---|---|---|---|
| Backend API | Express.js 4 + Socket.io 4 | 3000 | `api.sopiaksatriasaga.com` |
| Web Admin | Next.js 14 (App Router) + PWA | 3001 | `hq.sopiaksatriasaga.com` |
| Website Publik | Next.js 14 | 3002 | `sopiaksatriasaga.com` |
| Database | PostgreSQL 16 | 5432 | internal-only |
| Mobile App | React Native + Expo SDK 54 | — | (calls API subdomain) |

Reverse proxy & SSL: Coolify built-in Traefik via Docker labels (no `nginx`, no `certbot`). DB schema bootstrap berjalan otomatis saat backend boot — lihat bagian _Migration_ di bawah.

## Quick Start (lokal)

Prasyarat: Docker + Docker Compose v2, Node 20+, Expo CLI (untuk mobile).

```bash
cp .env.example .env
# Wajib di-edit:
#   DB_PASSWORD       — password Postgres apapun
#   JWT_SECRET        — generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
#   COOKIE_SECURE     — false untuk lokal (true di produksi)
#   COOKIE_DOMAIN     — kosongkan untuk lokal
#   CORS_ORIGIN       — http://localhost:3001 untuk lokal

docker compose up --build -d

# Tunggu ~30 detik untuk bootstrap, lalu cek:
curl http://localhost:3000/api/health
# {"status":"ok",...}

# Ambil seed credentials dari log container (PIN random per-user):
docker compose logs backend | grep -A 20 "INITIAL SEED CREDENTIALS"
```

**PENTING**: PIN seed yang dicetak di log **hanya muncul sekali**. Catat segera. Setiap user akan dipaksa ganti PIN saat login pertama (`must_change_pin=true`).

Mobile (Expo Go):
```bash
npm install
npx expo start
```

## Struktur Project

```
sopiak-satria-saga/
├── backend/                     # Express API
│   ├── src/
│   │   ├── app.js               # Entry point
│   │   ├── config/              # DB, Swagger config
│   │   ├── controllers/         # HTTP handlers
│   │   ├── middleware/          # auth, validation, rate-limit
│   │   ├── repositories/        # DB query layer
│   │   ├── routes/              # Express routers
│   │   ├── realtime/            # Socket.io
│   │   ├── services/            # Business logic
│   │   └── utils/
│   │       ├── bootstrap.js     # Auto-init schema + migrations + seed
│   │       ├── migrationRunner.js  # Tahap 10 — schema_migrations tracker
│   │       ├── logger.js        # Async stream-based logger
│   │       └── scope.js         # Per-role data isolation
│   └── Dockerfile
├── database/
│   ├── ptsss_db.sql             # Full schema (loaded by bootstrap on fresh DB)
│   ├── migrate.js               # Standalone CLI: node database/migrate.js
│   └── migrations/              # Versioned migration files (001 → 005)
├── web-admin-next/              # Next.js admin UI
│   ├── app/                     # App Router pages
│   ├── components/              # React components
│   ├── lib/                     # API client, socket client
│   ├── stores/                  # Zustand stores
│   └── styles/globals.css       # CSS variables (theming)
├── src/                         # React Native (mobile)
├── docker-compose.yml           # Multi-service compose (with Traefik labels)
└── .env.example
```

## Migration System

Sistem migration baru (Tahap 10) menggunakan tabel `schema_migrations` sebagai tracker.

### Bagaimana berjalan
1. Saat backend boot, `bootstrap.js` memanggil `runMigrations()` setelah schema dasar siap.
2. `migrationRunner` scan `database/migrations/`, hitung SHA256 setiap file, bandingkan dengan `schema_migrations`.
3. File baru di-apply dalam transaction; gagal apply = rollback + throw (backend exit di strict mode).
4. **Server existing yang baru pertama kali kena sistem ini**: semua file di `database/migrations/` dianggap "already applied" — pre-populated supaya tidak double-apply migrasi yang sudah jalan manual (002, 003, 004).

### Tambah migration baru
```bash
# Konvensi penamaan: NNN_short_description.sql (mis. 006_add_audit_index.sql)
touch database/migrations/006_add_audit_index.sql

# Edit, lalu test lokal:
node database/migrate.js
```

Migration berikutnya akan otomatis ter-apply saat backend restart (atau via `node database/migrate.js` manual).

### Force replay (dev only)
```bash
MIGRATIONS_FORCE_REPLAY=true node database/migrate.js
# Pre-population di-skip; semua file di-run lagi. Hati-hati: hanya untuk fresh DB.
```

## Production Deploy ke Coolify

→ Untuk panduan step-by-step lengkap: **[`PANDUAN_DEPLOY_COOLIFY.md`](./PANDUAN_DEPLOY_COOLIFY.md)**

Ringkas:
1. Push repo ke GitHub.
2. Coolify → New Resource → Docker Compose → pilih repo.
3. Set domain per service di Coolify (Traefik labels otomatis dibaca dari `docker-compose.yml`).
4. Isi env Production + Preview (jangan lupa generate `JWT_SECRET` baru — placeholder ditolak oleh backend, lihat `middleware/auth.js`).
5. Deploy. Backend akan:
   - Load schema dari `database/ptsss_db.sql` jika DB kosong.
   - Apply migration baru (kalau ada).
   - Seed default users dengan PIN random (cetak di log sekali).

### Health & monitoring
```bash
# Health
curl https://api.sopiaksatriasaga.com/api/health

# Log container backend
docker compose logs -f backend

# DB
docker compose exec postgres psql -U ptsss_user -d ptsss_db
```

### Restart Traefik (jika 504)
```bash
sudo docker restart coolify-proxy
# Crontab harian jam 3 pagi sudah menjalankan ini secara otomatis
```

## Environment Variables

File `.env.example` punya semuanya. Yang **wajib** di-set di produksi:

| Var | Contoh / requirement |
|---|---|
| `DB_HOST` | `postgres` (compose service name) |
| `DB_PASSWORD` | random base64, ≥24 chars |
| `JWT_SECRET` | random hex, ≥32 chars. Placeholder seperti `GANTI`/`REPLACE`/`example`/`changeme` **ditolak** (`process.exit(1)`). |
| `BCRYPT_ROUNDS` | `12` (default) |
| `CORS_ORIGIN` | `https://hq.sopiaksatriasaga.com,https://sopiaksatriasaga.com` |
| `COOKIE_SECURE` | `true` di produksi |
| `COOKIE_DOMAIN` | `.sopiaksatriasaga.com` di produksi |
| `NODE_ENV` | `production` (mengaktifkan generic error response + strict bootstrap) |

Opsional:
| Var | Default | Catatan |
|---|---|---|
| `PORT` | `3000` | healthcheck Dockerfile membaca `${PORT:-3000}` |
| `BOOTSTRAP_STRICT` | `true` (saat NODE_ENV=production) | `false` untuk dev — backend tetap hidup walau bootstrap gagal |
| `AUTO_BOOTSTRAP` | `true` | `false` = skip semua bootstrap (manual schema management); `schema-only` = skip seed users |
| `MIGRATIONS_FORCE_REPLAY` | unset | `true` di dev untuk re-run semua migration (skip pre-population) |
| `LOG_DIR` | `./logs` | |
| `LOG_MAX_SIZE` | `10` (MB) | |

## Security Hardening yang Sudah Berjalan (Tahap 1–10)

Per dokumen `TAHAP_PERBAIKAN_SOPIAK.md`:

- **Tahap 1**: SQL injection filter di repository, role guard geofence izin, Socket.io reject anonymous, `trust proxy = 1`, path traversal di upload + backup restore.
- **Tahap 2**: Quick Login `__DEV__`-only, mobile token di `SecureStore` (bukan AsyncStorage), default PIN random + `must_change_pin`, `BCRYPT_ROUNDS` dari env, web-admin token via httpOnly cookie (bukan localStorage), refresh token untuk klien, atomic rotation + replay detection, klien-suspended check, `JWT_SECRET` placeholder = `process.exit(1)`.
- **Tahap 3**: XSS prevention di 4 halaman web-admin (`escapeHtml()`).
- **Tahap 4**: Data isolation per role via `scope.js` (komandan/supervisor scoped by `lokasi`, anggota by `user_id`, klien by `client_id`).
- **Tahap 5**: `clients.id` migrated dari `INTEGER` ke `UUID`, role `klien` ditambahkan ke `users_role_check`, Traefik berpindah ke Docker labels.
- **Tahap 6**: NRP case-insensitive (index `idx_users_nrp_upper`), bootstrap strict mode, `localtunnel` keluar dari production deps.
- **Tahap 7**: Web admin pagination, Reset PIN feature, QR code di-render lokal (tidak ke pihak ketiga), geolocation permission, Socket.io cookie auth.
- **Tahap 8**: Mobile permissions (BACKGROUND_LOCATION, POST_NOTIFICATIONS), `AbortController` cleanup, socket `reconnectionAttempts = 30` (bukan `Infinity`).
- **Tahap 9**: Rate limit `/uploads`, logger async stream, CORS error → 403 (bukan 500), Socket listener dedup, Express `~4.21.0`.
- **Tahap 10** (ini): Migration runner, console → logger conversion, Dockerfile `${PORT:-3000}`, CSS vars untuk inline color, lokasi dedup + unique constraint, dead imports cleanup, refresh rate limit `/api/auth/refresh` (10/menit), generic error response di production.

## Logging

Backend pakai async stream logger (`backend/src/utils/logger.js`) yang menulis ke:
- `logs/app.log` — semua level (INFO/WARN/ERROR)
- `logs/error.log` — WARN + ERROR
- `logs/access.log` — HTTP via Morgan

Rotasi otomatis pada `LOG_MAX_SIZE` MB. Volume `backend_logs` di `docker-compose.yml` mempertahankan log lintas redeploy.

Pengecualian — `console.*` masih dipakai sengaja di:
- `app.js` startup banner & FATAL pre-exit (sync stdout, anti hilang sebelum process.exit)
- `bootstrap.js` blok seed credentials (PIN tidak boleh ke log file)
- `utils/seed.js`, `seed-full.js` (standalone CLI, no logger context)
- `middleware/auth.js` JWT_SECRET FATAL block
- `database/migrate.js` (standalone CLI)

## Troubleshooting

| Gejala | Solusi |
|---|---|
| Backend exit "JWT_SECRET masih placeholder" | Generate `JWT_SECRET` baru tanpa kata `GANTI`/`REPLACE`/`example`/`changeme` |
| Healthcheck unhealthy padahal `/api/health` jalan | Cek `PORT` env match di Dockerfile dan compose |
| Migration error saat boot pertama | Set `BOOTSTRAP_STRICT=false` sementara untuk debug; check `logs/app.log` |
| `lokasi_nama_client_unique` violation saat insert | Sudah ada lokasi dengan `(nama, client_id)` yang sama — Tahap 10 Bug #5 |
| Login refresh 429 | `/api/auth/refresh` di-limit 10/menit per IP — tidak normal user, biasanya bug klien yang re-refresh loop |
| Operator butuh re-print seed PIN | PIN tidak di-log ke file. Drop tabel `users`, restart backend → seed ulang dengan PIN baru |
| Coolify auto-deploy gagal `npm ci` | Pastikan `package.json` dan `package-lock.json` sinkron. Bug klasik dari Tahap 6 yang sudah di-fix di commit `869b40b` |

## License

Internal — PT Sopiak Satria Saga.
