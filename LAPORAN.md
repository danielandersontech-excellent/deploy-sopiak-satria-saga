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

> **Pembaruan Misi V3 (9 Sep 2026 15:22 WIB):** EAS build Android profil `preview` dari commit `252b2a5` (mencakup `60f3e69` + seluruh perubahan mobile Misi V3) **selesai** — build: https://expo.dev/accounts/danielandersontech/projects/sopiak-satria-saga/builds/392c075d-2ba8-4e94-b0ac-cb2ec292f4f8 · APK: https://expo.dev/artifacts/eas/YOOJnX-3tpsA6DQ1RdkHH3VJRyrFxYoEpsGfS2EjONA.apk . Perubahan di bagian ini baru berlaku setelah APK dipasang di HP. Daftar uji tambahan di V3.11.

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

1. **Set `RATE_LIMIT_BYPASS_SECRET`** di Coolify (Environment Variables backend) dengan string acak ≥32 karakter (mis. `openssl rand -hex 32`), lalu **Redeploy**. Nilai tidak boleh dicommit. Setelah itu uji otomatis dapat mengirim header `X-Skip-Rate-Limit: <nilai>`. — **SELESAI di Misi V3 (9 Sep 2026 13:41 WIB), lihat V3.1.**
2. **EAS build** untuk aplikasi mobile dari commit `60f3e69` atau yang lebih baru (§5) — perubahan mobile **belum live**; jalankan `node verify-fixes.js` sebelum build. — **Dijalankan di Misi V3, lihat V3.10.**
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

---

# MISI LANJUTAN V3 — Tuntaskan Semua (9 September 2026, 13:30–selesai WIB)

Semua nilai rahasia disamarkan. Aturan keras misi sebelumnya dipatuhi; satu pelonggaran baru (edit `docker-compose.yml` Sopiak) dipakai hanya untuk batas memori.

## V3.0 Ringkasan

| Item | Hasil |
|---|---|
| Commit | 18 commit kode (14 dideploy Coolify, 4 mobile "menunggu EAS build") + 1 commit laporan — daftar di V3.9 |
| Deploy Coolify | 5 batch sukses (env saja; B1+D2; B2/C/D3/D4; B3/D5/E/409; putaran-2 UI) — semua health 200, log bersih. Catatan: push ke `main` juga memicu auto-deploy webhook Coolify (terlihat deploy `3e4457b` tanpa pemicu manual) |
| Login | bcrypt dipindah ke worker thread: 5 login paralel 1.590 → 711 ms, 10 paralel 1.266 ms; health 3 ms saat bcrypt sibuk; IP klien asli tercatat (bukan IP Cloudflare) |
| UI | web-admin 29 halaman + website 7 rute diseragamkan (token tunggal, badge/peran/status terpadu, komponen bersama) |
| Form | inventaris 40+ form web-admin & 16 layar mobile; perbaikan P1/P2 (lihat V3.4) |
| Perkakas bisnis | Klien: filter kontrak, Perpanjang, Nonaktifkan (konfirmasi keras); Laporan: penanda umur, filter >30 hari, validasi massal, pengingat harian komandan; kartu peringatan dashboard |
| Usulan §6 | 8/8 dieksekusi (D1 ternyata tidak perlu perubahan; D8 = rekomendasi, menunggu keputusan) |
| Uji otomatis | `backend/tests/api-smoke.js` 50/50 + `api-flow.js` 33/33 terhadap salinan DB produksi; bug nyata ditemukan & diperbaiki (klien notifikasi 500; hapus data master 500) |
| Data uji produksi | Tidak ada baris uji dibuat di produksi (semua uji ber-login di DB salinan `ptsss_audit_test`, dihapus di akhir — V3.8) |

## V3.1 FASE A — `RATE_LIMIT_BYPASS_SECRET`

| Langkah | Bukti |
|---|---|
| Generate | `ssh … openssl rand -hex 32` → 64 hex, dialirkan langsung ke API (tidak pernah ditampilkan/ditulis ke repo) |
| Coolify API | Token write+deploy tanpa read (semua GET → 403). Resource bertipe *application*. `POST /api/v1/applications/{uuid}/envs` → 409 "already exists" (variabel sudah ada, kosong) → `PATCH …/envs` body `{key,value,is_preview:false,is_literal:true,is_multiline:false}` → **201** (`is_runtime:true`, `updated_at 06:36:55Z`). Catatan: field `is_build_time` ditolak 422 |
| Redeploy | `deployment_uuid p68ieuh1dbifehddshihynz1` 13:37 WIB → container baru 13:41 WIB |
| Verifikasi | `docker exec backend sh -c 'test -n "$RATE_LIMIT_BYPASS_SECRET" && echo ADA'` → **ADA len=64**; 12× `POST /api/auth/refresh` header **salah** (koneksi sama) → 401×10 lalu **429×2** (limit 10/menit tetap tegak); 12× header **benar** → 401×12, tidak pernah 429 (bypass bekerja) |

