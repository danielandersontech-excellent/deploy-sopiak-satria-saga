/**
 * KUNCI RATE LIMIT BERBASIS IP.
 *
 * express-rate-limit ≥ 7.5 menyediakan ipKeyGenerator(ip) yang meringkas
 * IPv6 ke subnet /56 (satu pengguna IPv6 biasanya memegang seluruh /64
 * sehingga per-alamat bisa dilewati dengan berganti alamat). Untuk IPv4
 * nilainya tetap alamat apa adanya. Dibungkus di sini agar semua limiter
 * (app.js, publicLimit.js) memakai kunci yang sama dan tetap berjalan pada
 * versi library yang belum memiliki helper tersebut.
 */
let ipKeyGenerator = null;
try {
  ({ ipKeyGenerator } = require('express-rate-limit'));
} catch { /* fallback di bawah */ }

function ipKey(ip) {
  const value = typeof ip === 'string' && ip ? ip : 'unknown';
  if (typeof ipKeyGenerator === 'function') {
    try { return ipKeyGenerator(value); } catch { /* fallback */ }
  }
  return value;
}

module.exports = { ipKey };
