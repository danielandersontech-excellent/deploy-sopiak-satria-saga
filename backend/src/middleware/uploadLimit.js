/**
 * UPLOAD RATE LIMITER — Tahap 9 Bug #1 (P2-9)
 * =============================================
 * Membatasi jumlah upload file per IP untuk mencegah abuse:
 *   - Spam upload file kecil → disk penuh → semua layanan down.
 *   - Brute-force scanning endpoint upload untuk path traversal probe.
 *
 * Konfigurasi default:
 *   - 30 upload per 15 menit per IP
 *   - Response 429 + pesan ID
 *   - Setiap kali rate limit tercapai, di-log via logger.warn
 *
 * Override via env (opsional):
 *   UPLOAD_RATE_WINDOW_MS = milidetik window (default 900000 = 15 menit)
 *   UPLOAD_RATE_MAX       = maksimum upload per window (default 30)
 *
 * Catatan: middleware ini di-mount SEBELUM multer di setiap route upload,
 * sehingga request yang ditolak tidak membuang bandwidth untuk parse body.
 */
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

const WINDOW_MS = parseInt(process.env.UPLOAD_RATE_WINDOW_MS || '') || 15 * 60 * 1000;
const MAX_UPLOADS = parseInt(process.env.UPLOAD_RATE_MAX || '') || 30;

// Bypass secret yang sama dengan rate limit lain di app.js, supaya developer
// bisa testing batch upload tanpa kena lock.
const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_BYPASS_SECRET || '__test_bypass__';

const uploadLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_UPLOADS,
  standardHeaders: true,
  legacyHeaders: false,
  // keyGenerator default = req.ip. Trust proxy = 1 di app.js sudah memastikan
  // req.ip mencerminkan IP klien asli (bukan IP container internal),
  // jadi rate limit per-IP berfungsi dengan benar.
  keyGenerator: (req) => req.ip,
  skip: (req) => req.headers['x-skip-rate-limit'] === RATE_LIMIT_SECRET,
  // Custom handler supaya bisa nge-log dan pakai pesan Indonesia yang
  // konsisten dengan endpoint lain (login, general API).
  handler: (req, res /* , next, options */) => {
    logger.warn(
      `[RATE_LIMIT_UPLOAD] IP: ${req.ip} path: ${req.originalUrl} method: ${req.method}`
    );
    res.status(429).json({
      error: `Terlalu banyak upload. Coba lagi dalam ${Math.ceil(WINDOW_MS / 60000)} menit.`,
    });
  },
});

module.exports = { uploadLimiter };