Status §7 no. 1 sebelumnya: **selesai**.

## V3.2 FASE B1 — Login lambat: pengukuran → akar → perbaikan → pengukuran ulang

Pengukuran (9 Sep 2026, 13:4x WIB, sebelum perbaikan; produksi `8c99eca`):

| Jalur | Hasil |
|---|---|
| Eksternal via Cloudflare → login NRP ada + PIN salah (jalur bcrypt), 6× | total 0,49–0,86 s (TLS 0,12–0,28 s; TTFB 0,49–0,86 s) |
| Eksternal via Cloudflare → NRP tidak ada (DB saja), 4× | total 0,29–0,49 s |
| Eksternal via Cloudflare → `/api/health` (baseline jaringan), 4× | total 0,37–0,48 s |
| Host server via Traefik saja (tanpa Cloudflare), 4× | total 0,32–0,36 s |
| Dalam container (node fetch), NRP ada / tidak ada | **307–417 ms** / **4–7 ms** |
| `bcryptjs.compareSync` cost 12 di container | **301 ms** rata-rata |
| 5 login paralel di container | **1.590 ms** total (terserialisasi: bcryptjs berjalan di thread utama) |
| Web-admin `/login` SSR langsung ke container / via Cloudflare | **4–6 ms** / 0,37–0,67 s; JS 431 KB (7 chunk) |
| Mobile pasca-login | `LoginScreen` menunggu `loadAllData` = 12 request paralel + 1 sekuensial sebelum pindah layar |
| Pool DB | `waitingClients: 0` sepanjang pengujian |

Akar yang terbukti:
1. **bcryptjs (JavaScript murni) cost 12 = ±300 ms CPU di thread utama** → login beruntun (ganti shift) antre satu per satu, dan SEMUA request lain (absensi, health, socket) ikut tertahan. Ini penyebab "kadang sangat lambat".
2. **IP klien = IP edge Cloudflare**: Traefik menimpa `X-Forwarded-For`, sehingga rate limit login 50/15 menit "per IP" dibagi oleh semua pengguna di PoP yang sama → 429 kolektif saat ramai; access log tidak berguna untuk forensik.
3. **Mobile menunggu 13 request** (±0,3–0,5 s tiap request lewat Cloudflare) sebelum masuk beranda.
4. Bukan penyebab: SSR web-admin (4–6 ms), pool DB, query login (5 ms), Traefik (+10 ms). Hop Cloudflare menambah 150–500 ms per request (di luar kendali aplikasi; jitter sesekali >2 s teramati — server tetap 307 ms).

Perbaikan (commit `37bb0f0`, `5c8610f`):

| # | Berkas | Perubahan |
|---|---|---|
| B1-1 | `backend/src/utils/pinHash.js` + `pinHash.worker.js` | Pool `worker_threads` (bawaan Node, tanpa dependensi) untuk bcrypt compare/hash; ukuran default min(4, CPU−1)=3; fail-safe kembali ke thread utama; `PIN_HASH_WORKERS` (0 = mati) |
| B1-2 | `services/auth.service.js` | `comparePin/hashPin`; tahapan login diukur (`logger.debug` per tahap; `WARN "Login lambat"` bila > `SLOW_LOGIN_MS`=1500 ms — instrumentasi permanen di level debug, tanpa PIN); `last_seen` fire-and-forget |
| B1-3 | `middleware/clientIp.js` | `req.ip` = `CF-Connecting-IP` **hanya bila** peer terbukti dalam rentang IP Cloudflare (fail-closed); dipakai rate limiter, morgan, audit |
| B1-4 | `utils/ipKey.js`, `app.js`, `publicLimit.js` | Kunci limiter seragam; `/api/health` menampilkan `pin_hash_pool` & IP asli |
| B1-5 | `utils/logger.js` | Level `debug` (`LOG_LEVEL=debug`) |
| B1-6 | mobile `LoginScreen.tsx` | `loadAllData` berjalan di latar; layar berpindah segera setelah PIN benar (menunggu EAS) |
| B1-7 | `data.service`, `rekrutmen.service`, `data.routes` | Hash PIN lewat pool |

