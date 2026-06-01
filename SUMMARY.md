# SUMMARY — TAHAP 21: Higienitas Akhir & Verifikasi Kumulatif (Penutup, EAS Go)

## File yang diubah
| File | Perubahan |
|---|---|
| `tsconfig.json` | `exclude` lama `["web-admin"]` (folder tak ada) diganti menjadi daftar folder **non-mobile yang nyata**: `["web-admin-next", "website", "backend", "verify", "node_modules", "dist", ".expo"]`. (N-05b) |
| `src/hooks/useRealtimeSync.ts` | Cleanup `useEffect` dibuat **tahan-race** dengan flag `cancelled` + referensi lokal `localSocket`/`localInterval`. Tidak ada perubahan opsi koneksi/retry/AppState. (N-05c) |

> **Hanya 2 file** yang berubah (sesuai batasan keras). ZIP tidak menyertakan file yang tidak berubah, `node_modules`, atau `.git`.

---

## 21.1 — `tsconfig.json` exclude (N-05b)

Sebelumnya `"exclude": ["web-admin"]` menunjuk folder yang **tidak ada** — folder nyata adalah `web-admin-next/`. Akibatnya `npx tsc --noEmit` di root ikut menjaring `web-admin-next/` (alias `@/`, tipe Next.js), `website/`, `backend/` (kode Node), dan `verify/` → **error tipe palsu**. Ini tidak menghentikan EAS build (Metro memakai Babel), tetapi mengganggu pemeriksaan tipe.

Sekarang `exclude` mencakup semua folder non-mobile yang **benar-benar ada** di repo, sehingga `tsc --noEmit` di root hanya memeriksa kode mobile (`src/`, `App.tsx`). `compilerOptions.strict: true` dan `extends: "expo/tsconfig.base"` dipertahankan apa adanya. File divalidasi sebagai **JSON valid**.

---

## 21.2 — Race cleanup `useRealtimeSync` (N-05c)

### Masalah lama
Pada versi sebelumnya, variabel `cleanup` di-assign **di dalam IIFE `async`** (setelah `await getToken()` / `await getSocketClient()`). Bila komponen unmount atau `user.id` berubah **sebelum** IIFE selesai, fungsi cleanup yang dijalankan masih versi awal (no-op) → socket dan interval yang dibuat **setelah** itu **bocor** (tidak pernah di-`disconnect`/`clearInterval`).

### Pendekatan anti-race (minimal, tanpa ubah perilaku koneksi)
1. **Flag `cancelled`** + referensi lokal `localSocket` dan `localInterval` dideklarasikan di scope `useEffect` (bukan di dalam IIFE).
2. **Early-return `if (cancelled) return;`** ditempatkan **tepat setelah** kedua `await` (`getToken`, `getSocketClient`) — titik terakhir sebelum efek samping. Bila sudah dibatalkan, **tidak ada** socket/interval yang dibuat.
3. Setiap kali socket/interval benar-benar dibuat, referensinya **disimpan** ke `localSocket`/`localInterval` (untuk ketiga jalur: socket sukses, fallback polling di `catch`, dan fallback polling saat `socket.io-client` tak tersedia).
4. **Fungsi cleanup tunggal** (di `return` `useEffect`) selalu: set `cancelled = true`, set `setupCompleteRef.current = false`, `disconnect()` socket yang benar-benar ada (`localSocket ?? socket`), reset state modul, lalu `clearInterval(localInterval ?? intervalRef.current)`, dan `sub.remove()`.

### Yang **tidak** diubah (dijaga identik)
Opsi koneksi (`reconnection`, `reconnectionAttempts: 10`, `reconnectionDelay`, `reconnectionDelayMax: 30000`, `timeout`, `autoConnect: false`), daftar `events`, polling fallback (5 menit saat socket tidur; 60 detik bila tanpa socket), dan seluruh logika `handleAppStateChange` (foreground reconnect / background disconnect) **tetap sama**. Perubahan murni soal **siklus hidup cleanup**, bukan perilaku realtime.

> Efek samping positif (bonus, bukan perubahan perilaku): jalur fallback di `catch` yang dulu hanya membuat interval kini juga ikut dibersihkan lewat `localInterval`, menutup kebocoran interval laten saat unmount.

**Validasi:** file lolos transpile TypeScript (`transpileModule`, strict) **tanpa error sintaks**.

---

## Cara `verify-fixes.js` bekerja (VERIFIKASI KUMULATIF T11–T21)

