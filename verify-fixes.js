#!/usr/bin/env node
/**
 * verify-fixes.js — VERIFIKASI KUMULATIF PENUTUP (Tahap 11–21)
 * Sopiak Satria Saga · Node murni, tanpa dependency.
 *
 * Tujuan: pastikan perbaikan Tahap 21 (tsconfig exclude + race cleanup
 * useRealtimeSync) diterapkan, DAN hasil Tahap 11–20 tidak ter-regresi.
 *
 * Konvensi hasil:
 *   PASS    — cek terpenuhi.
 *   FAIL    — regresi/kerusakan nyata pada tahap wajib → exit 1.
 *   WARNING — tahap opsional belum diterapkan / pola tak terdeteksi
 *             (mis. Tahap 20 sengaja dilewati) → tidak menggagalkan.
 *
 * Dijalankan dari ROOT REPO (mis. `node verify-fixes.js`). Skrip mencari
 * file relatif terhadap beberapa kandidat root agar tahan lokasi.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// --- Penentuan root repo yang tahan-lokasi ----------------------------------
// Coba __dirname, cwd, dan beberapa level di atasnya. Pakai yang memuat
// penanda repo (app.json / tsconfig.json / package.json).
function resolveRoots() {
  const cands = [];
  const seed = [__dirname, process.cwd()];
  for (const s of seed) {
    let d = s;
    for (let i = 0; i < 4; i++) {
      if (!cands.includes(d)) cands.push(d);
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  // Urutkan: root yang punya app.json/tsconfig.json didahulukan.
  cands.sort((a, b) => score(b) - score(a));
  return cands;
}
function score(dir) {
  let s = 0;
  for (const f of ['app.json', 'tsconfig.json', 'package.json', 'src']) {
    try { if (fs.existsSync(path.join(dir, f))) s++; } catch (_) {}
  }
  return s;
}
const ROOTS = resolveRoots();

function resolvePath(rel) {
  const relNorm = rel.split('/').join(path.sep);
  for (const root of ROOTS) {
    const p = path.join(root, relNorm);
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}
function readFile(rel) {
  const p = resolvePath(rel);
  if (!p) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; }
}
function exists(rel) { return resolvePath(rel) !== null; }

// --- Kerangka pelaporan ------------------------------------------------------
let nPass = 0, nFail = 0, nWarn = 0;
function pass(msg) { nPass++; console.log('  [PASS] ' + msg); }
function fail(msg) { nFail++; console.log('  [FAIL] ' + msg); }
function warn(msg) { nWarn++; console.log('  [WARNING] ' + msg); }
function section(title) { console.log('\n— ' + title); }

// Helper: cek file ada lalu uji regex; sev = 'fail' | 'warn'.
function checkContains(rel, re, label, sev) {
  const txt = readFile(rel);
  if (txt == null) {
    (sev === 'warn' ? warn : fail)(`${label}: file tidak ditemukan (${rel})`);
    return false;
  }
  if (re.test(txt)) { pass(label); return true; }
  (sev === 'warn' ? warn : fail)(`${label}: pola tidak ditemukan di ${rel}`);
  return false;
}
function checkAbsent(rel, re, label, sev) {
  const txt = readFile(rel);
  if (txt == null) {
    (sev === 'warn' ? warn : fail)(`${label}: file tidak ditemukan (${rel})`);
    return false;
  }
  if (!re.test(txt)) { pass(label); return true; }
  (sev === 'warn' ? warn : fail)(`${label}: pola terlarang masih ada di ${rel}`);
  return false;
}

console.log('=== VERIFIKASI KUMULATIF TAHAP 11–21 — Sopiak Satria Saga ===');
console.log('Root terdeteksi: ' + (ROOTS[0] || '(?)'));

// ============================================================================
// TAHAP 21 — Higienitas akhir (deliverable utama tahap ini)
// ============================================================================
section('TAHAP 21 — tsconfig exclude + race cleanup useRealtimeSync');

// T21a: tsconfig.json valid JSON + exclude memuat "web-admin-next" (bukan
// "web-admin" basi). Ini deliverable inti → FAIL bila tak terpenuhi.
(() => {
  const raw = readFile('tsconfig.json');
  if (raw == null) { fail('tsconfig.json ditemukan'); return; }
  let json;
  try { json = JSON.parse(raw); }
  catch (e) { fail('tsconfig.json valid JSON (parse error: ' + e.message + ')'); return; }
  pass('tsconfig.json valid JSON');
  const exclude = Array.isArray(json.exclude) ? json.exclude : [];
  if (exclude.includes('web-admin-next')) {
    pass('tsconfig exclude memuat "web-admin-next"');
  } else {
    fail('tsconfig exclude TIDAK memuat "web-admin-next" (isi: ' + JSON.stringify(exclude) + ')');
  }
  // "web-admin" basi tidak boleh jadi satu-satunya entri folder web-admin.
  if (exclude.length === 1 && exclude[0] === 'web-admin') {
    fail('tsconfig exclude masih "web-admin" basi (folder nyata: web-admin-next)');
  } else {
    pass('tsconfig exclude bukan lagi sekadar "web-admin" basi');
  }
})();

// T21b: useRealtimeSync.ts memuat penanda anti-race ATAU cleanup yang
// membersihkan socket+interval. Per instruksi: WARNING bila tak terdeteksi.
(() => {
  const rel = 'src/hooks/useRealtimeSync.ts';
  const txt = readFile(rel);
  if (txt == null) { warn('useRealtimeSync.ts: file tidak ditemukan'); return; }
  const hasCancelled = /\bcancelled\b/.test(txt);
  const hasClear = /clearInterval\s*\(/.test(txt);
  const hasDisconnect = /\.disconnect\s*\(/.test(txt);
  if (hasCancelled || (hasClear && hasDisconnect)) {
    pass('useRealtimeSync cleanup tahan-race (flag `cancelled` / clearInterval+disconnect terdeteksi)');
  } else {
    warn('useRealtimeSync: penanda anti-race tak terdeteksi (cek manual cleanup)');
  }
})();

// ============================================================================
// TAHAP 20 — Hardening PIN register (BACKEND, opsional)
// ============================================================================
section('TAHAP 20 — PIN register acak (opsional, regresi)');
(() => {
  const rel = 'backend/src/services/auth.service.js';
  const txt = readFile(rel);
  if (txt == null) {
    warn('Tahap 20 belum diterapkan / backend tak disertakan (opsional) — ' + rel + ' tak ditemukan');
    return;
  }
  const hasGuessable = /bcrypt\.hash\(\s*['"]123456['"]/.test(txt);
  const hasRandom = /crypto\.randomInt\s*\(/.test(txt);
  if (!hasGuessable && hasRandom) {
    pass("auth.service.js: tidak ada bcrypt.hash('123456') & memuat crypto.randomInt( (PIN acak)");
  } else if (hasGuessable) {
    warn("Tahap 20 belum diterapkan (opsional): masih ada bcrypt.hash('123456') di " + rel);
  } else {
    warn('Tahap 20 belum diterapkan (opsional): crypto.randomInt( tak ditemukan di ' + rel);
  }
})();

// ============================================================================
// TAHAP 11–19 — Regresi wajib (FAIL bila hilang)
// ============================================================================
section('TAHAP 19 — Panic call (tel:) + nomor placeholder dihapus');
checkContains('src/screens/anggota/PanicButtonScreen.tsx', /Linking\.openURL\(\s*['"]tel:/, "PanicButtonScreen memuat Linking.openURL('tel:", 'fail');
checkAbsent('src/screens/anggota/PanicButtonScreen.tsx', /081234567891/, 'PanicButtonScreen tidak memuat nomor placeholder 081234567891', 'fail');

section('TAHAP 18 — fcmService tanpa target layar salah');
checkAbsent('src/services/fcmService.ts', /['"]PatroliScreen['"]/, "fcmService tidak memuat 'PatroliScreen'", 'fail');

section('TAHAP 17 — expo-file-system/legacy');
checkContains('src/services/excelExport.ts', /expo-file-system\/legacy/, "excelExport memuat 'expo-file-system/legacy'", 'fail');
checkContains('src/screens/supervisor/AnalyticsScreen.tsx', /expo-file-system\/legacy/, "AnalyticsScreen memuat 'expo-file-system/legacy'", 'fail');

section('TAHAP 16 — app.json versi 3.0.0 + plugin notifikasi');
(() => {
  const raw = readFile('app.json');
  if (raw == null) { fail('app.json ditemukan'); return; }
  let v = null, pluginsRaw = raw;
  try {
    const j = JSON.parse(raw);
    v = j && j.expo ? j.expo.version : undefined;
    pluginsRaw = JSON.stringify(j && j.expo ? j.expo.plugins : []);
  } catch (_) { /* fallback regex di bawah */ }
  if (v === '3.0.0' || /"version"\s*:\s*"3\.0\.0"/.test(raw)) pass('app.json expo.version === "3.0.0"');
  else fail('app.json expo.version bukan "3.0.0" (ditemukan: ' + v + ')');
  if (/expo-notifications/.test(pluginsRaw) || /expo-notifications/.test(raw)) pass('app.json plugins memuat expo-notifications');
  else fail('app.json plugins tidak memuat expo-notifications');
})();