Pengukuran ulang (setelah deploy `81ea5a8`, 13:57 WIB):

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| 1 login (dalam container) | 307–417 ms | 314–412 ms (per-login tetap ±300 ms bcrypt; cost 12 dipertahankan) |
| 5 login paralel | **1.590 ms** | **711 ms** |
| 10 login paralel | (ekstrapolasi ±3.200 ms) | **1.266 ms** |
| `/api/health` saat 3 bcrypt berjalan | ikut terblokir ±300 ms | **3 ms** |
| IP di access.log | 104.22.x / 162.158.x (Cloudflare) | IP pengguna asli (IPv4/IPv6) |
| Eksternal via Cloudflare (6×) | 0,49–0,86 s | 0,57–0,82 s (dominan jaringan Cloudflare; 1 outlier 2,3 s = jaringan, server 307 ms) |
| `pin_hash_pool` | — | `{enabled:true,size:3,failures:0}` |

Usulan lanjutan (tidak dilakukan karena mengubah postur keamanan): `BCRYPT_ROUNDS=11` akan memangkas per-login ±150 ms; keputusan pemilik.

## V3.3 FASE B2 — Penyeragaman UI total

Inventaris (agen, 23 halaman web-admin + login + komponen) menemukan penyimpangan terkonsentrasi; perbaikan (commit `c142821`, `c4cbc42`, `7442c91`):

| Halaman/komponen | Sebelum | Sesudah |
|---|---|---|
| `styles/design-tokens.css` vs `globals.css` | Dua keluarga token paralel (`--brand-primary`/`--bg-primary`/`--text-primary` vs `--primary`/`--bg`/`--text`) dengan nilai berbeda & saling menimpa | `design-tokens.css` = alias ke token kanonik `globals.css`; satu sumber warna |
| `globals.css` | — | Kelas bersama baru: `.floating-prompt`, `.image-preview-overlay`, `.dropdown-menu/.icon-badge`, `.notif-*`, `.alert-grid/.alert-card`, `.skeleton-row`, `.bulk-bar/.check-cell`, `.form-help/.form-error/.is-invalid`, `.confirm-danger-note`, `.error-page/.error-card`, `.pin-display`, util `.text-*`, `.badge-primary/.badge-lg`, `.btn-block/.btn-warning` |
| `lib/formatters.ts` | Status rekrutmen & klien di luar peta; peran tanpa peta | `statusColor/statusLabel` lengkap (baru/diproses/wawancara/diterima/ditolak/dibatalkan, Aktif/Non-Aktif/Blacklist), `roleColor/roleLabel`, `daysUntil/ageDays/fmtRupiah/fmtDateLong` |
| personil | 3 pemetaan warna peran berbeda (tabel/grid/modal), `badge-primary` tak terdefinisi, PIN inline hex | satu `roleColor`, `.pin-display`, `.text-danger` |
| rekrutmen | `STATUS[]`/`statusBadge` lokal | formatter bersama |
| analytics | palet hex hardcode + tooltip gelap permanen (salah di tema terang) | `hooks/useThemeColors.ts` membaca token CSS → grafik ikut tema |
| clients | fallback hex usang (`#1a5276`, `#d97706`, `#dc2626`) | token murni, `.pin-display` |
| login | `<button>` polos | `.btn .btn-primary .btn-block` |
| routes | tanpa Pagination (semua rute dirender) | `Pagination` 15/halaman seperti halaman setipe |
| live-map | loading teks polos | skeleton `.animate-pulse .skeleton-row` |
| qr-generator | empty state inline | `.empty-row` |
| laporan-harian/kejadian, patroli, serah-terima | 4 salinan overlay pratinjau foto | `components/ui/ImagePreview.tsx` (Esc/klik menutup) |
| InstallPrompt, PWAUpdatePrompt | 100 % inline, token lama, toast gelap permanen | `.floating-prompt` + `.btn` (ikut tema) |
| unauthorized, 404 | inline / 404 bawaan Next | `.error-page/.error-card`; `app/not-found.tsx` ramah |
| TopBar | inline style, bel hanya tautan /panic, klien tak bisa Ganti PIN | kelas `.topbar-*`, panel notifikasi (V3.6), Ganti PIN untuk klien + mode wajib |
| dashboard | tanggal manual | `fmtDateLong`; kartu peringatan (V3.5) |
| Judul tab | semua "PT Sopiak Satria Saga" | `lib/pageTitles.ts` → "Laporan Harian · PT Sopiak Satria Saga" |
| Responsif | breakpoint 768/480/375 sudah ada | dipertahankan; komponen baru memakai grid auto-fit |

Website (agen; commit `0952f8d`): CTA tombol pill+hover JS → `.btn-primary/.btn-outline/.btn-whatsapp`; label section 3 komponen → `.section-label.centered/.gold`; ±90 hex ikon lucide → `var(--token)`; footer brand memakai token & kelas navbar; form Contact: label per field + tombol disabled+spinner "Mengirim..."; grid Contact/Hero/ServiceDetail inline → kelas; CSS mati dihapus; breakpoint ≤380px; `app/not-found.tsx` (Navbar+Footer). `npm run build` 7 rute; `check-boundaries` lolos. Tidak diubah: logika/API form /karir, warna khas per layanan.

