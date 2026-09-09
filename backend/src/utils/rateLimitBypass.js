/**
 * RATE LIMIT BYPASS — helper tunggal untuk header `X-Skip-Rate-Limit`.
 *
 * Sebelumnya setiap limiter memakai
 *   process.env.RATE_LIMIT_BYPASS_SECRET || '__test_bypass__'
 * sehingga bila env KOSONG (kondisi produksi saat audit), nilai fallback
 * '__test_bypass__' AKTIF dan siapa pun yang tahu string itu (ada di repo
 * publik) bisa melewati rate limit login/refresh/upload. Itu fail-OPEN.
 *
 * Sekarang fail-CLOSED: bypass hanya berlaku bila secret di-set, panjangnya
 * wajar (≥ 16 karakter), dan header cocok persis. Perbandingan memakai
 * timingSafeEqual agar tidak bocor lewat timing.
 */
const crypto = require('crypto');

const MIN_SECRET_LENGTH = 16;

function isBypassed(req) {
  const secret = process.env.RATE_LIMIT_BYPASS_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  const header = req && req.headers ? req.headers['x-skip-rate-limit'] : undefined;
  if (typeof header !== 'string' || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(secret));
  } catch {
    return false;
  }
}

module.exports = { isBypassed };
