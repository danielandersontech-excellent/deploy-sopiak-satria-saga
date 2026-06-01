/**
 * SEED SCRIPT - Create initial users
 * Run: node src/utils/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, queryOne } = require('../config/database');

async function seed() {
  console.log('🌱 Seeding database...\n');
  // P0-15: rounds come from BCRYPT_ROUNDS env (default 12) so this dev
  //        seed matches the work factor used by bootstrap.js / auth.service.js
  //        / data.service.js. Previously hardcoded to 10.
  // Note: PIN '123456' is intentionally retained here because this script
  //       is *only* run manually by developers (`node src/utils/seed.js`)
  //       to populate a local dev DB with predictable credentials. The
  //       production-facing bootstrap.js seeds with random per-user PINs.
  const pin = await bcrypt.hash('123456', parseInt(process.env.BCRYPT_ROUNDS || '12'));

  const users = [
    { nrp: 'ADM001', nama: 'Admin System', role: 'admin', shift: '08:00-16:00' },
    { nrp: 'SPV001', nama: 'Budi Supervisor', role: 'supervisor', shift: '08:00-16:00' },
    { nrp: 'KMD001', nama: 'Andi Komandan', role: 'komandan', shift: '06:00-14:00' },
    { nrp: 'AGT001', nama: 'Rudi Satpam', role: 'anggota', shift: '06:00-14:00' },
    { nrp: 'AGT002', nama: 'Siti Security', role: 'anggota', shift: '14:00-22:00' },
    { nrp: 'AGT003', nama: 'Joko Patrol', role: 'anggota', shift: '22:00-06:00' },
  ];

  for (const u of users) {
    try {
      // P1-6: case-insensitive existence check, matches auth.repository.js
      const existing = await queryOne('SELECT id FROM users WHERE UPPER(nrp) = UPPER($1)', [u.nrp]);
      if (existing) { console.log(`  ⏭️  ${u.nrp} sudah ada`); continue; }
      await queryOne(
        'INSERT INTO users (nrp, nama, role, shift, pin_hash, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.nrp, u.nama, u.role, u.shift, pin, 'off_duty']
      );
      console.log(`  ✅ ${u.nrp} - ${u.nama} (${u.role}) - PIN: 123456`);
    } catch (e) { console.error(`  ❌ ${u.nrp}: ${e.message}`); }
  }

  console.log('\n✅ Seed selesai! Semua user PIN default: 123456\n');
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });