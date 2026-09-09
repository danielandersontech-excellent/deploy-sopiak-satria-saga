-- Migration 008: Modul Rekrutmen — tabel pelamar dari formulir publik website (/karir)
--
-- Alur: calon anggota mengisi formulir di sopiaksatriasaga.com/karir → backend
-- menyimpan data + berkas (berkas disimpan di folder PRIVAT di luar /uploads
-- statis, hanya bisa diunduh admin/supervisor lewat endpoint ber-auth) →
-- admin memproses di web-admin (/rekrutmen) → "Jadikan Anggota" membuat akun
-- users dengan NRP AGT berikutnya, PIN awal 123456, must_change_pin = TRUE.
--
-- Semua perintah memakai IF NOT EXISTS / pengecekan pg_constraint → migrasi
-- idempotent & aman dijalankan ulang. JANGAN mengedit file migrasi lama.
--
-- CATATAN TRANSAKSI: TANPA BEGIN/COMMIT eksplisit — migrationRunner (applyOne)
-- sudah membungkus migrasi ini dalam satu transaksi. Lihat catatan di 006.

CREATE TABLE IF NOT EXISTS rekrutmen_pelamar (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nomor_referensi  text NOT NULL,
    nik              text NOT NULL,
    nama             text NOT NULL,
    jenis_kelamin    text NOT NULL DEFAULT 'L',
    tempat_lahir     text,
    tanggal_lahir    date,
    no_hp            text NOT NULL,
    email            text,
    alamat           text,
    pendidikan       text,
    tinggi_badan     integer,
    berat_badan      integer,
    pengalaman       text,
    posisi_dilamar   text NOT NULL DEFAULT 'anggota',
    lokasi_preferensi text,
    catatan          text,
    -- Peta berkas: { "ktp": { "path": "...", "nama_asli": "...", "ukuran": 123, "mime": "image/jpeg" }, ... }
    -- path RELATIF terhadap PRIVATE_UPLOAD_DIR (bukan URL publik).
    berkas           jsonb NOT NULL DEFAULT '{}'::jsonb,
    status           text NOT NULL DEFAULT 'baru',
    catatan_admin    text,
    diproses_oleh    uuid,
    diproses_at      timestamp with time zone,
    -- Terisi setelah "Jadikan Anggota" (akun users yang dibuat dari pelamar ini).
    user_id          uuid,
    -- Idempotency: klien (browser) mengirim key acak per pengisian formulir;
    -- pengiriman ulang (double-click / retry jaringan) tidak membuat baris ganda.
    idempotency_key  text,
    ip_address       text,
    user_agent       text,
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT rekrutmen_pelamar_status_check
        CHECK (status = ANY (ARRAY['baru'::text, 'diproses'::text, 'wawancara'::text, 'diterima'::text, 'ditolak'::text, 'dibatalkan'::text])),
    CONSTRAINT rekrutmen_pelamar_jk_check
        CHECK (jenis_kelamin = ANY (ARRAY['L'::text, 'P'::text])),
    CONSTRAINT rekrutmen_pelamar_nik_check
        CHECK (nik ~ '^[0-9]{16}$'),
    CONSTRAINT rekrutmen_pelamar_posisi_check
        CHECK (posisi_dilamar = ANY (ARRAY['anggota'::text, 'komandan'::text]))
);

-- Nomor referensi unik (ditampilkan ke pelamar sebagai bukti pendaftaran).
CREATE UNIQUE INDEX IF NOT EXISTS ux_rekrutmen_nomor
  ON rekrutmen_pelamar (nomor_referensi);

-- Satu NIK hanya boleh mendaftar sekali (pendaftaran ulang dengan NIK sama → 409).
-- Admin dapat menghapus lamaran lama bila pelamar perlu mendaftar ulang.
CREATE UNIQUE INDEX IF NOT EXISTS ux_rekrutmen_nik
  ON rekrutmen_pelamar (nik);

-- Unique index PARSIAL untuk idempotency (pola sama dengan migrasi 006).
CREATE UNIQUE INDEX IF NOT EXISTS ux_rekrutmen_idem
  ON rekrutmen_pelamar (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rekrutmen_status
  ON rekrutmen_pelamar (status);

CREATE INDEX IF NOT EXISTS idx_rekrutmen_created
  ON rekrutmen_pelamar (created_at DESC);

-- FK ke users (ON DELETE SET NULL agar riwayat lamaran tetap ada bila akun
-- admin/anggota terkait dihapus). ADD CONSTRAINT tidak punya IF NOT EXISTS,
-- jadi dicek lewat pg_constraint agar idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rekrutmen_pelamar_diproses_oleh_fkey') THEN
    ALTER TABLE rekrutmen_pelamar
      ADD CONSTRAINT rekrutmen_pelamar_diproses_oleh_fkey
      FOREIGN KEY (diproses_oleh) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rekrutmen_pelamar_user_id_fkey') THEN
    ALTER TABLE rekrutmen_pelamar
      ADD CONSTRAINT rekrutmen_pelamar_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
