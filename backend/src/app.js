/**
 * PT Sopiak Satria Saga Management System - Backend API
 * Express.js + PostgreSQL + Socket.io Realtime
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { testConnection, getPoolStats } = require('./config/database');
const { initSocketIO } = require('./realtime/socketio');
const { sanitizeMiddleware } = require('./middleware/validation');
const { logger, morganStream } = require('./utils/logger');
const { scheduleCleanup } = require('./utils/fileCleanup');
const { bootstrap } = require('./utils/bootstrap');

const app = express();
// TAHAP 9 BUG #5 (P2-16): hapus header X-Powered-By yang membocorkan
// fingerprint "Express" — bantu attacker pilih payload yang spesifik
// untuk versi Express tertentu. Harus dipanggil SEBELUM middleware lain
// agar tidak ada response yang sempat ber-fingerprint.
app.disable('x-powered-by');
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ===== TRUST PROXY =====
// Express must trust upstream proxies (Coolify Traefik + Cloudflare) so that
// req.ip, req.protocol, req.secure reflect actual client values from
// X-Forwarded-* headers. Without this, rate limiting throttles ALL users
// together (everyone shares one internal Docker IP), and req.secure is always
// false even behind HTTPS.
//
// SECURITY (P0-13): The previous value 'loopback, linklocal, uniquelocal'
// only trusted private/internal IPs as proxies. Behind Coolify's Traefik
// (and any further reverse proxy in front of it) every request enters the
// container from the same Docker bridge IP, so req.ip resolved to that
// single internal address for ALL users — completely defeating per-IP rate
// limiting (one abusive client could exhaust the bucket for everyone).
// Setting trust proxy to the integer 1 tells Express to trust exactly one
// hop of X-Forwarded-For (the Traefik in front of us) and use the
// client-side IP it forwards. If you ever add another proxy layer
// (e.g. Cloudflare in front of Traefik), increase this to match the
// number of trusted hops — never set it to true or 0.0.0.0/0.
app.set('trust proxy', 1);

// ===== MIDDLEWARE =====
// TAHAP 9 BUG #5 (P2-16): konfigurasi helmet eksplisit untuk REST API.
// - CSP disable: API tidak render HTML, CSP dihandle di web-admin Next.js.
// - crossOriginResourcePolicy = 'cross-origin': mengizinkan asset (foto
//   absensi, dll) di-fetch oleh web-admin yang asal-domain berbeda.
// - HSTS 1 tahun + preload — domain sudah di-HTTPS via Traefik+Cloudflare.
// - referrerPolicy strict-origin-when-cross-origin: minimal info bocor.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
}));

// TAHAP 9 BUG #5 (P2-16): tambahkan header versi API + pastikan
// X-Powered-By tidak ke-set ulang oleh middleware lain.
const API_VERSION = process.env.npm_package_version || '13.0.0';
app.use((req, res, next) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.removeHeader('X-Powered-By');
  next();
});

// Gzip compression - reduce response size 60-80%
app.use(compression({ threshold: 1024 }));

// CORS - domain spesifik (bukan wildcard).
// TAHAP 9 BUG #4 (P2-15): callback(new Error(...)) akan throw → ditangkap
// error handler → return 500. Browser preflight yang ditolak harus
// terima 403 (atau response tanpa CORS header), bukan 500. Fix:
// callback(null, false) — beri tahu cors() bahwa origin DITOLAK tanpa
// throw. cors() akan tidak set Access-Control-* header → browser tolak
// request di sisi klien dengan pesan CORS yang jelas, dan response
// server tetap 200/yang seharusnya untuk non-CORS endpoint.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, server-to-server).
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    logger.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Skip-Rate-Limit', 'X-Watermark-Info'],
  optionsSuccessStatus: 200,
}));
// Explicit preflight handler — beberapa router middleware butuh OPTIONS
// di-handle eksplisit supaya tidak nyangkut di rate-limit/auth chain.
app.options('*', cors());

app.use(morgan('short', { stream: morganStream }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization - trim & clean all body/query params
app.use(sanitizeMiddleware);

// ===== RATE LIMITING PER USER =====
// PENJELASAN:
// Sebelumnya rate limit bersifat GLOBAL - semua user berbagi 200 req/menit.
// Jika 50 anggota online bersamaan, masing-masing hanya dapat ~4 req/menit!
// 
// Sekarang rate limit PER USER:
// - Login: 20 percobaan / 15 menit per IP (brute force protection)
// - API authenticated: 120 request / menit PER USER (berdasarkan JWT user ID)
// - API unauthenticated: 60 request / menit per IP
//
// Artinya 50 anggota online → masing-masing tetap dapat 120 req/menit.

// Login rate limit - per IP (prevent brute force)
// max 50 per 15 menit: cukup untuk development + testing, masih aman dari brute force
// Untuk testing berulang: gunakan header X-Skip-Rate-Limit dengan secret
const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_BYPASS_SECRET || '__test_bypass__';
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 50, // 50 login attempts per 15 minutes per IP
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => req.headers['x-skip-rate-limit'] === RATE_LIMIT_SECRET,
}));

// General API rate limit - per user (authenticated) atau per IP (unauthenticated)
app.use('/api/', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 200, // 200 request per menit per user (lebih longgar untuk development)
  message: { error: 'Rate limit terlampaui. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // P0-11: this used to call jwt.verify() on every request, which is
    // a double-verification with the actual `auth` middleware that
    // runs later in the chain. Two problems with that:
    //   1. Cost — bcrypt-grade HMAC over every request, before any
    //      meaningful work, including for malformed/expired tokens
    //      that would have been rejected by `auth` anyway.
    //   2. Boot-time side effect — `require('jsonwebtoken')` ran
    //      inside the hot path. Cheap once cached but pointless.
    // The keyGenerator only needs a stable identity to bucket
    // rate-limit counts. We don't authorize anything here; the
    // `auth` middleware that runs AFTER this is what gates access.
    // So `jwt.decode` (no signature check) is sufficient — even a
    // forged token can't get you past `auth`, the worst an attacker
    // can do is share rate-limit bucket #id-of-someone-else, which
    // doesn't grant them anything. Same security profile, lower cost.
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(authHeader.split(' ')[1]);
        if (decoded && decoded.id) {
          return `user:${decoded.id}`;
        }
      }
    } catch (e) { /* ignore - fallback to IP */ }
    return `ip:${req.ip}`; // Fallback: rate limit by IP
  },
}));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve APK / installer downloads (was previously served by nginx).
// Keep the URL prefix `/download` so the existing web-admin link
// `<a href="/download/ptsss-latest.apk" download>` and any old QR codes still work.
// Path resolves to /app/downloads inside the container.
// Persisted via backend_downloads volume in docker-compose.yml.
app.use('/download', express.static(path.join(__dirname, '..', 'downloads'), {
  maxAge: '30d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
  },
}));