section('TAHAP 15 — GestureHandlerRootView; tanpa reanimated');
checkContains('App.tsx', /GestureHandlerRootView/, 'App.tsx memuat GestureHandlerRootView', 'fail');
(() => {
  const raw = readFile('package.json');
  if (raw == null) { fail('package.json ditemukan'); return; }
  let depsBlob = raw;
  try {
    const j = JSON.parse(raw);
    depsBlob = JSON.stringify(Object.assign({}, j.dependencies, j.devDependencies));
  } catch (_) {}
  if (/react-native-reanimated/.test(depsBlob)) fail('package.json masih memuat react-native-reanimated');
  else pass('package.json tanpa react-native-reanimated');
})();

section('TAHAP 14 — sidebar drawer web-admin');
checkContains('web-admin-next/styles/globals.css', /\.sidebar--open/, 'globals.css memuat .sidebar--open', 'fail');
checkContains('web-admin-next/styles/globals.css', /\.sidebar-backdrop/, 'globals.css memuat .sidebar-backdrop', 'fail');
checkContains('web-admin-next/components/layout/TopBar.tsx', /btn-hamburger/, 'TopBar.tsx memuat btn-hamburger', 'fail');

section('TAHAP 13 — safe-area kamera & scanner');
checkContains('src/components/camera/CameraModal.tsx', /useSafeAreaInsets/, 'CameraModal memuat useSafeAreaInsets', 'fail');
checkContains('src/components/camera/CameraModal.tsx', /Math\.max\(/, 'CameraModal memuat Math.max(', 'fail');
checkContains('src/screens/anggota/QRScannerScreen.tsx', /useSafeAreaInsets/, 'QRScannerScreen memuat useSafeAreaInsets', 'fail');
checkContains('src/screens/anggota/QRScannerScreen.tsx', /Math\.max\(/, 'QRScannerScreen memuat Math.max(', 'fail');

section('TAHAP 12 — hook useScreenInsets + adopsi safe-area massal');
(() => {
  if (exists('src/hooks/useScreenInsets.ts')) pass('src/hooks/useScreenInsets.ts ada');
  else fail('src/hooks/useScreenInsets.ts tidak ditemukan');

  // Hitung file di src/screens/** yang memuat useSafeAreaInsets (target ≥ 30).
  let root = null;
  for (const r of ROOTS) { if (fs.existsSync(path.join(r, 'src', 'screens'))) { root = r; break; } }
  if (!root) { fail('folder src/screens tidak ditemukan untuk hitung safe-area'); return; }
  const base = path.join(root, 'src', 'screens');
  const stack = [base];
  let count = 0;
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
      try {
        const c = fs.readFileSync(full, 'utf8');
        if (c.includes('useSafeAreaInsets')) count++;
      } catch (_) {}
    }
  }
  if (count >= 30) pass(`≥30 file src/screens memuat useSafeAreaInsets (ditemukan ${count})`);
  else fail(`hanya ${count} file src/screens memuat useSafeAreaInsets (target ≥30)`);
})();

