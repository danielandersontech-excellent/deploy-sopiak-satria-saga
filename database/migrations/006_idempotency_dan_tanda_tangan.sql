-- Migration 006: Idempotency keys + Tanda Tangan Serah Terima (Fase 3)
--
-- [3-2] Idempotency: kolom idempotency_key (nullable) + UNIQUE INDEX PARSIAL
--        (hanya untuk baris yang punya key) pada semua tabel submit yang bisa
--        di-replay dari antrian offline. Kolom nullable → SEMUA baris lama
--        tetap valid (idempotency_key = NULL, tidak kena unique index parsial).
-- [3-3] Tanda tangan serah terima disimpan sebagai data URI (TEXT), nullable →
--        baris serah_terima lama tetap valid (tampil tanpa tanda tangan).
--
-- Semua perintah memakai IF NOT EXISTS → migrasi idempotent & aman dijalankan
-- ulang. JANGAN mengedit file migrasi lama.

BEGIN;

-- ============ [3-2] idempotency_key ============
ALTER TABLE absensi          ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE laporan_harian   ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE laporan_kejadian ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE patrol_scans     ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE panic_alerts     ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE serah_terima     ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique index PARSIAL: mencegah duplikat hanya bila key diisi. Baris lama
-- (key NULL) tidak diindeks → tidak ada bentrok pada data historis.
CREATE UNIQUE INDEX IF NOT EXISTS ux_absensi_idem
  ON absensi (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_laporan_harian_idem
  ON laporan_harian (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_laporan_kejadian_idem
  ON laporan_kejadian (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_patrol_scans_idem
  ON patrol_scans (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_panic_alerts_idem
  ON panic_alerts (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_serah_terima_idem
  ON serah_terima (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============ [3-3] tanda tangan serah terima ============
ALTER TABLE serah_terima ADD COLUMN IF NOT EXISTS tanda_tangan TEXT;

COMMIT;
