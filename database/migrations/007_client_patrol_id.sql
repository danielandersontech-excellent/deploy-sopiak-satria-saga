-- Migration 007: client_patrol_id untuk Patroli Offline-Capable (Fase 4 [4-2])
--
-- Saat patroli dimulai dalam mode offline, klien belum punya server PK (id)
-- patroli. Klien membuat referensi lokal stabil `client_patrol_id` dan
-- mengirimnya bersama start/scan/end. Backend memakai kolom ini untuk
-- MENAUTKAN scan & end ke patroli yang benar setelah start tersinkron —
-- tanpa mengubah PK (id tetap uuid server).
--
-- Kolom nullable + unique index PARSIAL (hanya untuk baris yang punya nilai)
-- → SEMUA baris patroli lama tetap valid (client_patrol_id = NULL).
-- IF NOT EXISTS → idempotent, aman dijalankan ulang. JANGAN edit migrasi lama.
--
-- CATATAN TRANSAKSI: TANPA BEGIN/COMMIT eksplisit — migrationRunner (applyOne)
-- sudah membungkus migrasi ini dalam satu transaksi. Lihat catatan di 006.

ALTER TABLE patroli ADD COLUMN IF NOT EXISTS client_patrol_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_patroli_client_patrol_id
  ON patroli (client_patrol_id) WHERE client_patrol_id IS NOT NULL;
