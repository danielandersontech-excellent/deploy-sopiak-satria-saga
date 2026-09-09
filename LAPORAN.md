# LAPORAN — Perburuan Bug Total & Penyempurnaan Sistem PT Sopiak Satria Saga

Tanggal pelaksanaan: 9 September 2026 (WIB)
Cakupan: backend, web-admin, website publik, aplikasi mobile, database, konfigurasi server.
Semua nilai rahasia (PASSWORD/SECRET/TOKEN/KEY) disamarkan di laporan ini.

Ringkasan singkat:

| Item | Hasil |
|---|---|
| Commit dibuat | 9 commit dideploy (`73ff3f2`, `8bdbff0`, `8f6692f`, `f1994ef`, `8ea5165`, `7ad0034`, `d991394`, `c2e10ed`, `d7d626b`) + 1 commit mobile `60f3e69` (menunggu EAS build, lihat §5) + commit laporan ini (dokumen saja, tidak perlu deploy) |
| Deploy Coolify | 4 batch, semuanya sukses; `SOURCE_COMMIT` produksi sekarang `d7d626b` |
| Migrasi baru | `008_rekrutmen_pelamar.sql`, `009_indeks_performa.sql` — terpasang di produksi |
| Putaran audit | 2 putaran penuh (putaran 2: pemeriksaan ulang kode + anomali data produksi → 2 perbaikan tambahan) |
| Uji produksi | 24/24 lulus (smoke publik), 18 rute HTTP diperiksa, log backend bersih, job perawatan terverifikasi |
| Uji lokal (salinan DB produksi) | rekrutmen 36/36, backend 2A 43/43 |
| Data uji produksi | Semua dihapus, bukti hitung di §4 |
| Fitur tertunda yang dideploy | Rekrutmen (form publik `/karir` + pengelolaan pelamar di web-admin) |

---

## 1. Baseline (Fase 0) — sebelum perubahan pertama

Diambil 9 Sep 2026 ±10:30 WIB, sebelum commit pertama.

| Pemeriksaan | Hasil |
|---|---|
| Git | `main` @ `8e1c2c8` (sama dengan `SOURCE_COMMIT` container produksi); working tree bersih kecuali `CLAUDE.md` (untracked) |
| Container Sopiak (`*-v13inlgc48aqucujfdpfytgf-*`) | 5 container: backend (healthy), web-admin (healthy), website (healthy), postgres (healthy), pgadmin (up) |
| `GET /api/health` | 200 `{"status":"ok","version":"13.0.0", database.max:10, storage.uploadDir:"/app/uploads"}` |
| `schema_migrations` | 002, 003, 004, 005 (15 Mei 2026), 006, 007 (25 Jun 2026) |
| Env produksi (nama & panjang saja) | `CORS_ORIGIN` memuat ketiga domain; `COOKIE_DOMAIN=.sopiaksatriasaga.com`; `TZ=Asia/Jakarta`; `RATE_LIMIT_BYPASS_SECRET` panjang 0 (kosong); `FIREBASE_*` kosong (push nonaktif — bukan bug) |
| Log backend 30 baris terakhir | Hanya banner boot + access log; tidak ada `error`/`fatal` |
| DB | zona waktu Asia/Jakarta; `clients.id` dan `lokasi.client_id` bertipe uuid; `users_role_check` memuat `klien`; NRP tertinggi `AGT050` |

Jumlah baris per tabel (baseline dan pasca-audit identik untuk tabel data nyata):

| Tabel | Baris | Tabel | Baris |
|---|---|---|---|
| absensi | 1219 | patroli | 99 |
| location_history | 606 | berkas_personil | 96 |
| patrol_scans | 446 | checkpoints | 75 |
| audit_log | 222 | users | 65 |
| shift_assignments | 210 | notifikasi | 61 |
| laporan_harian | 173 | pos_jaga | 45 |
| jadwal_shift | 29 | serah_terima | 27 |
| clients | 21 | lokasi | 21 |
| laporan_kejadian | 19 | routes | 15 |
| geofence_izin | 15 | geofence_violations | 15 |
| broadcasts | 10 | report_exports | 8 |
| panic_alerts | 8 | refresh_tokens | 23 → 0 (token kedaluwarsa dibersihkan job perawatan, lihat §2A) |

Backup (Aturan 3):

```
docker exec postgres-v13… pg_dump -U ptsss_user -Fc ptsss_db -f /tmp/ptsss_backup_20260909.dump
docker cp … ~/backups-sopiak/ptsss_backup_20260909.dump      # salinan di server
scp … backups-local/ptsss_backup_20260909.dump              # salinan lokal (gitignored)
ukuran: 294.612 byte (> 100 KB) ✔
```

Salinan server masih ada di `~/backups-sopiak/` (deployer). Salinan di `/tmp` container hilang saat container dibuat ulang oleh deploy (normal).

Catatan Fase 1: paket fitur Rekrutmen di `Downloads/sopiak-fitur-rekrutmen/` (`_FILES_CHANGED.txt`) **tidak ditemukan** di mesin ini (Downloads, Desktop, Documents, riwayat git). Fitur dibangun ulang dari spesifikasi brief (17 berkas, migrasi 008, private-uploads, rate limit, honeypot, idempotency, jadikan-anggota NRP berikutnya, PIN awal 123456 + `must_change_pin`). Desain akhir dijelaskan di commit `8bdbff0`.

---

## 2. Bug yang ditemukan & diperbaiki

Status verifikasi: **P** = terverifikasi di produksi, **L** = terverifikasi lokal pada salinan DB produksi (`ptsss_audit_test`), **B** = terverifikasi build/analisis statis, **M** = menunggu EAS build (mobile).

### 2A. Backend (`backend/`) — commit `8f6692f` (+ `8bdbff0` untuk modul rekrutmen)