Gerbang: `npm run build` web-admin 29 halaman ✔ (×3), website 7 rute ✔, `next lint` 0 error (4 `no-unescaped-entities` diperbaiki), `verify/run-all.js` 5/5 ✔.

## V3.4 FASE B3 — Sapuan form (2 putaran: inventaris → perbaikan → uji ulang)

Inventaris web-admin (agen, 40 form) — semua form sudah punya anti-dobel & toast error; temuan yang diperbaiki (commit `30ebfc7`):

| Prioritas | Temuan | Perbaikan |
|---|---|---|
| P1 | Validasi massal: catatan revisi/tolak "nyangkut" ke aksi Setujui berikutnya | `bulkCatatan` direset saat ganti aksi/batal |
| P1 | Restore DB (aksi paling destruktif) hanya konfirmasi standar | `ConfirmDialog` ketik `RESTORE` + catatan risiko + `busy`, dialog terbuka sampai selesai, daftar dimuat ulang |
| P1 | `ConfirmDialog` tanpa `busy` di 10 lokasi (tidak ada indikator memproses) | `busy={saving}` diteruskan (lokasi, checkpoint, jadwal, personil, pos-jaga, rekrutmen, routes, shift-assignment, panic, reset PIN klien, hapus backup) |
| P1 | Alasan tolak izin min 3 vs skema backend 5 | min 5 |
| P2 | Tidak ada Enter-to-submit di hampir semua modal; tidak ada Esc; tidak ada autofocus | Diselesaikan **sekali di `Modal.tsx`**: Esc menutup, fokus otomatis field pertama, Enter di `<input>` memicu tombol utama footer; `ConfirmDialog`: Esc batal / Enter konfirmasi |
| P2 | Dropdown pendukung gagal dimuat → `catch {}` diam | toast peringatan (checkpoint, routes, pos-jaga, jadwal, shift-assignment, qr-generator) |
| P2 (usulan) | `label` tanpa `htmlFor` (aksesibilitas) | Belum — lihat V3.10 |

Uji alur lintas-form end-to-end (`backend/tests/api-flow.js`, 33 kasus, DB salinan): buat lokasi → pos → checkpoint → rute → tugaskan personil → absensi (idempotency tidak menggandakan) → tampil di daftar lokasi (admin) tetapi **tidak** bagi komandan lokasi lain → patroli start/scan/end → pembersihan. Putaran 1 menemukan **bug produksi**: hapus rute/checkpoint/lokasi yang masih dirujuk riwayat → **500 "Internal server error"**; kini **409** "tidak bisa dihapus karena masih dipakai … ubah statusnya menjadi nonaktif" dan pelanggaran UNIQUE → 409 "sudah dipakai" (commit `86ca743`). Putaran 2: **33/33 PASS**, smoke **50/50 PASS**.

Inventaris mobile (agen, 16 layar) → perbaikan (commit `3e4457b`, 14 berkas, menunggu EAS build):

| Prioritas | Temuan | Perbaikan |
|---|---|---|
| P1 | "Simpan Draft" Laporan Kejadian hanya Alert, tidak menyimpan apa pun | Draft nyata ke AsyncStorage per user (`@ptsss_draft_laporan_kejadian_<userId>`), dimuat otomatis, dihapus setelah kirim/queued; foto tidak ikut (dijelaskan di Alert) |
| P1 | `startPatrol/scanCheckpoint/endPatrol` fire-and-forget (`.catch(console.error)`) → "Checkpoint Berhasil!" palsu, status offline tak terlihat | Kini `Promise<SubmitResult>`; layar QR/Patroli: sukses → berhasil, `queued` → "Tersimpan Offline", ditolak server → Alert + checkpoint TIDAK ditandai & bisa scan ulang; start yang ditolak membatalkan patroli lokal |
| P1 | Tambah/Edit User hanya `err.message` ("Validasi gagal") | `details` validasi server ditampilkan |
| P2 | `details` hilang di EditProfil (non-klien), SetupCheckpoint, ManajemenLokasi (pos jaga), UbahPIN | ditambahkan |
| P2 | `maxLength` Broadcast 120/2000 & Laporan Harian 500 lebih ketat dari server (200/5000, 2000) | diselaraskan; target/prioritas broadcast direset setelah sukses |
| P2 | Keyboard: tanpa `KeyboardAvoidingView` (LaporanKejadian, SerahTerima, TambahEditUser, modal revisi Validasi), PIN login tanpa `onSubmitEditing`, input manual QR tanpa submit | dilengkapi; SerahTerima `loading={submitting}` |

