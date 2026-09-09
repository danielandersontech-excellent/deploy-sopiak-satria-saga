-- =============================================================================
-- MIGRASI 009 — Indeks performa untuk pola query yang paling sering dipakai
-- =============================================================================
-- Audit 2E (2026-09-09): tabel transaksi hanya punya indeks pada user_id
-- (dan idempotency_key), padahal hampir semua query dashboard/web-admin
-- menyaring berdasarkan lokasi_id, status, dan rentang tanggal (created_at /
-- waktu / start_time), lalu ORDER BY created_at DESC. Tanpa indeks ini setiap
-- halaman melakukan seq scan + sort; masih cepat pada ±1.200 baris, tetapi
-- tumbuh linier seiring data absensi/patroli harian.
--
-- Sifat: ADITIF & IDEMPOTEN (IF NOT EXISTS). Tidak mengubah data/kolom.
-- Tanpa BEGIN/COMMIT — runner sudah membungkus dalam transaksi.
-- Tanpa CONCURRENTLY (tidak boleh di dalam transaksi); tabel kecil sehingga
-- kunci singkat saat boot dapat diterima.
--
-- Rollback (bila diperlukan):
--   DROP INDEX IF EXISTS <nama_indeks>;  -- untuk setiap indeks di bawah
-- =============================================================================

-- absensi: filter lokasi/status + rentang tanggal, dashboard harian
CREATE INDEX IF NOT EXISTS idx_absensi_lokasi_waktu ON absensi (lokasi_id, waktu DESC);
CREATE INDEX IF NOT EXISTS idx_absensi_created ON absensi (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_absensi_user_waktu ON absensi (user_id, waktu DESC);

-- laporan harian/kejadian: badge pending, filter status, urut terbaru
CREATE INDEX IF NOT EXISTS idx_laporan_harian_status ON laporan_harian (status);
CREATE INDEX IF NOT EXISTS idx_laporan_harian_lokasi_created ON laporan_harian (lokasi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laporan_harian_tanggal ON laporan_harian (tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_laporan_kejadian_status ON laporan_kejadian (status);
CREATE INDEX IF NOT EXISTS idx_laporan_kejadian_lokasi_created ON laporan_kejadian (lokasi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laporan_kejadian_prioritas ON laporan_kejadian (prioritas);

-- patroli & scan: patroli aktif per user, riwayat per rentang, detail scan
CREATE INDEX IF NOT EXISTS idx_patroli_status ON patroli (status);
CREATE INDEX IF NOT EXISTS idx_patroli_start_time ON patroli (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_patroli_user_status ON patroli (user_id, status);
CREATE INDEX IF NOT EXISTS idx_patroli_route ON patroli (route_id);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_patroli ON patrol_scans (patroli_id, scan_time);
CREATE INDEX IF NOT EXISTS idx_patrol_scans_checkpoint ON patrol_scans (checkpoint_id);

-- panic: alert aktif (dashboard & realtime), riwayat per user/lokasi
CREATE INDEX IF NOT EXISTS idx_panic_status_created ON panic_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_panic_user ON panic_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_panic_lokasi ON panic_alerts (lokasi_id);

-- geofence: izin pending per lokasi, pelanggaran belum ditanggapi
CREATE INDEX IF NOT EXISTS idx_geofence_izin_user_status ON geofence_izin (user_id, status);
CREATE INDEX IF NOT EXISTS idx_geofence_izin_lokasi_created ON geofence_izin (lokasi_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_izin_batas ON geofence_izin (batas_waktu) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_geofence_violations_user ON geofence_violations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_violations_ack ON geofence_violations (acknowledged, created_at DESC);

-- penugasan shift: cek double-booking (user_id+tanggal), jadwal hari ini
CREATE INDEX IF NOT EXISTS idx_shift_assign_user_tanggal ON shift_assignments (user_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_shift_assign_tanggal ON shift_assignments (tanggal);
CREATE INDEX IF NOT EXISTS idx_shift_assign_shift ON shift_assignments (shift_id);

-- notifikasi: daftar belum dibaca per user/role
CREATE INDEX IF NOT EXISTS idx_notifikasi_target_dibaca ON notifikasi (target_user_id, dibaca, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifikasi_role_created ON notifikasi (target_role, created_at DESC);

-- broadcast & serah terima: urut terbaru, filter lokasi
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_lokasi ON broadcasts (lokasi_id);
CREATE INDEX IF NOT EXISTS idx_serah_terima_created ON serah_terima (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_serah_terima_user ON serah_terima (user_id);

-- refresh token: pembersihan token kedaluwarsa (job perawatan harian)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);

-- master data: pencarian per lokasi
CREATE INDEX IF NOT EXISTS idx_checkpoints_lokasi ON checkpoints (lokasi_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_qr ON checkpoints (qr_code);
CREATE INDEX IF NOT EXISTS idx_pos_jaga_lokasi ON pos_jaga (lokasi_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_shift_lokasi ON jadwal_shift (lokasi_id);
CREATE INDEX IF NOT EXISTS idx_routes_lokasi ON routes (lokasi_id);
CREATE INDEX IF NOT EXISTS idx_berkas_personil_user ON berkas_personil (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_nrp_login ON clients (nrp_login);
CREATE INDEX IF NOT EXISTS idx_report_exports_created ON report_exports (created_at DESC);