section('TAHAP 11 — AppNavigator: tab bar inset + route DownloadLaporan tunggal');
checkContains('src/navigation/AppNavigator.tsx', /insets\.bottom/, 'AppNavigator memuat insets.bottom', 'fail');
(() => {
  const txt = readFile('src/navigation/AppNavigator.tsx');
  if (txt == null) { fail('AppNavigator.tsx ditemukan'); return; }
  const n = (txt.match(/name="DownloadLaporan"/g) || []).length;
  if (n === 1) pass('AppNavigator memuat tepat satu name="DownloadLaporan"');
  else fail(`AppNavigator memuat ${n} name="DownloadLaporan" (harus tepat 1)`);
})();

// ============================================================================
// RINGKASAN
// ============================================================================
console.log('\n============================================================');
console.log(`RINGKASAN: ${nPass} PASS, ${nWarn} WARNING, ${nFail} FAIL`);
if (nFail > 0) {
  console.log('❌ Ada FAIL — perbaiki regresi di atas sebelum EAS rebuild.');
  process.exit(1);
}
if (nWarn > 0) {
  console.log('✅ Tidak ada FAIL. Catatan: ada WARNING (umumnya Tahap 20 opsional dilewati).');
}
console.log('Semua tahap 11–21 terverifikasi — siap EAS rebuild.');
process.exit(0);