Verifikasi: `npx tsc --noEmit` hanya 4 error lama (`expo-file-system/legacy`), `node verify-fixes.js` 25 PASS, CRLF/LF per berkas dijaga (diperiksa byte-level).

## V3.5 FASE C — Dua "keputusan bisnis" → perkakas (tanpa perubahan data massal)

| Kebutuhan | Backend | Web-admin | Mobile |
|---|---|---|---|
| Kontrak habis (12 klien) | `dashboard/stats`: `kontrak_habis`, `kontrak_hampir_habis` (≤30 hari; hanya admin/supervisor) | Klien: filter "Kontrak Habis / ≤30 hari / Berjalan / Tanpa tanggal", ringkasan "N habis · M hampir", badge "Habis N hr"/"Sisa N hr", aksi **Perpanjang Kontrak** (modal tanggal, default +1 tahun, validasi), **Nonaktifkan** (ketik kode klien; penjelasan: klien tidak bisa login, sesi putus ≤30 menit, data tetap) & **Aktifkan kembali**; dashboard kartu "N kontrak klien sudah habis" → `/clients?filter=kontrak-habis` | — |
| Laporan pending >30 hari (30 buah) | filter `min_age_days`, kolom `umur_hari`; `PUT /api/laporan/{harian,kejadian}/validate-bulk` (scope & status diperiksa per laporan, maks 100, rincian gagal); job perawatan: pengingat harian ke komandan lokasi terkait (1 notifikasi/komandan/hari); `pending_lama` di stats | Laporan Harian: badge "Pending N hari" (merah ≥30, kuning ≥7), chip "Pending >30 hari (N)", checkbox + bar aksi Setujui/Revisi/Tolak dengan modal konfirmasi & catatan; `?status=&min_age_days=&focus=` dari notifikasi/dashboard; dashboard kartu "N laporan menunggu validasi > 30 hari" | Validasi Laporan komandan: badge "Pending N hari", filter cepat "Pending > 30 hari (N)" (menunggu EAS) |

Verifikasi produksi (14:45 WIB, run pertama job perawatan pasca-deploy): `pengingat laporan pending lama terkirim ke 7 komandan` (7 notifikasi; data laporan **tidak berubah**: `pending_all=30`). Kartu dashboard & filter hanya membaca; setiap perubahan tetap lewat aksi admin/komandan.

## V3.6 FASE D — Usulan §6