| # | Gejala | Akar masalah | Perbaikan | Verifikasi |
|---|---|---|---|---|
| A1 | Komandan/anggota bisa melihat data lokasi lain via `/api/data/lokasi`, `pos-jaga`, `checkpoints`, `routes`, `jadwal-shift` | `data.service.getAll` tidak memanggil `getScopeFilter/applyLokasiScope` | Scope diterapkan per tabel (`id` untuk lokasi, `lokasi_id` untuk lainnya) | L (43/43) |
| A2 | Filter query string bisa menyaring kolom sembarang / `page`, `limit` dianggap kolom | `BaseRepository.findAll` tidak membedakan kunci reserved | `RESERVED_QUERY_KEYS` dilewati; array → `= ANY($n)`; array kosong → `FALSE` | L |
| A3 | Kolom DATE (`tanggal`, `tanggal_lahir`) dikirim sebagai datetime UTC → tanggal mundur 1 hari di UI | `pg` mem-parse DATE menjadi `Date` lokal | `types.setTypeParser(1082, v => v)` → string `YYYY-MM-DD` | L |
| A4 | Akun `status_penempatan='nonaktif'` masih bisa login sampai token habis; klien Non-Aktif bisa login | Tidak dicek saat login | Login → 401 `ACCOUNT_DEACTIVATED`; klien non-Aktif → 401 | L |
| A5 | Klien tidak pernah mendapat refresh token → sesi mobile klien putus tiap 30 menit | `auth.service` hanya membuat refresh token untuk users | `generateRefreshTokenForClient` + `must_change_pin` di objek klien | L |
| A6 | Daftar laporan: nama pelapor/foto kosong di web-admin & mobile; tidak ada filter tanggal/status/kondisi | Repo tidak mengalias kolom user; filter diabaikan | `laporan.repository` ditulis ulang (alias flat `nama`, `nrp`, `user_foto_url`, `lokasi_nama`, `validated_by_nama`; filter `search/tanggal/start_date/end_date/kondisi/prioritas`; `summary`) | L/P |
| A7 | Komandan lokasi A bisa memvalidasi laporan lokasi B; status validasi bebas | Tidak ada cek scope/status | `_assertCanValidate` (scope + status pending/revision/draft), enum status, validasi kondisi/prioritas; event `laporan:validated` ke user | L |
| A8 | `foto_urls` bukan JSON valid → 500 | `JSON.parse` tanpa guard | `parseFotoUrls` → 400 | L |
| A9 | Absensi: filter `start_date/end_date/search`, ringkasan, alias user hilang; `tipe/status/koordinat` tidak divalidasi | Repo & service minim | `absensi.repository` ditulis ulang (whitelist sort, `summary` total/masuk/keluar/hadir/terlambat/tidak_hadir/luar_radius); validasi di service | L/P |
| A10 | Patroli: anggota bisa melihat patroli orang lain; scan checkpoint milik patroli orang lain diterima; patroli lama menggantung "active" | Tidak ada cek kepemilikan/status; tidak ada penutupan patroli lama | `patroli.service`: anggota → miliknya sendiri; `start` menutup patroli aktif user (`closeActiveByUser`); `scan` validasi kepemilikan/status/checkpoint (403/409/404); `closeStale(hours)` untuk job perawatan | L |
| A11 | Panic/broadcast/serah-terima: `user_id`/`pengirim_id` bisa dipalsukan lewat body; koordinat panic tidak divalidasi; komandan bisa broadcast global; `resolvePanic` tanpa scope & bisa resolve dua kali; `markRead` notifikasi orang lain | `operasional.service` mempercayai body | Ditulis ulang: id dari token, validasi koordinat, komandan dikunci ke lokasinya, resolve → scope + 409 bila tidak aktif, `markReadFor` milik sendiri; controller memakai `e.status` | L |
| A12 | Geofence: approve/reject/ack izin lokasi lain; durasi 0 atau >1 hari diterima; anggota melihat izin semua orang | Tidak ada scope/validasi | `_assertInScope`, durasi 1–1440, anggota dipaksa `user_id` sendiri | L |
| A13 | Socket `join:lokasi` menerima lokasi sembarang → anggota bisa menerima event lokasi lain | Tidak divalidasi | Validasi terhadap scope (lokasi_id staf diambil dari DB) | L |
| A14 | Backup: nama file `../x` bisa menghapus/mengunggah file di luar folder; hasil `pg_dump` tanpa `--clean` → restore ke DB terisi "berhasil" palsu; jadwal backup otomatis hilang tiap redeploy | Path tidak dikurung; opsi pg_dump; jadwal hanya di memori | `safeBackupPath`, `pg_dump --clean --if-exists --no-owner --no-privileges`, jadwal disimpan di `backups/schedule.json` + `loadSchedule` saat boot; audit `BACKUP_DELETE` | L |
| A15 | Export Excel: tanggal tidak divalidasi (rentang tak terbatas), `lokasi_id` bukan uuid → 500, tidak ada scope; `/lokasi-stats` N+1 query | Tidak ada middleware | `exportScope` (validasi tanggal ≤366 hari, uuid, scope → `req.exportScope`); `/lokasi-stats` 4 query agregat, klien diizinkan (terbatas lokasinya) | L |
| A16 | User: role/shift/status bebas; NRP duplikat → 500; admin bisa menonaktifkan/menurunkan dirinya sendiri; hapus admin terakhir | Tidak ada validasi/guard | Enum, NRP unik → 409, guard self-deactivate/self-role, guard hapus diri & admin terakhir, `''` → null untuk uuid/date | L |
| A17 | Tidak ada pembersihan: refresh_tokens kedaluwarsa menumpuk, patroli aktif menggantung (satu sejak 16 Mei 2026), location_history tumbuh tanpa batas | Tidak ada job | `utils/maintenance.js` harian (2 menit setelah boot, lalu 24 jam): hapus token kedaluwarsa, tutup patroli >24 jam (`PATROLI_STALE_HOURS`), pangkas location_history >180 hari (`LOCATION_HISTORY_DAYS`); `MAINTENANCE_ENABLED=false` untuk mematikan | L (`{"refresh_tokens_expired":19,"patroli_ditutup":1,…}`), P (refresh_tokens 23 → 0 pasca-deploy) |
| A18 | Rate limiter umum menghitung per IP saja → semua admin di belakang NAT kantor berbagi kuota | keyGenerator hanya IP | Kunci juga memakai `ptsss_token` (cookie) | B |
| A19 | `fileCleanup` bisa menghapus berkas yang masih dirujuk (kontrak klien, berkas personil, foto serah terima) | Daftar referensi tidak lengkap | Tambah folder `kontrak`,`rekrutmen` ke SKIP; query referensi `clients.path_kontrak_pdf/foto_url`, `users.berkas_*` (8 kolom), `berkas_personil.file_url`, `serah_terima.fotos`, `users.berkas_lainnya` | B |
| A20 | Upload berkas personil ke `personil/<nrp>` ditolak (folder tidak diizinkan) | Whitelist folder tanpa subfolder | `PERSONIL_SUBFOLDER_RE = /^personil\/[A-Za-z0-9_-]{1,30}$/` | L |
| A21 | `all=true` diabaikan oleh pagination → export PDF hanya 20 baris | `utils/pagination.js` | `all=true` → limit hingga `EXPORT_PAGE_SIZE` (5000) | L |
| A22 | Tidak ada endpoint agregat untuk Analytics (web-admin menghitung dari 20 baris) | — | `GET /api/data/dashboard/analytics?days=&lokasi_id=` (absensi, mingguan, laporan, patroli, distribusi role, top performer; scope per peran) | P (401 tanpa token) |
| A23 | Rate limit publik tidak bisa dilewati saat uji otomatis, tetapi bypass berbahaya bila salah konfigurasi | — | `utils/rateLimitBypass.js` fail-closed: aktif hanya bila `RATE_LIMIT_BYPASS_SECRET` ≥16 karakter dan header `x-skip-rate-limit` cocok (timing-safe) | L/P (di produksi kosong → bypass nonaktif) |
| A24 (putaran 2, ditemukan audit mobile) | Setelah user/klien mengganti PIN, `must_change_pin` tetap TRUE → web-admin & mobile terus memaksa "Ganti PIN" di setiap login | `updatePassword` & jalur klien di `changePin` hanya mengubah `pin_hash` | `must_change_pin = FALSE` ikut diset (users & clients) — commit `d7d626b` | P (deploy batch 4, §3.1) |
| A25 (putaran 2) | 8 izin keluar `approved` tidak pernah menjadi `expired` | Lihat E4 | `expireIzin()` di job perawatan — commit `d991394` | P (§3.7) |

