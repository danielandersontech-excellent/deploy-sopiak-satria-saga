#!/usr/bin/env node
/**
 * UJI API OTOMATIS (smoke + regresi) — dijalankan terhadap backend yang SUDAH
 * berjalan di atas SALINAN database (bukan produksi). Lihat tests/README.md.
 *
 * Tanpa dependensi: Node ≥ 18 (fetch bawaan). Keluar dengan kode 1 bila ada
 * uji yang gagal. Semua kredensial dari env — tidak ada yang di-hardcode.
 *
 * Cakupan (Misi V3): health & pool bcrypt, login (user/klien/PIN salah),
 * /auth/me + PUT /auth/me klien, filter laporan min_age_days & umur_hari,
 * validasi massal (403 anggota / 400 validasi / 200 komandan), notifikasi
 * (dibuat saat validasi, read-all), statistik dashboard (kontrak_habis,
 * pending_lama), rekrutmen publik 404, sampel 401, bypass rate limit.
 */
const BASE = (process.env.TEST_API_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const CRED = {
  admin: { nrp: process.env.TEST_ADMIN_NRP || 'TESTADM', pin: process.env.TEST_ADMIN_PIN || '123456' },
  komandan: { nrp: process.env.TEST_KOMANDAN_NRP || 'TESTKMD', pin: process.env.TEST_KOMANDAN_PIN || '123456' },
  anggota: { nrp: process.env.TEST_ANGGOTA_NRP || 'TESTAGT', pin: process.env.TEST_ANGGOTA_PIN || '123456' },
  klien: { nrp: process.env.TEST_KLIEN_NRP || 'KK-001', pin: process.env.TEST_KLIEN_PIN || '123456' },
};
const BYPASS = process.env.TEST_BYPASS_SECRET || '';

if (/sopiaksatriasaga\.com/i.test(BASE) && process.env.TEST_ALLOW_PROD !== '1') {
  console.error('DITOLAK: TEST_API_URL menunjuk ke produksi. Uji ini menulis data (laporan, validasi). Set TEST_ALLOW_PROD=1 hanya bila Anda benar-benar tahu risikonya.');
  process.exit(2);
}

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; failures.push(name); console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, { token, body, headers } = {}) {
  const h = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  const t0 = Date.now();
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: res.status, json, text, ms: Date.now() - t0 };
}

async function login(role) {
  const r = await req('POST', '/api/auth/login', { body: CRED[role] });
  return r;
}