Node murni tanpa dependency, `process.exit(0|1)`. Mencari file relatif terhadap beberapa kandidat root (lokasi skrip, `cwd`, dan beberapa level di atasnya) sehingga tahan dijalankan dari root repo. Konvensi:
- **PASS** — cek terpenuhi.
- **FAIL** — regresi/kerusakan nyata pada tahap **wajib** → `exit 1`.
- **WARNING** — tahap **opsional** belum diterapkan / pola tak terdeteksi (mis. Tahap 20 sengaja dilewati) → **tidak** menggagalkan.

`exit 1` **hanya** bila ada FAIL. Bila lolos, mencetak: *"Semua tahap 11–21 terverifikasi — siap EAS rebuild."*

### Daftar cek & hasil (dijalankan terhadap pohon hasil T20+T21)
| Tahap | Cek | Hasil |
|---|---|---|
| **T21** | `tsconfig.json` valid JSON; `exclude` memuat `"web-admin-next"` & bukan lagi `"web-admin"` basi | **PASS** |
| **T21** | `useRealtimeSync.ts` memuat penanda anti-race (`cancelled`) / `clearInterval`+`disconnect` di cleanup *(WARNING bila tak ada, bukan FAIL)* | **PASS** |
| **T20** | `backend/src/services/auth.service.js`: tanpa `bcrypt.hash('123456'` & ada `crypto.randomInt(` *(WARNING bila Tahap 20 dilewati)* | **PASS** (WARNING bila dilewati) |
| **T19** | `PanicButtonScreen.tsx`: ada `Linking.openURL('tel:` & tanpa `081234567891` | **PASS** |
| **T18** | `fcmService.ts`: tanpa `'PatroliScreen'` | **PASS** |
| **T17** | `excelExport.ts` & `AnalyticsScreen.tsx`: memuat `expo-file-system/legacy` | **PASS** |
| **T16** | `app.json`: `expo.version === "3.0.0"` & plugins memuat `expo-notifications` | **PASS** |
| **T15** | `App.tsx`: `GestureHandlerRootView`; `package.json`: tanpa `react-native-reanimated` | **PASS** |
| **T14** | `web-admin-next/styles/globals.css`: `.sidebar--open` & `.sidebar-backdrop`; `TopBar.tsx`: `btn-hamburger` | **PASS** |
| **T13** | `CameraModal.tsx` & `QRScannerScreen.tsx`: `useSafeAreaInsets` + `Math.max(` | **PASS** |
| **T12** | `src/hooks/useScreenInsets.ts` ada; ≥30 file `src/screens/**` memuat `useSafeAreaInsets` | **PASS** (36 file) |
| **T11** | `AppNavigator.tsx`: `insets.bottom` & tepat satu `name="DownloadLaporan"` | **PASS** |

**Hasil simulasi penuh (T20 diterapkan): 25 PASS, 0 WARNING, 0 FAIL → `exit 0`.**
Bila Tahap 20 sengaja dilewati: cek T20 menjadi **WARNING** (bukan FAIL), `exit` tetap `0`.

---

## Langkah EAS rebuild final

```
1) Pastikan aset biner ada (assets/logo-ptsss.png, dll.) — tidak masuk snapshot .txt.
2) (Push) eas credentials → Android → upload FCM V1 service account key.
3) npm install
4) npx expo-doctor   (opsional)
5) eas build -p android --profile preview   → uji APK di HP nyata
     - cek: export supervisor (CSV/PDF) jalan, tap notifikasi patroli buka layar Patroli,
       tombol telepon panic berfungsi, tab bar tidak ketutup.
6) eas build -p android --profile production
```

> Sebelum rebuild, jalankan `node verify-fixes.js` dari root repo. Pastikan **tidak ada FAIL** (WARNING untuk Tahap 20 yang dilewati itu wajar). Setelah itu, lanjutkan urutan EAS di atas.

---

## Batasan keras yang dipatuhi
- ❌ Tidak menyentuh `backend/`, `database/`, `web-admin-next/`, `website/` (verifier hanya **membaca**, tidak mengubah).
- ❌ Tidak mengubah perilaku realtime (retry, `events`, AppState, polling) — hanya merapikan siklus hidup cleanup.
- ❌ Tidak menambah/menghapus dependency.
- ✅ Hanya `tsconfig.json` & `src/hooks/useRealtimeSync.ts` yang berubah (+ `verify-fixes.js` & `SUMMARY.md` di root ZIP).