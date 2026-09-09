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
 *   4. [Audit putaran 2] geofence_izin 'approved' yang batas_waktu-nya lewat
 *      ditandai 'expired' (setiap IZIN_EXPIRE_MINUTES, default 10 menit).
 *      Sebelumnya status hanya dihitung "on the fly" di geofence.service
 *      sehingga web-admin/mobile terus menampilkan "Disetujui" (audit: 8 izin
 *      approved dengan batas Mei 2026 masih tercatat approved).
 *
 * Nonaktifkan dengan MAINTENANCE_ENABLED=false.
 */
const { query, queryAll } = require('../config/database');
const { logger } = require('./logger');
const patroliRepo = require('../repositories/patroli.repository');
const laporanRepo = require('../repositories/laporan.repository');
const opRepo = require('../repositories/operasional.repository');

// [Misi V3 / C2] pengingat laporan pending lama ke komandan lokasi terkait.
const PENDING_REMINDER_DAYS = parseInt(process.env.PENDING_REMINDER_DAYS || '30', 10) || 30;
const PENDING_REMINDER_ENABLED = String(process.env.PENDING_REMINDER_ENABLED || 'true').toLowerCase() !== 'false';
// [Misi V3 / D3] retensi notifikasi: sudah dibaca > 90 hari atau apa pun > 180 hari dihapus.
const NOTIF_READ_RETENTION_DAYS = parseInt(process.env.NOTIF_READ_RETENTION_DAYS || '90', 10) || 90;
const NOTIF_RETENTION_DAYS = parseInt(process.env.NOTIF_RETENTION_DAYS || '180', 10) || 180;

/**
 * Kirim satu notifikasi per komandan per hari untuk lokasi yang memiliki
 * laporan pending berumur > PENDING_REMINDER_DAYS. Tidak mengubah laporan —
 * keputusan validasi tetap di tangan komandan (klik notifikasi → filter
 * "Pending > 30 hari" di web-admin/mobile).
 */
async function remindPendingLaporan() {
  if (!PENDING_REMINDER_ENABLED) return 0;
  const rekap = await laporanRepo.findPendingLamaPerLokasi(PENDING_REMINDER_DAYS);
  let terkirim = 0;
  for (const r of rekap) {
    const komandan = await queryAll(
      `SELECT id FROM users WHERE role = 'komandan' AND lokasi_id = $1 AND status_penempatan IS DISTINCT FROM 'nonaktif'`,
      [r.lokasi_id]
    );
    if (komandan.length === 0) continue;
    const umurTertua = r.tertua ? Math.floor((Date.now() - new Date(r.tertua).getTime()) / 86400000) : null;
    const targets = [];
    for (const k of komandan) {
      if (!(await opRepo.hasNotifToday(k.id, 'pending_reminder'))) targets.push(k.id);
    }
    if (targets.length === 0) continue;
    terkirim += await opRepo.createNotifikasiForUsers(targets, {
      tipe: 'warning',
      judul: `${r.jumlah} laporan menunggu validasi > ${PENDING_REMINDER_DAYS} hari`,
      pesan: `${r.lokasi_nama || 'Lokasi Anda'}: ${r.jumlah} laporan masih berstatus menunggu${umurTertua != null ? ` (tertua ${umurTertua} hari)` : ''}. Mohon ditinjau dan divalidasi.`,
      data: { kind: 'pending_reminder', entity: 'laporan_harian', lokasi_id: r.lokasi_id, jumlah: r.jumlah, min_age_days: PENDING_REMINDER_DAYS, path: `/laporan-harian?min_age_days=${PENDING_REMINDER_DAYS}&status=pending` },
    });
  }
  if (terkirim > 0) logger.info(`[Maintenance] pengingat laporan pending lama terkirim ke ${terkirim} komandan`);
  return terkirim;
}

const STALE_HOURS = parseInt(process.env.PATROLI_STALE_HOURS || '24', 10) || 24;
const HISTORY_DAYS = parseInt(process.env.LOCATION_HISTORY_DAYS || '180', 10) || 180;
const IZIN_EXPIRE_MINUTES = parseInt(process.env.IZIN_EXPIRE_MINUTES || '10', 10) || 10;

/** Tandai izin keluar yang sudah melewati batas waktu sebagai 'expired'. */
async function expireIzin() {
  const r = await query(
    `UPDATE geofence_izin SET status = 'expired', updated_at = NOW()
      WHERE status = 'approved' AND batas_waktu IS NOT NULL AND batas_waktu < NOW()`
  );
  if (r.rowCount > 0) logger.info(`[Maintenance] izin kedaluwarsa ditandai expired: ${r.rowCount}`);
  return r.rowCount;
}

async function runMaintenance() {
  const summary = {};
  try {
    const r = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    summary.refresh_tokens_expired = r.rowCount;
  } catch (e) { logger.warn(`[Maintenance] refresh_tokens: ${e.message}`); }

  try {
    summary.izin_expired = await expireIzin();
  } catch (e) { logger.warn(`[Maintenance] izin expired: ${e.message}`); }

  try {
    summary.patroli_ditutup = await patroliRepo.closeStale(STALE_HOURS);
  } catch (e) { logger.warn(`[Maintenance] patroli stale: ${e.message}`); }

  try {
    const r = await query(`DELETE FROM location_history WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(HISTORY_DAYS)]);
    summary.location_history_dihapus = r.rowCount;
  } catch (e) { logger.warn(`[Maintenance] location_history: ${e.message}`); }

  try {
    summary.notifikasi_dihapus = await opRepo.purgeOld(NOTIF_READ_RETENTION_DAYS, NOTIF_RETENTION_DAYS);
  } catch (e) { logger.warn(`[Maintenance] notifikasi lama: ${e.message}`); }

  try {
    summary.pengingat_pending = await remindPendingLaporan();
  } catch (e) { logger.warn(`[Maintenance] pengingat laporan pending: ${e.message}`); }

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
    // Izin keluar berdurasi menit → dicek lebih sering daripada job harian.
    setInterval(() => {
      expireIzin().catch((e) => logger.warn(`[Maintenance] izin expired: ${e.message}`));
    }, IZIN_EXPIRE_MINUTES * 60 * 1000);
  }, 2 * 60 * 1000);
  logger.info(`[Maintenance] Terjadwal (stale patroli > ${STALE_HOURS} jam, location_history > ${HISTORY_DAYS} hari, izin expired tiap ${IZIN_EXPIRE_MINUTES} menit)`);
}

module.exports = { runMaintenance, scheduleMaintenance, expireIzin, remindPendingLaporan };
