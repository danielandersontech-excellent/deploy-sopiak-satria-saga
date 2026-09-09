/**
 * PUBLIC RATE LIMITER — endpoint publik tanpa login (formulir rekrutmen).
 *
 * Endpoint publik adalah target spam/bot paling mudah karena tidak ada
 * kredensial. Dua limiter:
 *   - rekrutmenSubmitLimiter : POST /api/rekrutmen/publik
 *                              5 pengiriman / 15 menit per IP (file ikut
 *                              di-parse HANYA bila lolos limiter — dipasang
 *                              SEBELUM multer, sama seperti uploadLimit.js).
 *   - rekrutmenStatusLimiter : GET /api/rekrutmen/publik/status
 *                              30 permintaan / 15 menit per IP (anti-enumerasi
 *                              nomor referensi).
 *
 * Bypass hanya lewat utils/rateLimitBypass (fail-closed) untuk pengujian.
 * Override via env (opsional):
 *   REKRUTMEN_RATE_MAX        = maksimum pengiriman per window (default 5)
 *   REKRUTMEN_RATE_WINDOW_MS  = window dalam milidetik (default 900000)
 */
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const { isBypassed } = require('../utils/rateLimitBypass');

const WINDOW_MS = parseInt(process.env.REKRUTMEN_RATE_WINDOW_MS || '') || 15 * 60 * 1000;
const SUBMIT_MAX = parseInt(process.env.REKRUTMEN_RATE_MAX || '') || 5;
const STATUS_MAX = 30;

function handler(label) {
  return (req, res) => {
    logger.warn(`[RATE_LIMIT_${label}] IP: ${req.ip} path: ${req.originalUrl}`);
    res.status(429).json({
      error: `Terlalu banyak percobaan. Silakan coba lagi dalam ${Math.ceil(WINDOW_MS / 60000)} menit.`,
    });
  };
}

const rekrutmenSubmitLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: SUBMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: isBypassed,
  handler: handler('REKRUTMEN'),
});

const rekrutmenStatusLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: STATUS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: isBypassed,
  handler: handler('REKRUTMEN_STATUS'),
});

module.exports = { rekrutmenSubmitLimiter, rekrutmenStatusLimiter };