| # | Usulan | Hasil |
|---|---|---|
| D1 | Refresh checksum migrasi 002–005 | **Tidak diperlukan**: sha256 file di container (dihitung dengan cara yang sama seperti `migrationRunner`) = nilai di `schema_migrations` untuk 002–005 (`8a848c32…`, `af178bb9…`, `a4a85397…`, `f1e117bc…`), dan log boot 3 container terakhir tanpa peringatan drift. Peringatan saat audit sebelumnya berasal dari salinan lokal ber-CRLF. Tidak ada UPDATE, tidak ada rollback. |
| D2 | Endpoint profil klien | `PUT /api/auth/me` (role klien; `kontak_person`, `nomor_telepon`, `email`; validasi; audit `UPDATE_PROFIL`) — commit `81ea5a8`; `GET /auth/me` klien kini memuat `kode_klien`, `kontak_person`, `alamat_klien`, `foto_url`, `must_change_pin`. Mobile `EditProfilScreen` jalur klien (nama kontak/telepon/email; nama perusahaan & foto read-only) — `5c8610f`. Uji: 403 anggota, 400 email salah, 200 tersimpan & dipulihkan. |
| D3 | Redesain notifikasi (pragmatis) | Backend: notifikasi persisten dibuat saat laporan divalidasi (ke pelapor), panic dibuat/ditangani, broadcast (per-user untuk broadcast ber-lokasi agar tidak bocor lintas lokasi; per-peran untuk global); `data` memuat `entity/id/path`; retensi (dibaca >90 hari, semua >180 hari) di job perawatan; **bug 500** klien (`id 'client-<uuid>'` vs kolom uuid) saat baca/tandai notifikasi diperbaiki. Web-admin: panel notifikasi di TopBar (daftar ≤50, badge belum dibaca akurat, "Tandai semua", klik → halaman entitas dengan `?focus=`), ikon/warna per tipe seragam dengan mobile (info/success/warning/danger). Mobile sudah punya layar Notifikasi dengan ikon/warna yang sama; `markRead/markAllRead` sudah ke server. Retensi run pertama: 30 notifikasi lama (dibaca, >90 hari) dihapus — rollback tersedia dari backup `ptsss_backup_20260909_1418.dump` (tabel `notifikasi`). |
| D4 | ESLint | Backend: `.eslintrc.json` (eslint:recommended, longgar untuk kode lama), `eslint@8.57.1` devDependency dipin (tidak masuk image), `npm run lint` → **0 error**, 14 warning. Web-admin: `.eslintrc.json` (`next/core-web-vitals`), 4 error `react/no-unescaped-entities` diperbaiki → **0 error**; `next build` menjalankan lint. Tidak ada reformat massal. |
| D5 | Batas memori container | `docker-compose.yml`: backend 768M, web-admin 512M, website 512M, postgres 1G, pgadmin 512M (`deploy.resources.limits.memory`; divalidasi `docker compose config`). Pemakaian terukur sebelum batas: backend 55 MiB, web-admin 38, website 34, postgres 44, pgadmin 248. Pasca-deploy batch 4 (`docker inspect HostConfig.Memory`): backend 805306368, web-admin/website/pgadmin 536870912, postgres 1073741824 ✔; pemakaian 08:03 UTC: backend 46 MiB/768 (6 %), web-admin 30/512, website 26/512, postgres 20/1024, **pgadmin 248/512 (48 %)** — bila pgAdmin mendekati batas, naikkan ke 768M (atau tutup ekspos publik, V3.7). |
| D6 | Uji otomatis masuk repo | `backend/tests/api-smoke.js` (50 kasus) + `api-flow.js` (33 kasus) + `README.md`; `npm run test:api` / `test:flow`; menolak URL produksi tanpa `TEST_ALLOW_PROD=1`; tanpa dependensi; akun uji hanya di DB salinan. |
| D7 | Mobile #12–14 | `dataStore`: `updateCheckpoint/deleteCheckpoint/updateLokasi/updateTeamMember` (+ `updateRoute/deleteRoute/removeTeamMember`) → `Promise<SubmitResult>` dengan rollback & pesan error server; layar pemanggil menunggu hasil; antrian offline: 409 "Patroli belum tersinkron" tidak dihitung retry (`updateQueueItemError`); pesan dev hanya di `__DEV__`; `roleGuard` klien untuk Notifikasi/Profil/EditProfil/UbahPIN/TentangAplikasi — commit `5c8610f` (menunggu EAS). |
| D8 | pgAdmin publik | **Tidak diubah** (menunggu keputusan). Rekomendasi & langkah: V3.7. |

## V3.7 pgAdmin publik — rekomendasi (BERHENTI-DAN-TANYA)

Kondisi: `pgadmin.sopiaksatriasaga.com` diekspos Traefik (label di compose) dengan login pgAdmin (`PGADMIN_EMAIL/PASSWORD`), server-mode, cookie protection aktif; di belakang Cloudflare. Risiko: brute-force/celah pgAdmin langsung menghadap internet dan memegang kredensial DB produksi.

Pilihan (urut dari yang saya rekomendasikan):
1. **Tutup ekspos publik, akses via SSH tunnel** — hapus 10 baris `labels:` Traefik + `SERVICE_FQDN_PGADMIN_80` pada service `pgadmin` di `docker-compose.yml`, deploy; akses dengan `ssh -L 5050:<ip-container-pgadmin>:80 deployer@31.97.106.106` lalu buka `http://localhost:5050`. Nol biaya, DNS `pgadmin.` bisa dihapus/dibiarkan (Traefik akan 404). Reversibel dengan mengembalikan label.
2. **Cloudflare Access (Zero Trust)** di depan `pgadmin.` — login email/OTP sebelum sampai ke pgAdmin; konfigurasi di dasbor Cloudflare (di luar repo), tanpa perubahan compose.
3. **Allow-list IP kantor** lewat middleware Traefik `ipAllowList` pada router pgadmin (perlu IP statis; di balik Cloudflare harus memakai `CF-Connecting-IP` → lebih rumit).

Saya berhenti di sini: mohon pilih opsi (saya sarankan 1); saya siapkan commit + deploy setelah persetujuan.

## V3.8 FASE E — Saran tambahan yang diimplementasikan

| # | Perubahan | Commit |
|---|---|---|
| E1 | Retensi berkas backup otomatis di job perawatan: hapus `.sql/.dump/.gz` > `BACKUP_RETENTION_DAYS` (30) tetapi selalu sisakan `BACKUP_KEEP_MIN` (7) terbaru; berkas yang sudah ke Drive dibiarkan. Jadwal backup harian tetap lewat menu Backup (persisten `schedule.json`) — **rekomendasi: aktifkan 02:00** | `98fbf8f` |
| E2 | Halaman 404 ramah web-admin & website; `unauthorized` memakai kelas bersama | `c142821`, `0952f8d` |
| E3 | Judul tab per halaman (`lib/pageTitles.ts`) | `7442c91` |
| E4 | Konfirmasi keras (ketik kode) untuk hapus klien, nonaktifkan klien, restore DB; `busy` di semua dialog konfirmasi | `c4cbc42`, `30ebfc7` |
| E5 | Error FK/UNIQUE → 409 dengan pesan tindak lanjut (bukan 500) untuk semua data master | `86ca743` |
| E6 | `/api/health` memuat `pin_hash_pool` & `client_ip` asli; `LOG_LEVEL=debug` untuk tahapan login | `37bb0f0` |
| E7 | Uji API menolak URL produksi; README cara menjalankan | `ed106ce` |

