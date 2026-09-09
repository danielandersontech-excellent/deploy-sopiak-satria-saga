#!/usr/bin/env node
/**
 * UJI ALUR LINTAS-FORM (end-to-end lewat API) — Misi V3 / B3.
 * Jalankan HANYA terhadap salinan DB (lihat README.md; menolak URL produksi).
 *
 * Alur: admin buat lokasi → buat pos jaga → buat checkpoint → buat rute →
 * tugaskan anggota ke lokasi/pos → anggota absen masuk → absensi tampil di daftar
 * lokasi tersebut → anggota mulai patroli, scan checkpoint, selesai → komandan
 * lokasi lain TIDAK melihat data lokasi ini (scope) → bersihkan data uji.
 */
const BASE = (process.env.TEST_API_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const CRED = {
  admin: { nrp: process.env.TEST_ADMIN_NRP || 'TESTADM', pin: process.env.TEST_ADMIN_PIN || '123456' },
  komandan: { nrp: process.env.TEST_KOMANDAN_NRP || 'TESTKMD', pin: process.env.TEST_KOMANDAN_PIN || '123456' },
  anggota: { nrp: process.env.TEST_ANGGOTA_NRP || 'TESTAGT', pin: process.env.TEST_ANGGOTA_PIN || '123456' },
};
if (/sopiaksatriasaga\.com/i.test(BASE) && process.env.TEST_ALLOW_PROD !== '1') {
  console.error('DITOLAK: TEST_API_URL menunjuk ke produksi.'); process.exit(2);
}
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log(`  [PASS] ${n}`); } else { fail++; failures.push(n); console.log(`  [FAIL] ${n}${d ? ' — ' + d : ''}`); } };
async function req(method, path, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const unwrap = (j) => (j && j.data && typeof j.data === 'object' && !Array.isArray(j.data)) ? j.data : j;
const rows = (j) => Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);

