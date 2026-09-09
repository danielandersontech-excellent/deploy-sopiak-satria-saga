/**
 * MAINTENANCE JOBS — perawatan data ringan harian ([Audit 2A]).
 *
 * Dijalankan sekali saat boot (tertunda 2 menit agar tidak berebut dengan
 * bootstrap) lalu setiap 24 jam. Semua langkah idempotent, hanya menyentuh
 * data yang jelas kedaluwarsa, dan dicatat ke logger:
 *
 *   1. refresh_tokens kedaluwarsa dihapus (audit: 23/23 baris di produksi
 *      sudah expired dan tidak pernah dibersihkan).
 *   2. patroli 'active' > PATROLI_STALE_HOURS (default 24) ditutup sebagai
 *      'incomplete' (audit: 1 patroli aktif sejak 16 Mei 2026).
 *   3. location_history > LOCATION_HISTORY_DAYS (default 180) dipangkas —
 *      tabel ini bertambah setiap ping GPS dan tidak dipakai untuk audit
 *      jangka panjang (live map hanya memakai users.last_latitude/longitude).
 *
 * Nonaktifkan dengan MAINTENANCE_ENABLED=false.
 */
const { query } = require('../config/database');
const { logger } = require('./logger');
const patroliRepo = require('../repositories/patroli.repository');

const STALE_HOURS = parseInt(process.env.PATROLI_STALE_HOURS || '24', 10) || 24;
const HISTORY_DAYS = parseInt(process.env.LOCATION_HISTORY_DAYS || '180', 10) || 180;

async function runMaintenance() {
  const summary = {};
  try {
    const r = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    summary.refresh_tokens_expired = r.rowCount;
  } catch (e) { logger.warn(`[Maintenance] refresh_tokens: ${e.message}`); }

  try {
    summary.patroli_ditutup = await patroliRepo.closeStale(STALE_HOURS);
  } catch (e) { logger.warn(`[Maintenance] patroli stale: ${e.message}`); }

  try {
    const r = await query(`DELETE FROM location_history WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(HISTORY_DAYS)]);
    summary.location_history_dihapus = r.rowCount;
  } catch (e) { logger.warn(`[Maintenance] location_history: ${e.message}`); }

  logger.info(`[Maintenance] Selesai: ${JSON.stringify(summary)}`);
  return summary;
}

function scheduleMaintenance() {
  const enabled = String(process.env.MAINTENANCE_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) { logger.info('[Maintenance] Dinonaktifkan (MAINTENANCE_ENABLED=false)'); return; }
  setTimeout(() => {
    runMaintenance().catch((e) => logger.error(`[Maintenance] Gagal: ${e.message}`));
    setInterval(() => {
      runMaintenance().catch((e) => logger.error(`[Maintenance] Gagal: ${e.message}`));
    }, 24 * 60 * 60 * 1000);
  }, 2 * 60 * 1000);
  logger.info(`[Maintenance] Terjadwal (stale patroli > ${STALE_HOURS} jam, location_history > ${HISTORY_DAYS} hari)`);
}

module.exports = { runMaintenance, scheduleMaintenance };