Modul Rekrutmen (`8bdbff0`): tabel `rekrutmen_pelamar` (migrasi 008), `POST /api/rekrutmen/publik` (multipart 7 slot berkas ≤5 MB jpg/png/pdf, cek magic bytes, honeypot `website`, idempotency_key, NIK unik → 409, rate limit 5/15 menit/IP), `GET /publik/status`, endpoint admin/supervisor (daftar+ringkasan+detail+ubah status+berkas privat via stream+jadikan anggota NRP `AGT###/KMD###` berikutnya dengan `pg_advisory_xact_lock`, PIN awal `123456` + `must_change_pin`), hapus (admin). Berkas disimpan di `/app/private-uploads` (volume `backend_private_uploads`, di luar folder statis).

### 2B. Web-admin (`web-admin-next/`) — commit `f1994ef` (+ `8bdbff0` halaman `/rekrutmen`)

| # | Halaman | Gejala | Akar masalah | Perbaikan | Verifikasi |
|---|---|---|---|---|---|
| B1 | lokasi | Simpan lokasi dengan klien selalu gagal | `parseInt(client_id)` padahal `clients.id` uuid | Kirim string/null; validasi lat/lng/radius/alamat | B |
| B2 | clients | Klien baru tidak pernah bisa login | `temp_pin` dari respons create diabaikan | Modal PIN sekali-tampil (salin + hitung mundur 120 dtk) | B |
| B3 | personil | PIN awal hanya di toast (hilang 3 detik) | — | Modal PIN + salin NRP&PIN; validasi NRP/HP/KTP/skor; label status Indonesia | B |
| B4 | export | Riwayat export tidak pernah tampil; riwayat "laporan" tidak tercatat | State dimuat tapi tidak dirender; `tipe:'laporan'` melanggar CHECK `report_exports` | Tabel riwayat; pemetaan → `laporan_harian`; validasi rentang ≤366 hari; tanggal lokal | B |
| B5 | lib/reportExport | PDF hanya 20 baris pertama & nama pelapor "-" | Tanpa `all=true`; membaca `r.users.nama` | `all=true&start_date&end_date&lokasi_id`; field flat | B |
| B6 | analytics | Angka kehadiran/insiden salah bila data > 20 baris | Dihitung di browser dari halaman pertama API | Pakai endpoint agregat server (A22), filter periode 7/30/90 hari & lokasi, grid responsif | B |
| B7 | backup | Tidak ada tombol unduh/hapus/jadwal; teks "Laragon"; supervisor dapat 403 saat restore | UI tidak lengkap | Unduh, hapus (konfirmasi), jadwal otomatis (aktif/nonaktif + jam), restore hanya admin, info diperbarui | B |
| B8 | geofence | Tolak izin tanpa alasan; durasi 0 diterima | — | Modal alasan wajib; durasi 1–1440; filter status; paging; error load ditampilkan | B |
| B9 | qr-generator | Stored XSS di jendela cetak (nama/area checkpoint disisipkan mentah) | Tanpa `escapeHtml` | `escapeHtml` pada nama/area/kode; "Generate Semua" menghormati filter lokasi | B |
| B10 | shift-assignment | Tanggal default salah setelah 07:00 WIB; pos jaga tidak sesuai lokasi shift; edit bisa double-booking | `toISOString()` (UTC); tanpa filter; cek clash hanya saat create | `toYMD` lokal; pos jaga mengikuti lokasi shift; cek clash saat edit; pencarian | B |
| B11 | checkpoint/pos-jaga/routes/jadwal | Koordinat kosong disimpan 0,0 (scan selalu di luar radius); rute tanpa checkpoint; nama shift ganda; tanpa status "menyimpan" | Tanpa validasi klien | Validasi selaras server, status menyimpan, reset halaman saat filter, pencarian pos jaga, label Indonesia | B |
| B12 | next.config | Semua foto upload (absensi/laporan/profil) diblokir CSP | `img-src` tanpa domain API | `img-src` + `${apiBase}`, tambah `media-src` | P (header) |
| B13 | lib/api | Sesi putus saat "Token tidak ditemukan"; akun nonaktif berputar-putar tanpa pesan | Refresh hanya pada pesan tertentu | Refresh juga pada pesan itu; 401 tak-terpulihkan → `clearAuth` + `/login?reason=`; `apiFetchPaged`; `authApi.changePin/me`; `backupApi.del` | B |
| B14 | TopBar | Tidak ada cara mengganti PIN dari web; `must_change_pin` diabaikan | Fitur belum ada | Menu pengguna + modal Ganti PIN (dipaksa saat `must_change_pin`) | B |
| B15 | Sidebar | Badge pending dihitung dari 20 baris pertama | — | `pagination.total` dari `apiFetchPaged`; badge rekrutmen baru (`rekrutmen:new`) | B |
| B16 | absensi/laporan/patroli/panic/broadcast/serah-terima | Filter/tanggal tidak bekerja, NRP patroli "-", log scan patroli tidak tampil, inventaris serah terima tidak tampil, validasi tanpa catatan, tombol tanpa status | Halaman memakai bentuk respons lama | Ditulis ulang: pagination+filter server, ringkasan status, detail lengkap, preview foto, konfirmasi | B |
| B17 | login | Tidak ada pesan alasan redirect; redirect terbuka | — | Tampilkan `reason`, hanya redirect internal, tombol nonaktif saat proses | B |
| B18 | globals.css | Grid `2fr 1fr` inline pecah di layar ≤900px | Inline style | Kelas `.grid-2/.grid-2-1/.grid-1-2/.stat-grid` responsif, `.btn:disabled`, `.animate-pulse` | B |
| B19 | clients (putaran 2, `c2e10ed`) | 12 klien Aktif dengan kontrak sudah habis tanpa penanda | Tidak ada indikator | Badge "Habis" (merah) / sisa hari (kuning ≤30 hari) di kolom Kontrak; data tidak diubah otomatis | P (deploy batch 3) |

Commit web-admin: `f1994ef` (putaran 1), `c2e10ed` (putaran 2). Pemeriksaan ulang putaran 2 (grep): tidak ada sisa pola `r.users?.nama` sebagai sumber utama, `parseInt(client_id)`, atau `toISOString().split` untuk tanggal.

### 2C. Website (`website/`) — commit `8bdbff0` (keamanan) & `7ad0034`

