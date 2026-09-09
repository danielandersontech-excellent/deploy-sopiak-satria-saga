/**
 * CLIENT IP ASLI DI BALIK CLOUDFLARE (Misi V3 / B1).
 *
 * Topologi produksi: klien → Cloudflare (proxy) → Traefik (Coolify) → backend.
 * `app.set('trust proxy', 1)` membuat Express memercayai satu hop (Traefik),
 * tetapi Traefik MENIMPA X-Forwarded-For dengan alamat peer langsungnya, yaitu
 * IP edge Cloudflare. Akibat terukur di access.log produksi: semua request
 * tercatat dari 104.22.x / 162.158.x (Cloudflare), bukan IP pengguna.
 *
 * Dampak: rate limiter login (50/15 menit "per IP") dibagi oleh SEMUA pengguna
 * yang lewat edge yang sama → saat ganti shift, login bisa ditolak 429 secara
 * kolektif; audit log & log akses tidak lagi berguna untuk forensik.
 *
 * Cloudflare selalu mengirim header `CF-Connecting-IP` berisi IP klien asli,
 * dan Traefik meneruskan header tersebut apa adanya. Header ini HANYA dipercaya
 * bila peer yang terlihat Express (req.ip) memang berada dalam rentang IP
 * Cloudflare (fail-closed: request yang menembus langsung ke Traefik dengan
 * header palsu tidak akan dipercaya).
 *
 * Env: TRUST_CLOUDFLARE_IP=false untuk menonaktifkan.
 * Rentang IP: https://www.cloudflare.com/ips/ (stabil bertahun-tahun; bila
 * Cloudflare menambah rentang, tambahkan lewat CLOUDFLARE_IP_RANGES_EXTRA
 * berformat CIDR dipisah koma).
 */
const net = require('net');

const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

function ipv4ToInt(ip) {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function ipv6ToBigInt(ip) {
  let addr = ip;
  // Buang zone id (fe80::1%eth0) bila ada.
  const zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);
  // IPv4 tersemat (::ffff:1.2.3.4) → konversi bagian akhir ke hex.
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    addr = `${addr.slice(0, lastColon + 1)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...rest];
  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    value = (value << 16n) + BigInt(parseInt(g, 16));
  }
  return value;
}

function parseCidr(cidr) {
  const [base, bitsRaw] = cidr.trim().split('/');
  const bits = parseInt(bitsRaw, 10);
  if (net.isIPv4(base)) {
    const ip = ipv4ToInt(base);
    if (ip === null || !(bits >= 0 && bits <= 32)) return null;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { family: 4, network: (ip & mask) >>> 0, mask };
  }
  if (net.isIPv6(base)) {
    const ip = ipv6ToBigInt(base);
    if (ip === null || !(bits >= 0 && bits <= 128)) return null;
    const mask = bits === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - bits)) - 1n);
    return { family: 6, network: ip & mask, mask };
  }
  return null;
}

const extra = (process.env.CLOUDFLARE_IP_RANGES_EXTRA || '').split(',').map((s) => s.trim()).filter(Boolean);
const RANGES = [...CLOUDFLARE_RANGES, ...extra].map(parseCidr).filter(Boolean);

/** True bila `ip` berada dalam rentang Cloudflare. */
function isCloudflareIp(ip) {
  if (typeof ip !== 'string' || !ip) return false;
  let addr = ip;
  if (addr.startsWith('::ffff:') && net.isIPv4(addr.slice(7))) addr = addr.slice(7);
  if (net.isIPv4(addr)) {
    const v = ipv4ToInt(addr);
    if (v === null) return false;
    return RANGES.some((r) => r.family === 4 && ((v & r.mask) >>> 0) === r.network);
  }
  if (net.isIPv6(addr)) {
    const v = ipv6ToBigInt(addr);
    if (v === null) return false;
    return RANGES.some((r) => r.family === 6 && (v & r.mask) === r.network);
  }
  return false;
}

/**
 * Middleware Express: bila peer adalah Cloudflare dan CF-Connecting-IP valid,
 * timpa `req.ip` (getter prototipe Express) dengan own-property berisi IP klien.
 * Rate limiter, morgan (:remote-addr), dan audit log otomatis memakai nilai ini.
 */
function cloudflareRealIp() {
  const enabled = String(process.env.TRUST_CLOUDFLARE_IP || 'true').toLowerCase() !== 'false';
  return function cloudflareRealIpMiddleware(req, res, next) {
    if (!enabled) return next();
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf !== 'string' || !net.isIP(cf)) return next();
    if (!isCloudflareIp(req.ip)) return next();
    Object.defineProperty(req, 'ip', { value: cf, configurable: true, enumerable: true, writable: false });
    next();
  };
}

module.exports = { cloudflareRealIp, isCloudflareIp };