(async () => {
  console.log(`\n== Uji API terhadap ${BASE}\n`);

  console.log('-- Health');
  const h = await req('GET', '/api/health');
  ok('GET /api/health 200', h.status === 200 && h.json?.status === 'ok', `status=${h.status}`);
  ok('health memuat pin_hash_pool', h.json && typeof h.json.pin_hash_pool === 'object', JSON.stringify(h.json?.pin_hash_pool));
  ok('health memuat database.max', Number(h.json?.database?.max) > 0);

  console.log('-- Autentikasi');
  const salah = await req('POST', '/api/auth/login', { body: { nrp: CRED.admin.nrp, pin: '000000' } });
  ok('login PIN salah → 401', salah.status === 401, `status=${salah.status} ${salah.text.slice(0, 80)}`);
  const tidakAda = await req('POST', '/api/auth/login', { body: { nrp: 'ZZZ999X', pin: '000000' } });
  ok('login NRP tak ada → 401', tidakAda.status === 401);
  const tanpaPin = await req('POST', '/api/auth/login', { body: { nrp: CRED.admin.nrp } });
  ok('login tanpa PIN → 400', tanpaPin.status === 400, `status=${tanpaPin.status}`);

  const tok = {};
  const user = {};
  for (const role of ['admin', 'komandan', 'anggota', 'klien']) {
    const r = await login(role);
    ok(`login ${role} → 200 (${r.ms} ms)`, r.status === 200 && r.json?.token, `status=${r.status} ${r.text.slice(0, 100)}`);
    tok[role] = r.json?.token; user[role] = r.json?.user;
    if (r.status === 200) {
      ok(`login ${role} membawa refresh_token`, typeof r.json.refresh_token === 'string' && r.json.refresh_token.length > 20);
      ok(`login ${role} tidak membocorkan pin_hash`, !('pin_hash' in (r.json.user || {})));
    }
  }
  ok('klien: role=klien & must_change_pin boolean', user.klien?.role === 'klien' && typeof user.klien?.must_change_pin === 'boolean');
  ok('klien: login memuat kontak_person', user.klien && 'kontak_person' in user.klien);

  const me = await req('GET', '/api/auth/me', { token: tok.admin });
  ok('GET /auth/me admin', me.status === 200 && me.json?.nrp?.toUpperCase() === CRED.admin.nrp.toUpperCase());
  const noTok = await req('GET', '/api/users');
  ok('GET /api/users tanpa token → 401', noTok.status === 401);

  console.log('-- Profil klien (PUT /api/auth/me)');
  const meKlien = await req('GET', '/api/auth/me', { token: tok.klien });
  ok('GET /auth/me klien', meKlien.status === 200 && meKlien.json?.role === 'klien');
  const asal = meKlien.json || {};
  const forbid = await req('PUT', '/api/auth/me', { token: tok.anggota, body: { kontak_person: 'X' } });
  ok('PUT /auth/me anggota → 403', forbid.status === 403, `status=${forbid.status}`);
  const badMail = await req('PUT', '/api/auth/me', { token: tok.klien, body: { email: 'bukan-email' } });
  ok('PUT /auth/me email tidak valid → 400', badMail.status === 400, `status=${badMail.status}`);
  const kosong = await req('PUT', '/api/auth/me', { token: tok.klien, body: {} });
  ok('PUT /auth/me tanpa perubahan → 400', kosong.status === 400);
  const upd = await req('PUT', '/api/auth/me', { token: tok.klien, body: { kontak_person: 'Uji Kontak Otomatis', nomor_telepon: '081234567890', email: 'Uji.Kontak@Contoh.co.id' } });
  ok('PUT /auth/me klien → 200 & tersimpan', upd.status === 200 && upd.json?.kontak_person === 'Uji Kontak Otomatis' && upd.json?.email === 'uji.kontak@contoh.co.id', `status=${upd.status} ${upd.text.slice(0, 120)}`);
  const restore = await req('PUT', '/api/auth/me', { token: tok.klien, body: { kontak_person: asal.kontak_person ?? null, nomor_telepon: asal.nomor_telepon ?? null, email: asal.email ?? null } });
  ok('PUT /auth/me klien → pulihkan nilai asal', restore.status === 200 || restore.status === 400, `status=${restore.status}`);

  console.log('-- Laporan: filter umur & validasi massal');
  const lama = await req('GET', '/api/laporan/harian?status=pending&min_age_days=30&limit=5', { token: tok.komandan });
  ok('GET laporan harian min_age_days=30 → 200', lama.status === 200 && Array.isArray(lama.json?.data), `status=${lama.status}`);
  const rows = lama.json?.data || [];
  ok('semua baris berumur ≥ 30 hari & pending', rows.every((r) => Number(r.umur_hari) >= 30 && r.status === 'pending'), JSON.stringify(rows.map((r) => [r.umur_hari, r.status])));
  ok('respons memuat summary & pagination', lama.json?.summary && lama.json?.pagination);

  const bulkAgt = await req('PUT', '/api/laporan/harian/validate-bulk', { token: tok.anggota, body: { ids: ['00000000-0000-4000-8000-000000000000'], status: 'approved' } });
  ok('validate-bulk anggota → 403', bulkAgt.status === 403, `status=${bulkAgt.status}`);
  const bulkKosong = await req('PUT', '/api/laporan/harian/validate-bulk', { token: tok.komandan, body: { ids: [], status: 'approved' } });
  ok('validate-bulk ids kosong → 400', bulkKosong.status === 400);
  const bulkBadId = await req('PUT', '/api/laporan/harian/validate-bulk', { token: tok.komandan, body: { ids: ['bukan-uuid'], status: 'approved' } });
  ok('validate-bulk id bukan uuid → 400', bulkBadId.status === 400);
  const bulkNoNote = await req('PUT', '/api/laporan/harian/validate-bulk', { token: tok.komandan, body: { ids: ['00000000-0000-4000-8000-000000000000'], status: 'revision' } });
  ok('validate-bulk revisi tanpa catatan → 400', bulkNoNote.status === 400);

  // Buat laporan sebagai anggota → divalidasi massal komandan → anggota dapat notifikasi.
  const aktivitas = 'Uji otomatis Misi V3: patroli area A-B-C aman, lampu koridor normal, gerbang terkunci, tidak ada temuan mencurigakan sepanjang shift.';
  const buat = await req('POST', '/api/laporan/harian', { token: tok.anggota, body: { shift: 'Pagi', pos_jaga: 'Pos Uji', kondisi: 'aman', aktivitas, temuan: '-', idempotency_key: `uji-${Date.now()}` } });
  ok('POST laporan harian anggota → 201/200', (buat.status === 201 || buat.status === 200) && buat.json?.id, `status=${buat.status} ${buat.text.slice(0, 120)}`);
  const lapId = buat.json?.id;
  if (lapId) {
    const bulk = await req('PUT', '/api/laporan/harian/validate-bulk', { token: tok.komandan, body: { ids: [lapId, '00000000-0000-4000-8000-000000000000'], status: 'approved' } });
    ok('validate-bulk komandan → 200 berhasil=1 gagal=1', bulk.status === 200 && bulk.json?.berhasil === 1 && bulk.json?.gagal === 1, `status=${bulk.status} ${bulk.text.slice(0, 160)}`);
    const ulang = await req('PUT', `/api/laporan/harian/${lapId}/validate`, { token: tok.komandan, body: { status: 'approved' } });
    ok('validasi ulang laporan yang sudah approved → 409', ulang.status === 409, `status=${ulang.status}`);
    await new Promise((r) => setTimeout(r, 300));
    const notif = await req('GET', '/api/data/notifikasi', { token: tok.anggota });
    const mine = (Array.isArray(notif.json) ? notif.json : notif.json?.data || []);
    const found = mine.find((n) => n?.data?.entity === 'laporan_harian' && n?.data?.id === lapId);
    ok('anggota menerima notifikasi validasi (data.entity/id)', !!found && found.tipe === 'success', `jumlah=${mine.length}`);
    const readAll = await req('PUT', '/api/data/notifikasi/read-all', { token: tok.anggota });
    ok('PUT notifikasi/read-all → 200', readAll.status === 200);
    const notif2 = await req('GET', '/api/data/notifikasi', { token: tok.anggota });
    const mine2 = (Array.isArray(notif2.json) ? notif2.json : notif2.json?.data || []);
    ok('setelah read-all semua notifikasi dibaca', mine2.length > 0 && mine2.every((n) => n.dibaca === true));
    const readOther = await req('PUT', `/api/data/notifikasi/${found ? found.id : '00000000-0000-4000-8000-000000000000'}/read`, { token: tok.klien });
    ok('klien menandai notifikasi orang lain → 404', readOther.status === 404, `status=${readOther.status}`);
    const notifKlien = await req('GET', '/api/data/notifikasi', { token: tok.klien });
    ok('klien GET notifikasi → 200 (id client-<uuid> tidak memicu 500)', notifKlien.status === 200, `status=${notifKlien.status}`);
    const readAllKlien = await req('PUT', '/api/data/notifikasi/read-all', { token: tok.klien });
    ok('klien read-all → 200', readAllKlien.status === 200, `status=${readAllKlien.status}`);
  }

  console.log('-- Dashboard');
  const stAdmin = await req('GET', '/api/data/dashboard/stats', { token: tok.admin });
  ok('stats admin memuat kontrak_habis/kontrak_hampir_habis/pending_lama', stAdmin.status === 200 && ['kontrak_habis', 'kontrak_hampir_habis', 'pending_lama'].every((k) => typeof stAdmin.json?.[k] === 'number'), JSON.stringify({ kh: stAdmin.json?.kontrak_habis, khh: stAdmin.json?.kontrak_hampir_habis, pl: stAdmin.json?.pending_lama }));
  const stKmd = await req('GET', '/api/data/dashboard/stats', { token: tok.komandan });
  ok('stats komandan: kontrak_habis=0 (tidak berwenang), pending_lama angka', stKmd.status === 200 && stKmd.json?.kontrak_habis === 0 && typeof stKmd.json?.pending_lama === 'number');
  const lapKlien = await req('GET', '/api/laporan/harian?limit=3', { token: tok.klien });
  ok('klien GET laporan harian → 200 (ter-scope)', lapKlien.status === 200);

  console.log('-- Publik & rate limit');
  const rek = await req('GET', '/api/rekrutmen/publik/status?nomor=REK-00000000-XXXXX&nik=0000000000000000');
  ok('rekrutmen publik status tidak ada → 404', rek.status === 404, `status=${rek.status}`);
  if (BYPASS) {
    let hit429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await req('POST', '/api/auth/refresh', { body: { refresh_token: 'uji-salah' }, headers: { 'X-Skip-Rate-Limit': BYPASS } });
      if (r.status === 429) hit429 = true;
    }
    ok('bypass rate limit dengan secret benar: tidak ada 429 (12x refresh)', !hit429);
  } else {
    console.log('  [SKIP] TEST_BYPASS_SECRET kosong — uji bypass dilewati');
  }
  const salahBypass = await req('GET', '/api/health', { headers: { 'X-Skip-Rate-Limit': 'nilai-salah-0000000000000000' } });
  ok('header bypass salah tidak menyebabkan error', salahBypass.status === 200);

  console.log(`\nRINGKASAN: PASS=${pass} FAIL=${fail}`);
  if (fail) { console.log('Gagal: ' + failures.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('Uji berhenti karena error:', e); process.exit(1); });
