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
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ===== TRUST PROXY =====
// Express must trust upstream proxies (Coolify Traefik + Cloudflare) so that
// req.ip, req.protocol, req.secure reflect actual client values from
// X-Forwarded-* headers. Without this, rate limiting throttles ALL users
// together (everyone shares one internal Docker IP), and req.secure is always
// false even behind HTTPS.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// ===== MIDDLEWARE =====
app.use(helmet({ crossOriginResourcePolicy: false }));

// Gzip compression - reduce response size 60-80%
app.use(compression({ threshold: 1024 }));

// CORS - domain spesifik (bukan wildcard)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
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
    // Coba extract user ID dari JWT token untuk rate limit per-user
    try {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
        return `user:${decoded.id}`; // Rate limit by user ID
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
  console.error('[Error]', err.message);
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
