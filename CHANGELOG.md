# CHANGELOG — Tahap 10: Cleanup & Hardening Final

Bug yang ditangani: **P1-22, P3-1, P3-2, P3-3, P3-4, P3-5, P3-6, P3-7, P3-8, P3-9, P3-11**

---

## File baru

| File | Tujuan |
|---|---|
| `backend/src/utils/migrationRunner.js` | Schema migration tracker + runner. Pre-populates existing migrations on first run. |
| `database/migrate.js` | Standalone CLI (`node database/migrate.js`) untuk apply migration di luar boot. |
| `database/migrations/005_lokasi_constraints.sql` | Dedup lokasi duplikat + UNIQUE(nama, client_id) + composite indexes. FK-aware (re-points 13 tables before delete). |
| `README.md` | Comprehensive rewrite — replaces outdated stub. |
| `CHANGELOG.md` | This file. |

## File yang dimodifikasi

### Backend

| File | Perubahan |
|---|---|
| `backend/Dockerfile` | Bug #3 (P3-2): healthcheck pakai `${PORT:-3000}`. `start-period` 40s → 60s untuk migration runner. Tambah `ENV PORT=3000` default. |
| `backend/src/app.js` | Bug #11 (P3-6): rate limit `/api/auth/refresh` 10/min per IP. Bug #12 (P3-8): generic 500 response di production (full detail di log + dev only). Bug #2: console → logger conversion (banner + FATAL pre-exit + graceful shutdown sengaja tetap console). |
| `backend/src/utils/bootstrap.js` | Bug #1: integrate `runMigrations()` antara schema load dan seed users. Bug #2: console → logger conversion (seed credentials block sengaja tetap console — security: no PINs in log files). |
| `backend/src/config/database.js` | Bug #2: console → logger. |
| `backend/src/config/swagger.js` | Bug #2: console → logger. |
| `backend/src/controllers/absensi.controller.js` | Bug #2 |
| `backend/src/controllers/auth.controller.js` | Bug #2 |
| `backend/src/controllers/dashboard.controller.js` | Bug #2 |
| `backend/src/controllers/laporan.controller.js` | Bug #2 |
| `backend/src/controllers/operasional.controller.js` | Bug #2 |
| `backend/src/controllers/patroli.controller.js` | Bug #2 |
| `backend/src/middleware/auditlog.js` | Bug #2 |
| `backend/src/middleware/driveCDN.js` | Bug #2 |
| `backend/src/routes/backup.routes.js` | Bug #2 |
| `backend/src/routes/data.routes.js` | Bug #6: remove unused `setFolder` import. |
| `backend/src/services/auth.service.js` | Bug #6: remove unused `queryAll` import. |
| `backend/src/services/backup.service.js` | Bug #2 |
| `backend/src/services/data.service.js` | Bug #2 |
| `backend/src/services/fcm.service.js` | Bug #2 |
| `backend/src/services/watermark.service.js` | Bug #2 |
| `backend/src/utils/scope.js` | Bug #2 (1 occurrence; otherwise file kept untouched per project rules) |

### Web Admin (Next.js)

| File | Perubahan |
|---|---|
| `web-admin-next/styles/globals.css` | Bug #4 (P3-11): tambah CSS variables `--brand-dark-bg`, `--brand-dark-surface`, `--brand-dark-text-muted-*`, `--brand-accent-*` untuk dark-theme components. |
| `web-admin-next/app/download/page.tsx` | Bug #4: ganti inline hex (`#0F172A`, `#94A3B8`, dst) dengan `var(--brand-dark-*)`. |
| `web-admin-next/app/(dashboard)/checkpoint/page.tsx` | Bug #4: ganti `'#fff'` (QR background) dengan `var(--card)`. |
| `web-admin-next/components/PWAUpdatePrompt.tsx` | Bug #4: semua hardcoded hex → CSS vars. |

### Repo-level

| File | Perubahan |
|---|---|
| `.gitignore` | Bug #8: expanded — backup files dari workflow tahap, mobile artifacts, `verify/`, `LAPORAN_VERIFIKASI.md`, `TAHAP_*.md` (kecuali `TAHAP_PERBAIKAN_SOPIAK.md`). |
| `.dockerignore` | Bug #8: expanded — sama + `*.zip`, `*.example.env`, `CHANGELOG.md`. |

---

## Console.* yang sengaja dipertahankan

Per spec Bug #2 ("pengecualian"), `console.*` tetap dipakai di:

1. **`backend/src/utils/logger.js`** — logger itu sendiri tidak boleh recursif.
2. **`backend/src/utils/seed.js`, `seed-full.js`** — standalone CLI script, dijalankan terpisah dari backend.
3. **`backend/src/middleware/auth.js`** — top-level `JWT_SECRET` FATAL block. Logger async (write stream) berisiko hilang sebelum `process.exit(1)` flush. Pakai `console.error` (sync) supaya operator pasti lihat di `docker logs`.
4. **`backend/src/utils/bootstrap.js`** — dua blok sengaja:
   - **Seed credentials block**: PIN plain-text tidak boleh ke `logs/app.log` (security regression — `must_change_pin` lifecycle pendek, log files persistent).
   - **Strict-mode FATAL block**: same reason as auth.js (sync stderr before `process.exit(1)`).