## V3.9 Deploy, verifikasi produksi, dan daftar commit

| Batch | Commit | Dipicu (WIB) | Selesai | Verifikasi |
|---|---|---|---|---|
| 1 (env A) | `8c99eca` (tanpa perubahan kode) | 13:37:18 | 13:41 | ADA len=64; 429 tegak; health 200 |
| 2 (B1, D2) | `37bb0f0`, `81ea5a8` | 13:54:39 | 13:57 | `pin_hash_pool` aktif 3 worker; IP asli di access.log; angka V3.2; log bersih |
| 3 (B2, C, D3, D4, E, website) | `ed106ce` … `c4cbc42` | 14:41:11 | 14:43 | health 200; smoke 10 URL (200/401/404 sesuai); CSS baru terpasang (`.notif-panel`, `.alert-card`, `.floating-prompt`, alias token); job perawatan 14:45: pengingat 7 komandan, retensi 30 notifikasi; log bersih |
| 4 (B3 web, D5 compose, E1, 409) | `142117b` … `86ca743` | 14:59:06 | 15:02 | health 200; batas memori terpasang (V3.6 D5); smoke 6 URL (200/401); log bersih; job perawatan 15:04: `pengingat_pending 0` (dedupe per hari bekerja), `backup_dihapus 0` |
| 5 (putaran-2 UI) | `3e4457b` (auto-deploy webhook), `252b2a5` | 15:07:01 | 15:09 | health 200; log bersih; web-admin `252b2a5` healthy |

Daftar commit: `37bb0f0` perf login; `81ea5a8` PUT /auth/me; `5c8610f` mobile (EAS); `ed106ce` C2/D3/C1/tests; `a89e2b0` ESLint backend; `0952f8d` website; `c142821` web-admin B2/D3/D4; `c4cbc42` web-admin C1/C2; `142117b` compose memori; `3058d11` mobile validasi (EAS); `98fbf8f` retensi backup; `7442c91` judul tab; `30ebfc7` web-admin B3; `86ca743` 409 + api-flow; `3e4457b` mobile form B3 (EAS); `252b2a5` web-admin putaran 2; laporan ini.

Pasca-deploy tiap batch: `docker ps … | grep v13` sampai 3 image bertag commit baru & healthy; `wget /api/health` 200; `docker logs --since` tanpa `error/fatal`; smoke URL publik; sampel 401 tanpa token.

Lingkungan uji (bukan produksi): DB salinan `ptsss_audit_test` di Postgres Sopiak (restore dari backup baru `ptsss_backup_20260909_1418.dump`, 310.055 B; salinan di `~/backups-sopiak/` & `backups-local/`), role `audit_test` (sandi acak, hanya DB salinan), backend lokal :3100 lewat tunnel SSH. Akun uji `TESTADM/TESTKMD/TESTAGT` & PIN klien `KK-001` **hanya di DB salinan**. Penutupan (15:12 WIB): backend lokal & tunnel SSH dihentikan; `DROP DATABASE ptsss_audit_test` + `DROP ROLE audit_test` — sebelum: `ptsss_db, ptsss_audit_test / audit_test / 0 koneksi`; sesudah: hanya `ptsss_db`, tidak ada role `audit%`. Produksi: `users=65`, `users_uji=0`, `laporan_uji=0`, `lokasi_uji=0`, `clients=15`.

**Koreksi laporan sebelumnya:** jumlah `clients` yang tercatat "21" di §1/§4 laporan pagi adalah salah tulis (nilai `lokasi`); kedua backup hari ini (10:31 & 14:18 WIB) memuat **15 baris clients**, `updated_at` terbaru 16 Mei 2026, tidak ada DELETE/PUT clients di access log maupun audit log hari ini → tidak ada kehilangan data. Kontrak habis = 12 dari 15 klien Aktif (0 hampir habis), laporan pending >30 hari = 30 — sesuai kartu peringatan dashboard.

## V3.10 Menunggu tindakan pengguna & usulan lanjutan

