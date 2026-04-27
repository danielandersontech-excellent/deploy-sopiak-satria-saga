/**
 * SEED SCRIPT - Create initial users
 * Run: node src/utils/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, queryOne } = require('../config/database');

async function seed() {
  console.log('🌱 Seeding database...\n');
  const pin = await bcrypt.hash('123456', 10);

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
      const existing = await queryOne('SELECT id FROM users WHERE nrp = $1', [u.nrp]);
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