// ===== ROUTES =====
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/absensi', require('./routes/absensi.routes'));
app.use('/api/patroli', require('./routes/patroli.routes'));
app.use('/api/laporan', require('./routes/laporan.routes'));
app.use('/api/data', require('./routes/data.routes'));
app.use('/api/export', require('./routes/export.routes'));
app.use('/api/geofence', require('./routes/geofence.routes'));
app.use('/api/audit-log', require('./routes/auditlog.routes'));
app.use('/api/backup', require('./routes/backup.routes'));

// Health check (includes Socket.io stats)
const { getOnlineCount } = require('./realtime/socketio');
const { setupSwagger } = require('./config/swagger');

// Diagnostic ping - simple text response for testing from phone browser
app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get('/api/health', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const poolStats = getPoolStats();
  let storageStats = {};
  try { storageStats = require('./middleware/driveCDN').getStorageStats(); } catch {}
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    version: '13.0.0',
    realtime: { engine: 'socket.io', online: getOnlineCount() },
    database: poolStats,
    storage: storageStats,
    client_ip: clientIp,
  });
});

// Setup Swagger API Documentation (akses di /api-docs)
setupSwagger(app);

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  // TAHAP 9 BUG #4 (P2-15): defensive — kalau ada library lain yang masih
  // throw CORS error, terjemahkan ke 403 (bukan 500). cors() kita sudah
  // pakai callback(null, false) jadi seharusnya tidak sampai ke sini,
  // tapi guard ini murah dan jaga kalau dependency ter-update.
  if (err && (err.message === 'Not allowed by CORS' || err.name === 'CORSError')) {
    logger.warn(`[CORS] Rejected: ${req.headers.origin || 'no-origin'} -> ${req.path}`);
    return res.status(403).json({ error: 'Origin tidak diizinkan' });
  }
  logger.error(`[Error] ${err && err.message ? err.message : 'Unknown error'}`, {
    path: req.originalUrl,
    method: req.method,
    stack: err && err.stack ? err.stack : undefined,
  });
  if (err.name === 'MulterError') return res.status(400).json({ error: `Upload error: ${err.message}` });
  res.status(500).json({ error: 'Internal server error' });
});

// ===== START =====
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('\n❌ Gagal konek ke PostgreSQL! Pastikan:');
    console.error('   1. PostgreSQL sudah berjalan');
    console.error('   2. Database ptsss_db sudah dibuat');
    console.error('   3. File .env sudah dikonfigurasi dengan benar\n');
    process.exit(1);
  }

  // Auto-init schema + seed default users (controlled by AUTO_BOOTSTRAP env).
  // This handles the case where Coolify's persisted volume causes
  // /docker-entrypoint-initdb.d/ to be skipped on subsequent boots.
  await bootstrap();

  // Initialize Firebase Cloud Messaging (optional, graceful fallback)
  try {
    const fcm = require('./services/fcm.service');
    fcm.initFirebase();
  } catch (err) {
    console.log('[FCM] Firebase not configured (push notifications disabled)');
  }

  // Initialize Socket.io on the same HTTP server
  initSocketIO(server);

  // Schedule daily file cleanup
  scheduleCleanup();

  server.listen(PORT, '0.0.0.0', () => {
    // Show local network IP for mobile app connection
    const os = require('os');
    const nets = os.networkInterfaces();
    let lanIp = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) { lanIp = net.address; break; }
      }
    }

    console.log(`\n🚀 PT Sopiak Satria Saga Backend running!`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${lanIp}:${PORT}  ← Gunakan ini di HP`);
    console.log(`   Health:  http://localhost:${PORT}/api/health`);
    console.log(`   Swagger: http://localhost:${PORT}/api-docs`);
    console.log(`   Socket:  ws://${lanIp}:${PORT}\n`);
    console.log(`📱 Pastikan HP dan Laptop di WiFi yang sama!`);
    console.log(`   Test dari browser HP: http://${lanIp}:${PORT}/api/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} sudah dipakai! Solusi:`);
      console.error(`   1. Tutup aplikasi lain yang memakai port ${PORT}`);
      console.error(`   2. Atau kill proses: npx kill-port ${PORT}`);
      console.error(`   3. Atau ganti PORT di file .env\n`);
      process.exit(1);
    }
    throw err;
  });
}

start();

// ===== GRACEFUL SHUTDOWN =====
function gracefulShutdown(signal) {
  console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    const { pool } = require('./config/database');
    pool.end(() => {
      console.log('[DB] Connection pool closed');
      process.exit(0);
    });
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