Menunggu Anda:
1. **EAS build selesai** (Android, profil `preview`, commit `252b2a5`, versi 3.0.0, FINISHED 15:22 WIB, `node verify-fixes.js` 25 PASS sebelum build) — pasang & uji di HP:
   - Halaman build: https://expo.dev/accounts/danielandersontech/projects/sopiak-satria-saga/builds/392c075d-2ba8-4e94-b0ac-cb2ec292f4f8
   - APK: https://expo.dev/artifacts/eas/YOOJnX-3tpsA6DQ1RdkHH3VJRyrFxYoEpsGfS2EjONA.apk
   Memuat seluruh perubahan mobile misi ini (`5c8610f`, `3058d11`, `3e4457b`) + `60f3e69` dari misi sebelumnya.
2. **Pasang APK & uji visual di HP** (daftar V3.11).
3. **Keputusan pgAdmin** (V3.7) — saya sarankan opsi 1.
4. **Uji manual web-admin ber-login** (V3.12).
5. (Rekomendasi) Aktifkan **Backup otomatis 02:00** di menu Backup; retensi 30 hari kini otomatis.
6. (Opsional) `BCRYPT_ROUNDS=11` bila ingin login per-orang lebih cepat lagi (±150 ms lebih singkat) — keputusan keamanan.

Usulan lanjutan (tidak dikerjakan):
- `label htmlFor`/`id` di semua form web-admin (aksesibilitas) — perubahan mekanis luas.
- Notifikasi mobile: buka entitas terkait saat diklik (web-admin sudah); memerlukan pemetaan `data.path` → layar RN.
- `ipKeyGenerator` (subnet IPv6 /56) bila `express-rate-limit` dinaikkan ke ≥7.5 dengan helper tersebut.
- Push FCM: `FIREBASE_*` masih kosong (kode siap).

## V3.11 Daftar uji visual di HP setelah EAS build (tambahan atas §5)

1. Login → langsung masuk beranda (tidak menggantung), data terisi bertahap.
2. Klien → Profil → Edit Profil: nama kontak/telepon/email tersimpan; nama perusahaan & foto read-only; Ubah PIN & Notifikasi & Tentang bisa dibuka.
3. Supervisor → Setup Checkpoint: nonaktifkan/hapus checkpoint yang sudah pernah discan → pesan 409 jelas, daftar tidak berubah (rollback).
4. Supervisor → Setup Rute edit → hasil server ditunggu; error tampil.
5. Komandan → Validasi Laporan: badge "Pending N hari" dan filter "Pending > 30 hari".
6. Mode pesawat: scan checkpoint sebelum patrol_start tersinkron → tidak masuk dead-letter; sinkron saat online.
7. Pesan error saat server tidak terjangkau berbahasa produksi (tanpa "npm run dev").
8. Anggota → Laporan Kejadian → isi sebagian → "Simpan Draft" → tutup aplikasi → buka lagi: isian kembali (foto tidak).
9. Anggota → Patroli → scan checkpoint saat online: "Checkpoint Berhasil"; saat mode pesawat: "Tersimpan Offline"; scan checkpoint yang ditolak server (mis. sudah nonaktif) → Alert pesan server, checkpoint tetap bisa discan ulang.
10. Supervisor → Tambah User dengan NRP duplikat / HP salah → Alert menampilkan rincian validasi server.
11. Komandan → Broadcast judul >120 karakter (≤200) diterima; setelah kirim, target & prioritas kembali ke default.
12. Login: tekan "Done" di keypad PIN langsung mengirim; layar Laporan Kejadian/Serah Terima/Tambah User: keyboard tidak menutupi tombol simpan.

## V3.12 Uji manual web-admin (akun admin/komandan)

1. TopBar bel → panel notifikasi: daftar, badge, "Tandai semua", klik item membuka halaman terkait (laporan dengan `?focus=` membuka detail).
2. Klien: filter Kontrak Habis; Perpanjang Kontrak (+1 tahun default) → badge hilang; Nonaktifkan (ketik kode) → klien tidak bisa login; Aktifkan kembali.
3. Laporan Harian (komandan): chip "Pending >30 hari", checkbox → Setujui semua → toast ringkasan; pelapor menerima notifikasi.
4. Dashboard: kartu peringatan kontrak/pending mengarah ke filter.
5. Modal apa pun: Esc menutup, field pertama terfokus, Enter menyimpan; dialog hapus menampilkan spinner; Restore DB meminta ketik RESTORE.
6. Analytics: ganti tema terang/gelap → warna grafik & tooltip ikut.
7. Klien login web: menu akun menampilkan Ganti PIN; akun `must_change_pin` klien dipaksa ganti.
8. Hapus checkpoint yang sudah discan → pesan 409 yang bisa ditindaklanjuti.