| # | Gejala | Akar masalah | Perbaikan | Verifikasi |
|---|---|---|---|---|
| C1 | Tidak ada favicon (tab kosong, `favicon.ico` 404) | Aset belum ada | `app/icon.png` (128px) + `app/apple-icon.png` (180px) dari logo resmi | P (`/icon.png` 200, 6.973 B) |
| C2 | Logo navbar 317 KB (619×717) dimuat tiap kunjungan untuk tampilan 42px | Aset asli dipakai langsung | `ptsss-logo-nav.png` 160px (11 KB); aset asli dipertahankan | P (`/image/ptsss-logo-nav.png` 200, 11.443 B) |
| C3 | Header `x-powered-by: Next.js` bocor; tanpa header keamanan | Konfigurasi default | `poweredByHeader:false`; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | P (header terverifikasi) |
| C4 | Tidak ada halaman karir/rekrutmen | Fitur tertunda | `/karir` (info posisi/syarat/benefit/alur, form 7 berkas dengan validasi langsung, honeypot, idempotency, layar sukses + nomor referensi, Cek Status), tautan nav & footer | P (`/karir` 200) |
| — | Audit tautan internal | — | Semua `href` internal (`/`, `/profil`, `/karir`, `/layanan/<slug>`, anchor beranda) mengarah ke rute yang ada | B |

### 2D. Mobile (`src/`, `App.tsx`) — lihat §5 (commit terpisah, menunggu EAS build)

### 2E. Database — commit `8bdbff0` (008) & `8ea5165` (009)

