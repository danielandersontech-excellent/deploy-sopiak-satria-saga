# Uji API Backend (`backend/tests/`)

Uji ini **menulis data** (membuat laporan, memvalidasi massal, mengubah kontak klien
lalu memulihkannya). Jalankan HANYA terhadap **salinan** database — jangan ke produksi.
Skrip menolak URL `*.sopiaksatriasaga.com` kecuali `TEST_ALLOW_PROD=1`.

## Cara menjalankan (lokal, DB salinan)

1. Siapkan DB salinan dari backup produksi (contoh di Postgres lokal/Docker):

   ```bash
   createdb -U postgres ptsss_audit_test
   pg_restore -U postgres -d ptsss_audit_test --no-owner --no-privileges backups-local/ptsss_backup_YYYYMMDD.dump
   ```

2. Buat akun uji di DB salinan (PIN `123456`, cost 10). Hash di bawah adalah bcrypt
   dari `123456`; gunakan **file SQL** (bukan argumen shell) agar `$` tidak diekspansi:

   ```sql
   INSERT INTO users (nrp, nama, role, pin_hash, must_change_pin, status_penempatan, shift) VALUES
     ('TESTADM','Uji Admin','admin','$2a$10$iM/m67k/JyXkFIPBLKu/muCgJ940kzVOioOatKAQ8n2WiIM2I7UsO',false,'belum_ditempatkan','08:00-16:00');
   INSERT INTO users (nrp, nama, role, pin_hash, must_change_pin, lokasi_id, status_penempatan, shift)
     SELECT 'TESTKMD','Uji Komandan','komandan','$2a$10$iM/m67k/JyXkFIPBLKu/muCgJ940kzVOioOatKAQ8n2WiIM2I7UsO',false,(SELECT id FROM lokasi LIMIT 1),'ditempatkan','08:00-16:00';
   INSERT INTO users (nrp, nama, role, pin_hash, must_change_pin, lokasi_id, status_penempatan, shift)
     SELECT 'TESTAGT','Uji Anggota','anggota','$2a$10$iM/m67k/JyXkFIPBLKu/muCgJ940kzVOioOatKAQ8n2WiIM2I7UsO',false,(SELECT id FROM lokasi LIMIT 1),'ditempatkan','08:00-16:00';
   -- satu klien aktif dengan PIN 123456 (ganti kode_klien sesuai data):
   UPDATE clients SET pin_hash='$2a$10$iM/m67k/JyXkFIPBLKu/muCgJ940kzVOioOatKAQ8n2WiIM2I7UsO', must_change_pin=false WHERE kode_klien='KK-001';
   ```

3. Jalankan backend uji di port lain dengan env yang menunjuk ke DB salinan
   (`NODE_ENV=development`, `PORT=3100`, `DB_*` salinan, `JWT_SECRET` acak ≥32 karakter,
   `BCRYPT_ROUNDS=10`, `MAINTENANCE_ENABLED=false`, `AUTO_BOOTSTRAP=schema-only`,
   `RATE_LIMIT_BYPASS_SECRET=<string uji ≥16 karakter>`):

   ```bash
   cd backend && PORT=3100 DB_NAME=ptsss_audit_test ... node src/app.js
   ```

4. Jalankan uji:

   ```bash
   cd backend
   TEST_API_URL=http://127.0.0.1:3100 TEST_BYPASS_SECRET=<string uji> npm run test:api
   ```

   Variabel opsional: `TEST_ADMIN_NRP/PIN`, `TEST_KOMANDAN_NRP/PIN`, `TEST_ANGGOTA_NRP/PIN`,
   `TEST_KLIEN_NRP/PIN` (default `TESTADM/TESTKMD/TESTAGT/KK-001` dengan PIN `123456`).

Keluaran: daftar `[PASS]/[FAIL]` per kasus + `RINGKASAN: PASS=n FAIL=m`; kode keluar 1 bila ada
yang gagal — cocok dipakai sebagai gerbang sebelum push.

## `api-flow.js` — alur lintas-form (`npm run test:flow`)

Admin buat lokasi → pos jaga → checkpoint → rute → tugaskan anggota → anggota absen (idempotency
tidak menggandakan) → absensi tampil di lokasi (admin) tetapi TIDAK bagi komandan lokasi lain (scope)
→ patroli start/scan/end (scan dengan `client_patrol_id` yang belum tersinkron → 409) → hapus data
master yang sudah dirujuk riwayat → **409 dengan pesan jelas** (bukan 500), lalu dinonaktifkan;
`qr_code` duplikat → 409. Menyisakan absensi/patroli uji + lokasi/rute/checkpoint nonaktif di DB salinan.

## Cakupan `api-smoke.js`

- Health (`pin_hash_pool`, `database.max`), login user & klien, PIN salah/NRP tak ada/PIN kosong,
  `refresh_token` ada, `pin_hash` tidak bocor, 401 tanpa token.
- `GET/PUT /api/auth/me` klien (403 untuk anggota, validasi email, pulihkan nilai asal).
- Laporan harian: filter `min_age_days`, kolom `umur_hari`, `summary`/`pagination`; validasi massal
  (`403` anggota, `400` id kosong/bukan uuid/revisi tanpa catatan, `200` komandan dengan rincian
  berhasil/gagal, `409` validasi ulang).
- Notifikasi: dibuat otomatis saat laporan divalidasi (`data.entity/id`), `read-all`, klien tidak
  bisa menandai notifikasi orang lain (404) dan `GET` klien tidak 500.
- Dashboard: `kontrak_habis`, `kontrak_hampir_habis`, `pending_lama` (komandan → `kontrak_habis` 0).
- Rekrutmen publik: status tidak ada → 404. Bypass rate limit hanya dengan secret benar.

## Catatan

- `npm test` (jest) tetap tersedia tetapi belum memiliki berkas uji; `test:api` adalah uji
  integrasi black-box terhadap server yang berjalan.
- Skrip lama audit (`test_2a.sh`, `test_rekrutmen.sh`) hidup di scratchpad sesi audit dan
  digantikan oleh skrip ini agar masuk repo tanpa kredensial.