5. **`backend/src/app.js`** — 4 blok sengaja:
   - **DB connect FATAL**, **EADDRINUSE FATAL**: sync sebelum `process.exit(1)`.
   - **Startup banner**: operator-facing one-time stdout output, tidak pollute `logs/app.log` dengan ASCII art tiap boot.
   - **Graceful shutdown messages**: same — `process.exit()` imminent.
6. **`backend/src/utils/migrationRunner.js`** — fallback logger stub saat dipanggil dari `database/migrate.js` (standalone, no logger context).
7. **`database/migrate.js`** — standalone CLI, sengaja tidak attach ke `logs/`.

---

## Verifikasi yang sudah dijalankan

- `node --check` di semua `.js` file yang diubah ✓
- `grep -rn "console\." backend/src/ --include="*.js"` — semua hasil match exception list di atas ✓
- `grep -rnE "// (Tahap [0-9]+ fix|HOTFIX:|=+ P[0-9]-[0-9]+|=+ FIX (START|END))"` (Bug #7) — **zero matches** ditemukan; codebase sudah bersih dari bare label comments ✓
- `grep -rn 'style={{.*#[0-9a-f]{3,6}'` di `web-admin-next/` (Bug #4 audit) — 8 cases ditemukan, semua sudah ditangani ✓

## Yang TIDAK diubah (per project rules)

- `backend/src/utils/scope.js` (Tahap 4) — hanya 1 baris console.* yang dikonversi, logic data isolation TIDAK disentuh.
- `docker-compose.yml` (Tahap 5) — Traefik labels permanen, no changes.
- `database/migrations/001_*.sql` s/d `004_*.sql` (sudah jalan di production DB).
- `backend/src/realtime/socketio.js` (Tahap 7) — cookie auth logic, no changes.

---

## Caveats / known limitations

1. **Bug #2 scope**: hanya 16 file yang sebelumnya muncul di `grep "console\."` yang diaudit. Kalau ada file lain dengan `console.*` (terutama yang ditambahkan setelah snapshot zip), perlu dijalankan grep ulang.

2. **Bug #4 scope**: 8 inline hex colors yang grep temukan sudah ditangani. Web-admin masih punya banyak file dashboard lain yang belum di-audit secara eksplisit, tapi grep tidak menemukan hardcoded hex di sana.

3. **Bug #5 migration**: SQL migration 005 ditulis berdasarkan `ptsss_schema_terbaru.sql` (snapshot). 13 FK tables ter-handle (`absensi`, `broadcasts`, `checkpoints`, `geofence_izin`, `geofence_violations`, `jadwal_shift`, `laporan_harian`, `laporan_kejadian`, `panic_alerts`, `pos_jaga`, `report_exports`, `routes`, `users`). Kalau ada tabel baru dengan FK ke `lokasi` yang ditambahkan setelah snapshot, perlu ditambah ke migration.

4. **Bug #6 scope**: hanya 6 file di priority-list yang user sebutkan yang di-audit. Audit menyeluruh untuk dead code di seluruh project belum dilakukan.

5. **Bug #7**: Hasil audit menunjukkan codebase tidak punya bare-label comments tanpa konteks teknis — tidak ada yang perlu dihapus. Semua referensi `Tahap N` / `P0-X` di codebase sudah diintegrasikan dengan penjelasan teknis (per spec: KEEP).

6. **Pre-populated migrations**: `migrationRunner` pre-populate `schema_migrations` dengan SHA256 checksum dari file aktual di `database/migrations/`. Kalau di production DB ternyata file aslinya sudah berbeda dari versi di repo, akan muncul checksum drift warning (bukan error). Operator perlu reconcile manual.

---

## Cara apply

```bash
# 1. Pull update kode
git pull

# 2. Cek diff dan commit
git add .
git status
git commit -m "fix: Tahap 10 — cleanup & hardening final (P1-22, P3-1..P3-11)"
git push

# 3. Coolify auto-deploy via GitHub webhook
#    Bootstrap akan jalankan migration 005 otomatis pada boot pertama setelah deploy.

# 4. (Optional) Verifikasi di server
sudo docker exec postgres-CONTAINER psql -U ptsss_user -d ptsss_db -c \
  "SELECT filename, applied_at FROM schema_migrations ORDER BY id;"
# Harus muncul: 002_must_change_pin, 003_clients_uuid_migration, 004_nrp_case_insensitive, 005_lokasi_constraints
```

Verifikasi pasca-deploy:
```bash
# Backend health
curl https://api.sopiaksatriasaga.com/api/health

# Cek schema_migrations sudah terisi
sudo docker exec postgres-CONTAINER psql -U ptsss_user -d ptsss_db -c \
  "SELECT COUNT(*) FROM schema_migrations"

# Cek lokasi unique constraint
sudo docker exec postgres-CONTAINER psql -U ptsss_user -d ptsss_db -c \
  "\\d+ lokasi" | grep "lokasi_nama_client_unique"

# Cek no duplicates remaining
sudo docker exec postgres-CONTAINER psql -U ptsss_user -d ptsss_db -c \
  "SELECT nama, client_id, COUNT(*) FROM lokasi WHERE client_id IS NOT NULL
   GROUP BY nama, client_id HAVING COUNT(*) > 1"
# Harus 0 rows
```