| # | Gejala | Akar masalah | Perbaikan | Verifikasi |
|---|---|---|---|---|
| E1 | Query dashboard/web-admin seq scan + sort pada tabel transaksi | Hanya indeks `user_id`/`idempotency_key` | Migrasi `009_indeks_performa.sql`: 40 indeks `IF NOT EXISTS` (absensi lokasi/waktu/created, laporan status/lokasi/tanggal/prioritas, patroli status/start/user+status/route, patrol_scans patroli/checkpoint, panic, geofence, shift_assignments user+tanggal, notifikasi, broadcast, serah terima, refresh_tokens.expires_at, master data). Rollback: `DROP INDEX IF EXISTS …` | L (migrate.js Applied 1/Skipped 7), P (`schema_migrations` #8, `idx_*` = 66) |
| E2 | Tabel rekrutmen belum ada | Fitur baru | Migrasi 008 (juga ditambahkan ke `database/ptsss_db.sql` untuk instalasi baru) | P (#7, 11:19 WIB) |
| E3 | Patroli `13660996-…` berstatus active sejak 16 Mei 2026 | Tidak ada penutupan otomatis | Ditutup oleh job perawatan (A17) — tidak ada perubahan data manual | P (`patroli active = 0`) |
| E4 | 8 izin keluar berstatus `approved` dengan `batas_waktu` Mei 2026 (web-admin/mobile terus menampilkan "Disetujui") | Status kedaluwarsa hanya dihitung on-the-fly di `geofence.service`, baris tidak pernah diubah | Commit `d991394`: `expireIzin()` di job perawatan (tiap `IZIN_EXPIRE_MINUTES`=10 menit + harian) → `status='expired'`. Rollback: `UPDATE geofence_izin SET status='approved' WHERE id IN ('f48c5220-ef5a-457a-8954-68bd44d139c3','c37b681e-5c92-4ecf-b924-354b42e1e28a','ed0ca2bf-2ae0-49fd-881c-875a15978887','18312453-7111-428a-8026-360c45d0b3a9','6a49f0b7-4390-44ae-b8ff-a46e345bb60c','a8548842-e04d-4032-97d5-e51c24ce7b4c','27d53044-178c-4450-ba7e-8abee5255f98','426dd97f-d956-45c7-8448-3589fe43c7c4')` | P (lihat §3.7) |

Pemeriksaan anomali data putaran ke-2 (read-only, 12:2x WIB) — semua 0 kecuali yang disebut: personil ditempatkan tanpa lokasi 0; lokasi client_id yatim 0; checkpoint/pos jaga koordinat kosong 0; absensi masa depan 0; patroli aktif 0; panic aktif 0; penugasan shift ganda 0; rute dengan checkpoint yatim 0. Temuan yang **tidak diubah** (data bisnis, perlu keputusan admin): 12 klien berstatus Aktif dengan kontrak sudah habis (KK-006 sejak 14 Apr 2025 … KK-009 31 Agu 2026) → kini diberi badge "Habis" di halaman Klien (`c2e10ed`); 30 laporan harian `pending` berusia >30 hari (belum divalidasi komandan) → tampak di badge/filter Menunggu.
| — | Peringatan checksum drift migrasi 002–005 (file diedit setelah diterapkan, sebelum misi ini) | Riwayat lama | **Tidak diubah** (Aturan 2). Usulan di §6 | — |

Tidak ada koreksi data manual yang dilakukan (tidak ada data yang jelas rusak).

### 2F. Server & konfigurasi

| # | Temuan | Status |
|---|---|---|
| F1 | `RATE_LIMIT_BYPASS_SECRET` kosong di produksi → bypass nonaktif (aman), tetapi uji otomatis di produksi terkena limit 5/15 menit | Menunggu user (§7) |
| F2 | Volume `backend_private_uploads` belum ada | Ditambahkan di `docker-compose.yml` (satu-satunya perubahan compose yang diizinkan) — terpasang di `/app/private-uploads`, owner `ptsss` |
| F3 | Env baru (`PRIVATE_UPLOAD_DIR`, `REKRUTMEN_RATE_*`, `MAINTENANCE_ENABLED`, `PATROLI_STALE_HOURS`, `LOCATION_HISTORY_DAYS`, `EXPORT_PAGE_SIZE`) tidak ada di compose | Sengaja: semua punya default aman; didokumentasikan di `backend/.env.example`. `verify/env-audit.js` menandainya sebagai peringatan (bukan gagal) |
| F4 | Log akses: `access.log` 8,5 MB + 6 rotasi × 10 MB (68 MB, volume `backend-logs` 71 MB) | Normal; rotasi berjalan. Disk server 9% terpakai (16 G / 193 G), RAM 2,5 G / 16 G |
| F5 | Semua container `restart: unless-stopped`, healthcheck aktif, tanpa batas memori | Cukup untuk beban saat ini; usulan batas memori di §8 |
| F6 | Web-admin tidak punya konfigurasi ESLint (`npm run lint` interaktif) | Usulan di §6 |
| F7 | pgAdmin terekspos lewat Traefik (`SERVICE_FQDN_PGADMIN`) | Tidak diubah (di luar cakupan compose); rekomendasi di §8 |

### 2G. Celah fungsional kecil yang diimplementasikan

Ganti PIN dari web-admin (B14), jadwal backup persisten + UI (A14/B7), riwayat export (B4), analytics server-side (A22/B6), job perawatan harian (A17), filter & ringkasan di semua daftar (B16), badge pelamar baru (B15).

### 2H. Laporan pengguna

Tidak ada laporan masuk selama misi.

---

## 3. Hasil uji produksi (Fase 4)

### 3.1 Deploy

| Batch | Commit | Dipicu | Selesai (3 image bertag baru, healthy) | Hasil |
|---|---|---|---|---|
| 1 | `8bdbff0` (rekrutmen) | 11:16 WIB | ±11:19 WIB (migrasi 008 11:19:15) | Sukses |
| 2 | `8f6692f`, `f1994ef`, `8ea5165`, `7ad0034` | 12:09:07 WIB (`deployment_uuid iivwiu4sl29cg9kbazvndurw`) | ±12:11 WIB (migrasi 009 12:10:51) | Sukses |
| 3 (putaran audit ke-2) | `d991394`, `c2e10ed` | 12:30:44 WIB (`deployment_uuid lqamjnlgp5yj1js9f5hhrqk3`) | 12:34 WIB | Sukses — health 200, `/karir` 200, `/login` 200, tidak ada `error/fatal` di log |
| 4 (putaran audit ke-2) | `d7d626b` (+ `60f3e69` mobile, tidak dibangun Coolify) | 12:40:10 WIB (`deployment_uuid npkizi2v8m7cg1l0pta2h4e5`) | 12:42 WIB | Sukses — health 200, `/api/health` `/login` `/karir` 200, log bersih |

Pemantauan: `docker ps --format '{{.Names}} {{.Image}} {{.Status}} ' | grep v13` setiap 30 detik. Catatan: hanya 3 container (backend, web-admin, website) memakai image bertag commit; postgres & pgadmin memakai image stok.

### 3.2 Pemeriksaan pasca-deploy (12:19 WIB)

```
$ docker exec backend-v13… wget -qO- http://127.0.0.1:3000/api/health
{"status":"ok","time":"2026-09-09T05:19:02.598Z","version":"13.0.0","realtime":{"engine":"socket.io","online":0},
 "database":{"totalConnections":0,"idleConnections":0,"waitingClients":0,"max":10},
 "storage":{"totalFiles":2,"totalSizeMB":0.15,"uploadDir":"/app/uploads"}}

$ psql … -c "SELECT * FROM schema_migrations ORDER BY 1"
7|008_rekrutmen_pelamar.sql|2026-09-09 11:19:15+07
8|009_indeks_performa.sql |2026-09-09 12:10:51+07

$ docker inspect backend-v13… (Mounts)  → /app/private-uploads v13inlgc48aqucujfdpfytgf_backend-private-uploads
$ docker exec backend-v13… ls -ld /app/private-uploads → drwxr-xr-x ptsss ptsss

$ docker logs backend-v13… --since 2026-09-09T05:08:00Z | grep -iE 'error|fatal'   → (kosong)
$ docker ps | grep v13 → 5 container Up, backend/web-admin/website/postgres (healthy)
```

### 3.3 Rute HTTP publik (curl, 12:19 WIB)

| Kode | URL | Catatan |
|---|---|---|
| 200 | https://sopiaksatriasaga.com/ | 81 KB |
| 200 | https://sopiaksatriasaga.com/karir | halaman rekrutmen |
| 200 | https://sopiaksatriasaga.com/profil | |
| 200 | https://sopiaksatriasaga.com/layanan/pengamanan-gedung | |
| 200 | https://sopiaksatriasaga.com/icon.png | favicon baru, 6.973 B |
| 200 | https://sopiaksatriasaga.com/apple-icon.png | 11.659 B |
| 200 | https://sopiaksatriasaga.com/image/ptsss-logo-nav.png | 11.443 B |
| 200 | https://hq.sopiaksatriasaga.com/login | web-admin |
| 200 | https://hq.sopiaksatriasaga.com/ | (middleware → login) |
| 200 | https://api.sopiaksatriasaga.com/api/health | |
| 401 | /api/rekrutmen, /api/rekrutmen/ringkasan, /api/data/dashboard/analytics, /api/export/absensi?…, /api/backup/list, /api/users | tanpa token |
| 404 | https://api.sopiaksatriasaga.com/uploads/rekrutmen/x.png | berkas privat tidak disajikan statis |
| 404 | /api/rekrutmen/publik/status?nomor=REK-00000000-XXXXX&nik=0000000000000000 | |

Header website: `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()`, tanpa `x-powered-by`.
Header API: `strict-transport-security: max-age=31536000; includeSubDomains; preload`, `ratelimit-limit: 200` (per 60 dtk), `x-frame-options`, `x-content-type-options`.

### 3.4 Smoke test rekrutmen & sampel 401 (produksi, `prod_smoke.sh`, 12:20 WIB) — 24/24 lulus

```
== P1. POST publik valid (7 berkas) ==            [PASS] 201   nomor_referensi=REK-20260909-ZR9NS
== P2. POST ulang idempotency sama ==             [PASS] 201   [PASS] nomor sama (REK-20260909-ZR9NS)
== P3. NIK sama, key beda ==                      [PASS] 409   {"error":"NIK ini sudah terdaftar dengan nomor referensi REK-20260909-ZR9NS. …"}
== P4. Honeypot terisi ==                         [PASS] 201 (palsu, tanpa baris)
== P5. NIK 15 digit ==                            [PASS] 400   {"error":"Validasi gagal","details":["NIK harus 16 digit angka"]}
== P6. Cek status publik ==                       [PASS] 200   {"nomor_referensi":"REK-20260909-ZR9NS","nama":"UJI SISTEM - HAPUS","status":"baru",…}
                                                  [PASS] 404   (NIK salah)
== P7. Berkas privat & admin ==                   [PASS] 404 /uploads/rekrutmen/x ; [PASS] 401 ×4 endpoint admin
== P8. Sampel 401 tanpa token ==                  [PASS] 401 ×10 (absensi, laporan, patroli, panic, geofence, clients, lokasi, backup, export, dashboard)
                                                  [PASS] 401 login NRP tidak ada
RINGKASAN: PASS=24 FAIL=0
```

Uji yang sama pada batch 1 (11:2x WIB): 201 `REK-20260909-XBJ9F`, 409 NIK dup, honeypot 201 tanpa baris, status 200, uploads 404, admin 401 — lulus semua.

### 3.5 Uji lokal pada salinan DB produksi (bukan produksi)

- `test_rekrutmen.sh` (alur penuh termasuk admin: daftar, detail, stream berkas, traversal ditolak, ubah status, jadikan-anggota → `AGT051`/PIN `123456`/`must_change_pin=true`, login anggota baru, hapus oleh supervisor 403 / admin 200, rate limit ke-6 → 429): **36/36 lulus**.
- `test_2a.sh` (scope per peran, validasi, anti-spoof, backup path, export, user guard, patroli/scan, geofence): **43/43 lulus**.
- Job perawatan: `{"refresh_tokens_expired":19,"patroli_ditutup":1,"location_history_dihapus":0}`.

### 3.6 Regresi & gate sebelum push

`cd web-admin-next && npm run build` ✔ (29 halaman) · `cd website && npm run build` ✔ (14 halaman) · `node --check` seluruh berkas backend yang diubah ✔ · `node verify/run-all.js` ✔ (5/5) · `node verify-fixes.js` ✔ (25 PASS).

### 3.7 Pasca-deploy batch 3 (putaran audit ke-2, 12:37 WIB)

```
$ docker exec backend-v13… grep -i maintenance /app/logs/app.log | tail -2
[2026-09-09T05:35:59.680Z] [INFO] [Maintenance] izin kedaluwarsa ditandai expired: 8
[2026-09-09T05:35:59.707Z] [INFO] [Maintenance] Selesai: {"refresh_tokens_expired":0,"izin_expired":8,"patroli_ditutup":0,"location_history_dihapus":0}

$ psql … "SELECT count(*) FROM geofence_izin WHERE status='approved' AND batas_waktu<now()" → 0   (sebelumnya 8)
$ psql … "SELECT status,count(*) FROM geofence_izin GROUP BY 1" → expired=9, pending=2, rejected=2, returned=2
$ docker logs backend-v13… --since 2026-09-09T05:33:00Z | grep -iE 'error|fatal' → (kosong)
$ tail /app/logs/error.log → hanya 2 baris WARN "[Rekrutmen] Honeypot terisi" (keduanya dari uji saya 11:23 & 12:20 WIB) + 1 WARN CORS lama (28 Jul)
```

### 3.8 Daftar uji manual (tidak ada kredensial admin produksi yang diberikan)

Login sebagai admin di https://hq.sopiaksatriasaga.com lalu periksa:

1. Menu **Rekrutmen**: badge "baru", daftar/ringkasan, detail + tombol lihat berkas (foto/KTP/CV), ubah status dengan catatan, **Jadikan Anggota** (NRP berikutnya, PIN 123456), hapus (admin).
2. **Lokasi**: buat/edit lokasi dengan klien terpilih (dulu gagal), peta klik → koordinat terisi.
3. **Klien**: tambah klien → modal PIN muncul sekali; Reset PIN.
4. **Personil**: tambah personil → modal NRP+PIN; upload foto/berkas; filter role/lokasi; pencarian.
5. **Absensi/Laporan/Patroli**: filter tanggal & status, ringkasan chip, detail patroli menampilkan log scan, foto tampil (CSP).
6. **Laporan**: validasi Setujui/Revisi/Tolak dengan catatan (komandan hanya lokasinya).
7. **Export**: Excel (server) & PDF (browser) 30 hari; riwayat export bertambah.
8. **Analytics**: angka berubah saat periode 7/30/90 & lokasi diganti.
9. **Backup**: Buat backup → unduh → jadwal otomatis aktif 02:00 → tetap aktif setelah refresh halaman.
10. **Geofence**: tolak izin → modal alasan wajib.
11. **Menu pengguna (kanan atas) → Ganti PIN**; login dengan akun `must_change_pin` → modal dipaksa.
12. **QR Generator**: Print Semua dengan filter lokasi.
13. Login akun `nonaktif` → pesan "Akun dinonaktifkan" di halaman login.

---

## 4. Bukti pembersihan data uji di produksi (Aturan 5)

Data uji: pelamar `UJI SISTEM - HAPUS` (NIK 3271012345670001/…0002), berkas privat, notifikasi & audit log terkait. Tidak ada user uji yang dibuat di produksi (jadikan-anggota hanya diuji lokal).

Batch 1 (`REK-20260909-XBJ9F`, 11:3x WIB):

```
SEBELUM: rekrutmen_pelamar(uji)=1 | notifikasi(uji)=1 | berkas privat=6
SESUDAH: rekrutmen_pelamar(uji)=0 | notifikasi(uji)=0 | berkas privat=0 | audit_log(uji)=0
```

Batch 2 (`REK-20260909-ZR9NS`, 12:2x WIB, `prod_cleanup.sh` + `prod_cleanup2.sh`):

```
=== SEBELUM ===
pelamar_uji=1  pelamar_total=1  notif_uji=1  audit_uji=1  files_before=7
=== HAPUS ===
rm rekrutmen/202609/895dc208-….pdf, 7b95c4f0-….png, 5b1232c1-….png, b1a79019-….png,
   bb644a02-….png, 5f8f6114-….png, caad6aa0-….png
DELETE FROM notifikasi …  → DELETE 1
DELETE FROM audit_log  …  → DELETE 1
DELETE FROM rekrutmen_pelamar WHERE nama='UJI SISTEM - HAPUS' OR nik IN (…) → DELETE 1
=== SESUDAH ===
pelamar_uji=0  pelamar_total=0  notif_uji=0  audit_uji_after=0  files_after=0  users_uji=0
```

Verifikasi akhir (12:22 WIB): `rekrutmen_pelamar=0`, `users=65`, `clients=21`, `absensi=1219` — tidak ada baris uji tersisa; jumlah data nyata tidak berubah dari baseline.

Sisa artefak audit di luar data aplikasi (bukan data uji):
- DB scratch `ptsss_audit_test` + role `audit_test` di Postgres produksi (salinan restore dari backup, dipakai uji lokal) — **dihapus di akhir misi** (lihat catatan penutup §4.1).
- `~/backups-sopiak/ptsss_backup_20260909.dump` di server — sengaja dipertahankan sebagai cadangan (hapus bila tidak diperlukan).

### 4.1 Penutupan lingkungan uji (12:24 WIB)

```
$ psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='ptsss_audit_test'" → 0
$ psql -c 'DROP DATABASE IF EXISTS ptsss_audit_test' -c 'DROP ROLE IF EXISTS audit_test'
DROP DATABASE
DROP ROLE
$ psql -c "SELECT datname FROM pg_database WHERE datname LIKE 'ptsss%'" → ptsss_db (hanya DB produksi)
$ psql -c "SELECT rolname FROM pg_roles WHERE rolname LIKE 'audit%'" → (kosong)
$ psql -c "SELECT count(*) FROM users" → 65 (tidak berubah)
```

Backend uji lokal (port 3100) dan SSH tunnel (15432) dihentikan. Berkas uji lokal hanya ada di scratchpad sesi (di luar repo).

---

## 5. Perubahan mobile yang menunggu EAS build

Commit terpisah: **`60f3e69` `fix(mobile): audit 2D - … (menunggu EAS build)`** — 26 berkas di `src/`, +404/−85 baris, line ending per berkas dipertahankan. **Belum live**: Coolify tidak membangun aplikasi mobile; perubahan berlaku setelah EAS build & pembaruan di HP. Versi mobile lama tetap kompatibel dengan backend baru (bentuk respons array/flat dipertahankan), tetapi bug di bawah ini masih ada di build lama.

| # | Berkas | Gejala di HP (build lama) | Akar masalah | Perbaikan |
|---|---|---|---|---|
| M1 | `komandan/BroadcastPesanScreen.tsx`, `stores/dataStore.ts` | Broadcast dari HP selalu gagal ("Target tidak valid") | Mengirim `target: "Semua Anggota (Lokasi X)"`; backend memvalidasi enum | Kirim `all`/`anggota`; label shift menjadi awalan judul |
| M2 | `dataStore.ts addRoute`, `supervisor/SetupRuteScreen.tsx` | Rute baru "berhasil" tapi hilang saat refresh | `POST /data/routes` tanpa `lokasi_id` → 400, error ditelan (UI optimistik) | `addRoute` async: `lokasi_id` dari checkpoint terpilih, rollback + pesan error; `updateRoute` kirim field lengkap |
| M3 | `dataStore.ts`, `MonitorRealtimeScreen.tsx`, `TambahEditUserScreen.tsx` | Tim terpotong 25 orang; cek NRP duplikat tidak jalan | `GET /users` berhalaman | `all=true`, bongkar `{data}`, NRP case-insensitive |
| M4 | `supervisor/JadwalShiftScreen.tsx` | Penugasan shift mundur 1 hari setelah 07:00 WIB | `toISOString()` (UTC) | `toLocalYMD()`; tampilkan `details` validasi |
| M5 | `supervisor/AnalyticsScreen.tsx` | Grafik mingguan geser hari; absensi mentok 20; patroli menarik seluruh tabel | Tanggal UTC; `rows.length` halaman 20; bentuk respons patroli | Tanggal lokal; `summary` server; patroli mingguan via `all=true&start_date&end_date` |
| M6 | `klien/AktivitasKlienScreen.tsx`, `klien/DownloadLaporanScreen.tsx` | Tab/laporan Patroli klien kosong; nama "Petugas" | Baris patroli kini flat (`user_lokasi_id`, `nama`) | Baca field flat |
| M7 | `komandan/DashboardKomandanScreen.tsx` | Status absen komandan selalu "belum" | Perbandingan format tanggal berbeda (UTC vs "DD MMM YYYY") | Parse kedua format, bandingkan hari lokal |
| M8 | `lib/apiClient.ts` | Setelah refresh token, lokasi/foto/shift hilang (restore offline rusak) | `/auth/refresh` mengembalikan user ringkas yang menimpa cache | Merge di atas user tersimpan |
| M9 | `lib/apiClient.ts`, `navigation/AppNavigator.tsx`, `stores/authStore.ts` | Sesi mati / akun nonaktif → terjebak di layar dengan semua request gagal | Token dihapus diam-diam; `ACCOUNT_DEACTIVATED` tak dikenali | `setSessionExpiredHandler`: logout + reset ke Login + Alert (sekali per sesi) |
| M10 | `anggota/LoginScreen.tsx`, `shared/UbahPINScreen.tsx` | PIN awal/reset terus dipakai | `must_change_pin` diabaikan | Setelah login → layar Ubah PIN + Alert; setelah ganti → flag lokal padam |
| M11 | `anggota/LaporanHarianScreen.tsx`, `DashboardScreen.tsx`, `AbsensiScreen.tsx` | Pos jaga selalu "Pos Utama"; avatar kosong | Membaca `posJaga`/`foto` yang tak pernah diisi | `pos_nama → posJaga → posList → '-'`; `foto_url` |
| M12 | `dataStore.ts addNotifikasi/markRead` | Request 403/400 sia-sia tiap aksi | Backend menolak notif untuk orang lain & id lokal non-UUID | Dilewati bila pasti ditolak |
| M13 | `dataStore.ts deactivatePanic` | Panic sendiri kadang tak ter-resolve | Loop resolve milik rekan (403) berhenti di error pertama | Non-komando hanya milik sendiri; error per item tidak menghentikan |
| M14 | `dataStore.ts fmtDate`, `shared/RiwayatLaporanScreen.tsx` | Tanggal tampil mentah `2026-09-09` / bergeser | Kolom DATE kini string `YYYY-MM-DD` | Parse lokal → "DD MMM YYYY" |
| M15 | `dataStore.ts` (absensi) | Filter lokasi komandan/klien meleset untuk absensi lama tanpa `lokasi_id` | — | `lokasiId = lokasi_id ‖ user_lokasi_id` |
| M16 | `komandan/ValidasiLaporanScreen.tsx` | Laporan pending lama tak muncul | Default 20 baris | `limit=100` |
| M17 | `anggota/PanicButtonScreen.tsx` | Interval "tahan tombol" bocor; setState setelah unmount | Tanpa cleanup | `mountedRef` + clear interval |
| M18 | `services/pushNotificationManager.ts`, `AppNavigator.tsx`, `services/locationService.ts`, `anggota/ProfilScreen.tsx` | Klien: error push-token/lokasi/profil berulang tiap resume | Endpoint personil dipanggil untuk klien (`client-…` tidak ada di `users`) | Dilewati untuk `role==='klien'`; profil via `/auth/me` |
| M19 | `hooks/useRealtimeSync.ts` | Status laporan anggota tidak auto-refresh | Event `laporan:validated` dibuang | Ditambahkan |
| M20 | `lib/apiClient.ts`, `services/offlineSync.ts` | 502/503/504 saat deploy dianggap penolakan permanen; `details` validasi hilang | Pesan HTML tidak dikenali | Error membawa `status`+`details`; 502/503/504 retriable, pesan Indonesia |

Verifikasi lokal: `node verify-fixes.js` 25 PASS (termasuk asersi `AppNavigator` satu `DownloadLaporan`), `node verify/run-all.js` PASS, `npx tsc --noEmit` → 4 error **lama** (sudah ada sebelum perubahan: `AnalyticsScreen.tsx`/`services/excelExport.ts` tipe `expo-file-system/legacy`), tidak ada error baru.

Daftar verifikasi manual di HP setelah EAS build:

1. Komandan → Broadcast ("Semua Anggota" & "Shift Pagi") → sukses dan tampil di web-admin dengan target `all`/`anggota`.
2. Supervisor → Setup Rute → buat & duplikat rute → pull-to-refresh, rute tetap ada; checkpoint tanpa lokasi → pesan error jelas.
3. Supervisor → Jadwal Shift setelah pukul 17:00 WIB → tanggal tersimpan sama dengan web-admin.
4. Analytics → grafik 7 hari tidak bergeser; total patroli = web-admin.
5. Klien → tab Patroli & Laporan Patroli terisi; Profil tidak error; sesi bertahan >30 menit (refresh token klien).
6. Login dengan PIN awal / hasil reset → langsung ke Ubah PIN; setelah ganti, prompt tidak muncul lagi (butuh backend batch 4, lihat A24).
7. Nonaktifkan akun dari web-admin saat HP aktif → HP kembali ke Login dengan alert "Akun Dinonaktifkan".
8. Lokasi >25 personil → Monitor Realtime/Manajemen Pengguna menampilkan semua.
9. Laporan Harian → kolom Pos Jaga menampilkan pos nyata.
10. Mode pesawat: absensi/laporan/panic → antrian → online → tersinkron sekali (tanpa duplikat).

Temuan mobile yang **tidak** diperbaiki (usulan, lihat §6): klien tidak bisa Edit Profil (`PUT /users/client-…` 404 — butuh endpoint profil klien); `dataStore.updateCheckpoint/deleteCheckpoint/updateLokasi/updateTeamMember` masih optimistik tanpa penanganan error (perubahan lebih luas); antrian `patrol_scan` 409 "belum tersinkron" dihitung sebagai retry; pesan `apiClient` bernada dev ("Backend belum dijalankan… npm run dev"); `roleGuard.SCREEN_PERMISSIONS` tidak memuat `klien` untuk `UbahPIN/Notifikasi/TentangAplikasi` (tidak berdampak).

---

## 6. Usulan fitur / perubahan yang butuh persetujuan

1. **Redesain notifikasi**: satu flag `dibaca` per baris untuk notifikasi ber-`target_role` berarti satu orang membaca → hilang untuk semua. Usulan tabel `notifikasi_dibaca(notifikasi_id, user_id)` (migrasi aditif) + endpoint baru.
2. **Refresh checksum migrasi 002–005** di `schema_migrations` agar peringatan drift hilang: `UPDATE schema_migrations SET checksum='<sha256 file saat ini>' WHERE filename='00X_…'` (rollback: simpan nilai lama dulu). Tidak dilakukan karena menyentuh riwayat migrasi (Aturan 2).
3. **Perbarui `database/ptsss_db.sql`** untuk instalasi baru: masih memakai `clients.id integer` (migrasi 003 memperbaikinya saat boot, tetapi lebih bersih bila skema dasar sudah uuid). Tidak berdampak pada produksi.
4. **`clients.path_kontrak_pdf` seed** (`/contracts/KK-0xx…`) mengarah ke berkas yang tidak ada — perlu unggah ulang kontrak asli lewat halaman Klien (koreksi data oleh admin, bukan skrip).
5. **Push notification (FCM)**: kode siap, hanya perlu `FIREBASE_*` di Coolify bila diinginkan.
6. **CSP untuk website publik**: memungkinkan setelah daftar sumber Google Fonts/Maps difinalkan.
7. **Konfigurasi ESLint web-admin** (`.eslintrc.json` `next/core-web-vitals`) + jalankan `next lint` di gate.
8. **Uji otomatis**: skrip `test_2a.sh`/`test_rekrutmen.sh` (lokal) layak dimasukkan ke repo sebagai `backend/tests/` (butuh keputusan lokasi & kredensial uji).
9. **Batas memori container** di compose (mis. backend 512 MB, postgres 1 GB) — perubahan compose di luar izin misi ini.
10. **pgAdmin**: pertimbangkan menonaktifkan ekspos publik (hanya via SSH tunnel) — perubahan compose/Traefik, di luar izin.
11. **Endpoint profil klien** (`PUT /api/auth/me` untuk klien) agar klien bisa mengubah kontak dari mobile (saat ini `PUT /users/client-…` 404).
12. **Mobile — pola optimistik**: `dataStore.updateCheckpoint/deleteCheckpoint/updateLokasi/updateTeamMember` masih menelan error (pola sama dengan bug rute M2); layak mengembalikan `SubmitResult` (perubahan lebih luas, perlu QA di HP).
13. **Mobile — antrian offline**: scan patroli yang mendapat 409 "patroli belum tersinkron" sebaiknya tidak dihitung sebagai kegagalan retry (maks 7) agar tidak masuk dead-letter saat `patrol_start` tertunda lama.
14. **Mobile — pesan dev** di `apiClient` ("Backend belum dijalankan… npm run dev") diganti pesan produksi; `roleGuard.SCREEN_PERMISSIONS` tambah `klien` untuk `UbahPIN/Notifikasi/TentangAplikasi`.

---

## 7. Menunggu tindakan pengguna

1. **Set `RATE_LIMIT_BYPASS_SECRET`** di Coolify (Environment Variables backend) dengan string acak ≥32 karakter (mis. `openssl rand -hex 32`), lalu **Redeploy**. Nilai tidak boleh dicommit. Setelah itu uji otomatis dapat mengirim header `X-Skip-Rate-Limit: <nilai>`.
2. **EAS build** untuk aplikasi mobile dari commit `60f3e69` atau yang lebih baru (§5) — perubahan mobile **belum live**; jalankan `node verify-fixes.js` sebelum build.
3. **Verifikasi visual di HP** (Android/iOS): alur login (termasuk klien & `must_change_pin`), absensi, laporan, patroli/scan, panic, izin keluar, sinkronisasi offline; lihat daftar di §5.
4. **Uji manual web-admin** dengan akun admin (§3.8) — tidak ada kredensial admin produksi yang diberikan kepada saya, sehingga alur ber-login hanya diuji lokal.
5. (Opsional) Hapus `~/backups-sopiak/ptsss_backup_20260909.dump` di server bila cadangan sudah disalin ke tempat lain.
6. (Opsional) Aktifkan **Backup otomatis** di menu Backup (jam 02:00) dan unduh berkala.

---

## 8. Rekomendasi pemeliharaan

1. **Backup**: aktifkan jadwal harian di web-admin, unduh mingguan ke penyimpanan di luar VPS (Drive/S3); lakukan uji restore ke DB scratch (`pg_restore -d ptsss_audit_test`) tiap kuartal.
2. **Sebelum deploy**: snapshot VPS (seperti misi ini), jalankan gate lokal (build web-admin & website, `node verify/run-all.js`, `node verify-fixes.js`), commit kecil, pantau `docker ps` + `docker logs --since 10m | grep -iE 'error|fatal'` setelah deploy.
3. **Migrasi**: selalu aditif, `IF NOT EXISTS`, tanpa `BEGIN/COMMIT`, uji dengan `NODE_PATH=backend/node_modules node database/migrate.js` pada salinan DB sebelum push. Jangan edit 002–009.
4. **Pemantauan**: cek `/api/health` (uptime monitor eksternal), ukuran `backend-logs` (rotasi 10 MB × 6 sudah berjalan), `location_history` (dipangkas otomatis >180 hari), patroli menggantung (ditutup otomatis >24 jam).
5. **Keamanan**: rotasi `JWT_SECRET` bila ada indikasi kebocoran (semua sesi logout), tinjau daftar admin (`SELECT nrp,nama FROM users WHERE role='admin'`), pertimbangkan menutup pgAdmin publik, perbarui dependensi (`npm audit`) tiap kuartal, aktifkan 2FA GitHub & Coolify.
6. **Data**: minta admin melengkapi koordinat checkpoint/pos jaga yang masih 0,0 (kini dicegah untuk data baru), unggah ulang PDF kontrak klien, nonaktifkan personil keluar lewat `status_penempatan='nonaktif'` alih-alih menghapus.
7. **Mobile**: setelah EAS build, dorong pembaruan ke semua HP; versi lama masih kompatibel dengan backend (respons array/flat dipertahankan), tetapi perbaikan §5 hanya berlaku di build baru.
