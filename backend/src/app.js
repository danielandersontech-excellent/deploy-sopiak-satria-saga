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
// Hapus header X-Powered-By yang membocorkan fingerprint Express.
// Dipanggil SEBELUM middleware lain agar tidak ada response yang sempat
// ber-fingerprint.
app.disable('x-powered-by');
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ===== TRUST PROXY =====
// Express must trust upstream proxies (Coolify Traefik + Cloudflare) so that
// req.ip, req.protocol, req.secure reflect actual client values from
// X-Forwarded-* headers. Without this, rate limiting throttles ALL users
// together (everyone shares one internal Docker IP), and req.secure is always
// false even behind HTTPS.
//
// Setting trust proxy to the integer 1 tells Express to trust exactly one
// hop of X-Forwarded-For (the Traefik in front of us) and use the
// client-side IP it forwards. If you ever add another proxy layer
// (e.g. Cloudflare in front of Traefik), increase this to match the
// number of trusted hops — never set it to true or 0.0.0.0/0.
app.set('trust proxy', 1);

// ===== MIDDLEWARE =====
// Konfigurasi helmet eksplisit untuk REST API.
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

// Tambahkan header versi API + pastikan X-Powered-By tidak ke-set ulang.
const API_VERSION = process.env.npm_package_version || '13.0.0';
app.use((req, res, next) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.removeHeader('X-Powered-By');
  next();
});

// Gzip compression - reduce response size 60-80%
app.use(compression({ threshold: 1024 }));

// CORS - domain spesifik (bukan wildcard). callback(null, false) memberitahu
// cors() bahwa origin ditolak tanpa throw → browser tetap menolak request,
// dan response server tidak jadi 500.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// [1-13] With credentials:true a wildcard ('*') Access-Control-Allow-Origin is
// invalid and unsafe (browsers reject it, and reflecting any origin would let
// any site make credentialed requests). If '*' is configured, warn and ignore
// it — only explicit, allow-listed origins are honoured.
if (allowedOrigins.includes('*')) {
  logger.warn('[CORS] CORS_ORIGIN contains "*", which is ignored because credentials are enabled. Set explicit origins.');
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, server-to-server).
    if (!origin) return callback(null, true);
    // [1-13] never honour '*'; match against the explicit allow-list only.
    if (allowedOrigins.includes(origin)) {
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

// ===== RATE LIMITING =====
// Login: 50 percobaan / 15 menit per IP (brute force protection).
// Refresh: 10 / menit per IP (Tahap 10 Bug — dedicated, lebih ketat dari
// rate limit umum karena refresh adalah endpoint yang sering jadi target
// token-stuffing). Harus dipasang SEBELUM /api/ general limiter agar tidak
// di-bypass oleh skip mechanism.
// API authenticated: 200 request / menit PER USER (berdasarkan JWT user ID).
// API unauthenticated: 200 / menit per IP (fallback).
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

// Tahap 10 (P3-6): dedicated rate limiter for refresh endpoint.
// Refresh token endpoint adalah target umum untuk:
//   - Token stuffing (mencoba refresh token curian secara bulk)
//   - Race-condition exploit (paralel refresh untuk dapat banyak access token)
// 10/min per IP cukup untuk user normal (refresh tiap 30 menit) tetapi
// cukup ketat untuk menahan abuse. Skip-secret untuk testing tetap tersedia.
app.use('/api/auth/refresh', rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 10,
  message: { error: 'Terlalu banyak refresh token. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => req.headers['x-skip-rate-limit'] === RATE_LIMIT_SECRET,
}));