(async () => {
  console.log(`\n== Uji alur lintas-form terhadap ${BASE}\n`);
  const tok = {};
  for (const r of ['admin', 'komandan', 'anggota']) {
    const l = await req('POST', '/api/auth/login', { body: CRED[r] });
    ok(`login ${r}`, l.status === 200 && l.json?.token, `status=${l.status}`);
    tok[r] = l.json?.token;
  }
  const meAgt = await req('GET', '/api/auth/me', { token: tok.anggota });
  const agtId = meAgt.json?.id; const agtLokasiAsal = meAgt.json?.lokasi_id || null; const agtPosAsal = meAgt.json?.pos_jaga_id || null;
  ok('profil anggota terbaca', !!agtId);

  const stamp = Date.now().toString(36).toUpperCase();
  const created = { lokasi: null, pos: null, cp: null, route: null };

  console.log('-- 1. Lokasi');
  const badLok = await req('POST', '/api/data/lokasi', { token: tok.admin, body: { nama: `UJI-${stamp}` } });
  ok('lokasi tanpa alamat → 400 (validasi server)', badLok.status === 400, `status=${badLok.status}`);
  const lok = await req('POST', '/api/data/lokasi', { token: tok.admin, body: { nama: `UJI Lokasi ${stamp}`, alamat: 'Jl. Uji Otomatis No. 1', latitude: 0.5071, longitude: 101.4478, radius: 150, status: 'active' } });
  created.lokasi = unwrap(lok.json)?.id;
  ok('buat lokasi → 201/200 dengan id', (lok.status === 201 || lok.status === 200) && created.lokasi, `status=${lok.status} ${lok.text.slice(0, 120)}`);
  const lokKmd = await req('POST', '/api/data/lokasi', { token: tok.komandan, body: { nama: 'X', alamat: 'Y' } });
  ok('komandan buat lokasi → 403', lokKmd.status === 403, `status=${lokKmd.status}`);

  console.log('-- 2. Pos jaga & checkpoint & rute');
  const pos = await req('POST', '/api/data/pos-jaga', { token: tok.admin, body: { nama: `Pos Uji ${stamp}`, lokasi_id: created.lokasi, latitude: 0.5071, longitude: 101.4478, radius: 100, status: 'active' } });
  created.pos = unwrap(pos.json)?.id;
  ok('buat pos jaga', (pos.status === 201 || pos.status === 200) && created.pos, `status=${pos.status} ${pos.text.slice(0, 120)}`);
  const cp = await req('POST', '/api/data/checkpoints', { token: tok.admin, body: { nama: `CP Uji ${stamp}`, area: 'Gerbang', lokasi_id: created.lokasi, latitude: 0.5072, longitude: 101.4479, radius: 30, qr_code: `QR-UJI-${stamp}`, status: 'active' } });
  created.cp = unwrap(cp.json)?.id;
  ok('buat checkpoint', (cp.status === 201 || cp.status === 200) && created.cp, `status=${cp.status} ${cp.text.slice(0, 120)}`);
  const cpNoCoord = await req('POST', '/api/data/checkpoints', { token: tok.admin, body: { nama: 'X', lokasi_id: created.lokasi } });
  ok('checkpoint tanpa koordinat → 400', cpNoCoord.status === 400, `status=${cpNoCoord.status}`);
  const rt = await req('POST', '/api/data/routes', { token: tok.admin, body: { nama: `Rute Uji ${stamp}`, lokasi_id: created.lokasi, checkpoint_ids: [created.cp], waktu_estimasi: 20, status: 'active' } });
  created.route = unwrap(rt.json)?.id;
  ok('buat rute', (rt.status === 201 || rt.status === 200) && created.route, `status=${rt.status} ${rt.text.slice(0, 120)}`);

  console.log('-- 3. Tugaskan personil');
  const asg = await req('PUT', `/api/users/${agtId}`, { token: tok.admin, body: { lokasi_id: created.lokasi, pos_jaga_id: created.pos } });
  ok('PUT /users/:id lokasi & pos → 200', asg.status === 200, `status=${asg.status} ${asg.text.slice(0, 120)}`);
  const me2 = await req('GET', '/api/auth/me', { token: tok.anggota });
  ok('profil anggota kini di lokasi uji', me2.json?.lokasi_id === created.lokasi && me2.json?.pos_jaga_id === created.pos, JSON.stringify({ l: me2.json?.lokasi_id, p: me2.json?.pos_jaga_id }));

  console.log('-- 4. Absensi');
  const absBad = await req('POST', '/api/absensi', { token: tok.anggota, body: { tipe: 'nongkrong', latitude: 0.5071, longitude: 101.4478 } });
  ok('absensi tipe tidak valid → 400', absBad.status === 400, `status=${absBad.status}`);
  const idem = `uji-abs-${stamp}`;
  const abs = await req('POST', '/api/absensi', { token: tok.anggota, body: { tipe: 'masuk', latitude: 0.5071, longitude: 101.4478, pos_jaga: `Pos Uji ${stamp}`, dalam_radius: true, idempotency_key: idem } });
  const absId = unwrap(abs.json)?.id;
  ok('absensi masuk → 201/200', (abs.status === 201 || abs.status === 200) && absId, `status=${abs.status} ${abs.text.slice(0, 120)}`);
  const abs2 = await req('POST', '/api/absensi', { token: tok.anggota, body: { tipe: 'masuk', latitude: 0.5071, longitude: 101.4478, idempotency_key: idem } });
  ok('absensi ulang idempotency sama → id sama (tidak duplikat)', unwrap(abs2.json)?.id === absId, `id2=${unwrap(abs2.json)?.id}`);
  const list = await req('GET', `/api/absensi?lokasi_id=${created.lokasi}&limit=20`, { token: tok.admin });
  ok('absensi tampil di daftar lokasi uji (admin)', rows(list.json).some((r) => r.id === absId), `n=${rows(list.json).length}`);
  const listKmd = await req('GET', `/api/absensi?lokasi_id=${created.lokasi}&limit=20`, { token: tok.komandan });
  ok('komandan lokasi lain TIDAK melihat absensi lokasi uji (scope)', listKmd.status === 200 && !rows(listKmd.json).some((r) => r.id === absId), `n=${rows(listKmd.json).length}`);
  const today = await req('GET', '/api/absensi/today', { token: tok.anggota });
  ok('anggota melihat absensinya hari ini', rows(today.json).some((r) => r.id === absId));

  console.log('-- 5. Patroli');
  const cpid = `uji-patrol-${stamp}`;
  const st = await req('POST', '/api/patroli/start', { token: tok.anggota, body: { route_id: created.route, route_name: `Rute Uji ${stamp}`, client_patrol_id: cpid } });
  const patId = unwrap(st.json)?.id;
  ok('mulai patroli → id', (st.status === 201 || st.status === 200) && patId, `status=${st.status} ${st.text.slice(0, 120)}`);
  const scan = await req('POST', `/api/patroli/${patId}/scan`, { token: tok.anggota, body: { checkpoint_id: created.cp, idempotency_key: `uji-scan-${stamp}`, client_patrol_id: cpid } });
  ok('scan checkpoint → 200/201', scan.status === 200 || scan.status === 201, `status=${scan.status} ${scan.text.slice(0, 120)}`);
  const scanOrphan = await req('POST', `/api/patroli/offline/scan`, { token: tok.anggota, body: { checkpoint_id: created.cp, idempotency_key: `uji-scan2-${stamp}`, client_patrol_id: `tidak-ada-${stamp}` } });
  ok('scan dengan client_patrol_id belum tersinkron → 409', scanOrphan.status === 409, `status=${scanOrphan.status} ${scanOrphan.text.slice(0, 80)}`);
  const end = await req('PUT', `/api/patroli/${patId}/end`, { token: tok.anggota, body: { checkpoint_scanned: 1, checkpoint_total: 1, client_patrol_id: cpid } });
  ok('selesai patroli → 200', end.status === 200, `status=${end.status} ${end.text.slice(0, 120)}`);
  const patList = await req('GET', `/api/patroli?lokasi_id=${created.lokasi}&limit=10`, { token: tok.admin });
  ok('patroli tampil untuk lokasi uji', rows(patList.json).some((r) => r.id === patId), `n=${rows(patList.json).length}`);

  console.log('-- 6. Bersihkan');
  const back = await req('PUT', `/api/users/${agtId}`, { token: tok.admin, body: { lokasi_id: agtLokasiAsal, pos_jaga_id: agtPosAsal } });
  ok('kembalikan penempatan anggota', back.status === 200, `status=${back.status}`);
  // Rute & checkpoint sudah dirujuk riwayat patroli/scan → server harus menjawab 409 yang jelas
  // (bukan 500), lalu jalur yang benar adalah menonaktifkan.
  const delRoute = await req('DELETE', `/api/data/routes/${created.route}`, { token: tok.admin });
  ok('hapus rute yang dipakai patroli → 409 pesan jelas', delRoute.status === 409 && /tidak bisa dihapus/i.test(delRoute.json?.error || ''), `status=${delRoute.status} ${delRoute.text.slice(0, 100)}`);
  const offRoute = await req('PUT', `/api/data/routes/${created.route}`, { token: tok.admin, body: { status: 'inactive' } });
  ok('nonaktifkan rute uji → 200', offRoute.status === 200, `status=${offRoute.status} ${offRoute.text.slice(0, 80)}`);
  const delCp = await req('DELETE', `/api/data/checkpoints/${created.cp}`, { token: tok.admin });
  ok('hapus checkpoint yang sudah discan → 409', delCp.status === 409, `status=${delCp.status} ${delCp.text.slice(0, 80)}`);
  const offCp = await req('PUT', `/api/data/checkpoints/${created.cp}`, { token: tok.admin, body: { status: 'inactive' } });
  ok('nonaktifkan checkpoint uji → 200', offCp.status === 200, `status=${offCp.status}`);
  const delPos = await req('DELETE', `/api/data/pos-jaga/${created.pos}`, { token: tok.admin });
  ok('hapus pos uji (tidak dirujuk lagi) → 200', delPos.status === 200, `status=${delPos.status} ${delPos.text.slice(0, 80)}`);
  const delLok = await req('DELETE', `/api/data/lokasi/${created.lokasi}`, { token: tok.admin });
  ok('hapus lokasi yang masih punya riwayat → 409', delLok.status === 409, `status=${delLok.status} ${delLok.text.slice(0, 80)}`);
  const offLok = await req('PUT', `/api/data/lokasi/${created.lokasi}`, { token: tok.admin, body: { status: 'inactive' } });
  ok('nonaktifkan lokasi uji → 200 (data uji tersisa hanya di DB salinan)', offLok.status === 200, `status=${offLok.status}`);
  const dup = await req('POST', '/api/data/checkpoints', { token: tok.admin, body: { nama: 'Dup', area: 'X', lokasi_id: created.lokasi, latitude: 0.5, longitude: 101.4, radius: 20, qr_code: `QR-UJI-${stamp}`, status: 'active' } });
  ok('qr_code duplikat → 409 pesan jelas (bukan 500)', dup.status === 409, `status=${dup.status} ${dup.text.slice(0, 100)}`);

  console.log(`\nRINGKASAN: PASS=${pass} FAIL=${fail}`);
  if (fail) { console.log('Gagal: ' + failures.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('Uji berhenti karena error:', e); process.exit(1); });