// General API rate limit - per user (authenticated) atau per IP (unauthenticated)
app.use('/api/', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 200, // 200 request per menit per user
  message: { error: 'Rate limit terlampaui. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Pakai jwt.decode (tanpa verifikasi) supaya keyGenerator murah:
    // bucket identity bukan authorization. Bahkan token palsu yang
    // di-decode di sini paling banter hanya share bucket rate-limit
    // dengan user lain — tidak ada akses yang granted.
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

// AUDIT FIX (P2-16): 404 handler now uses a regex matcher instead of
// the string pattern '/api/*'. The regex form is supported in BOTH
// Express 4 (current) and Express 5 (path-to-regexp v6+, which dropped
// support for the bare `*` wildcard in path strings — Express 5
// requires named wildcards like '/api/*splat'). Using a regex keeps
// the same matching semantics across the version boundary with zero
// runtime behaviour change today.
//
// The regex matches any path that starts with `/api/`. Identical in
// every observable way to the previous `'/api/*'` Express 4 pattern.
app.use(/^\/api\//, (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler.
//
// Tahap 10 Bug #12 (P3-8): di production, JANGAN bocorkan err.message ke
// klien — bisa berisi internal detail (path file, query SQL, stack frame).
// Log lengkap ke logger (untuk operator), kirim pesan generik ke klien.
// MulterError tetap mengembalikan pesan asli karena itu validasi user input
// (filesize too large, dst) yang aman untuk ditampilkan.
app.use((err, req, res, next) => {
  // CORS error: defensive — kalau ada library lain yang masih throw CORS
  // error, terjemahkan ke 403 (bukan 500). cors() kita sudah pakai
  // callback(null, false) jadi seharusnya tidak sampai ke sini.
  if (err && (err.message === 'Not allowed by CORS' || err.name === 'CORSError')) {
    logger.warn(`[CORS] Rejected: ${req.headers.origin || 'no-origin'} -> ${req.path}`);
    return res.status(403).json({ error: 'Origin tidak diizinkan' });
  }

  // Log ALWAYS (production atau development — sama-sama butuh log lengkap).
  logger.error(`[Error] ${err && err.message ? err.message : 'Unknown error'}`, {
    path: req.originalUrl,
    method: req.method,
    stack: err && err.stack ? err.stack : undefined,
  });

  // MulterError: user-facing validation message (filesize, mimetype, dst).
  // Aman ditampilkan apa adanya — tidak ada info internal di dalamnya.
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  // P3-8: production response — generik, tidak bocor info internal.
  if (IS_PRODUCTION) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Development: bocorkan detail untuk debugging.
  res.status(500).json({
    error: err && err.message ? err.message : 'Internal server error',
    stack: err && err.stack ? err.stack.split('\n').slice(0, 5) : undefined,
  });
});

// ===== START =====
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    // FATAL pre-exit: console.error (sync) supaya operator lihat di
    // docker logs sebelum container exit. logger.error async via
    // write stream — bisa hilang kalau process.exit() lebih cepat
    // dari stream flush.
    console.error('\n❌ Gagal konek ke PostgreSQL! Pastikan:');
    console.error('   1. PostgreSQL sudah berjalan');
    console.error('   2. Database ptsss_db sudah dibuat');
    console.error('   3. File .env sudah dikonfigurasi dengan benar\n');
    process.exit(1);
  }

  // Auto-init schema + run migrations + seed default users
  // (controlled by AUTO_BOOTSTRAP env). Handles Coolify's persisted
  // volume causing /docker-entrypoint-initdb.d/ to be skipped on
  // subsequent boots. Tahap 10 Bug #1: now also runs migrations.
  await bootstrap();

  // Initialize Firebase Cloud Messaging (optional, graceful fallback)
  try {
    const fcm = require('./services/fcm.service');
    fcm.initFirebase();
  } catch (err) {
    logger.info('[FCM] Firebase not configured (push notifications disabled)');
  }

  // Initialize Socket.io on the same HTTP server
  initSocketIO(server);

  // Schedule daily file cleanup
  scheduleCleanup();

  server.listen(PORT, '0.0.0.0', () => {
    // STARTUP BANNER — intentionally console.log (not logger.info):
    // operator-facing one-time output, equivalent to a CLI tool's startup
    // greeting. Goes to stdout where Coolify/docker-logs captures it,
    // doesn't pollute logs/app.log with multi-line ASCII art on every boot.
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
      // FATAL pre-exit: console.error sync — see note above.
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
  // Note: graceful shutdown messages — use console (sync) because process.exit
  // is imminent and logger write stream might not flush.
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