/**
 * ============================================
 * SOCKET.IO REALTIME SERVER
 * ============================================
 * Mengganti polling 60 detik → push realtime instan
 *
 * EVENTS:
 * Server → Client:
 *   'absensi:new'        - Ada absensi baru
 *   'patroli:update'     - Patroli mulai/scan/selesai
 *   'laporan:new'        - Laporan harian/kejadian baru
 *   'laporan:validated'  - Laporan di-approve/revisi
 *   'panic:alert'        - PANIC BUTTON ditekan (PRIORITAS TINGGI)
 *   'panic:resolved'     - Panic sudah ditangani
 *   'broadcast:new'      - Broadcast pesan baru
 *   'user:status'        - Status user berubah (on_duty/off_duty)
 *   'stats:update'       - Dashboard stats berubah
 *
 * Client → Server:
 *   'join:role'          - Bergabung ke room sesuai role
 *   'join:lokasi'        - Bergabung ke room lokasi tertentu
 *   'location:ping'      - Update lokasi GPS
 *
 * v2 - SECURITY (P0-10): the auth middleware no longer accepts anonymous
 *      connections. Connections without a valid JWT are rejected at the
 *      io.use() handshake stage with "Authentication required".
 *
 * v3 - TAHAP 7 BUG #1 HOTFIX: P0-17 (Tahap 2) moved auth tokens from
 *      localStorage to an httpOnly cookie. Web-admin's Socket.io client
 *      can therefore no longer read the token in JS to pass via
 *      `socket.handshake.auth.token`. The middleware now also looks at
 *      the cookie header set by auth.controller.js (`ptsss_token`),
 *      keeping the Authorization header / auth-object paths as fallbacks
 *      for the mobile app (which still uses SecureStore + headers).
 *      Result: web-admin realtime (panic alerts, broadcast, live tracking,
 *      auto-refresh) works again without re-opening the localStorage hole.
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const { logger } = require('../utils/logger');

let io = null;

/**
 * Parse a `Cookie:` header value into a plain object.
 * Deliberately tolerant of edge cases — a bad cookie should never break
 * a handshake, it should just produce an empty object and let the
 * downstream token-lookup fail gracefully.
 *
 * Example:
 *   parseCookies('foo=bar; ptsss_token=abc.def.ghi; baz=qux')
 *   → { foo: 'bar', ptsss_token: 'abc.def.ghi', baz: 'qux' }
 */
function parseCookies(cookieHeader = '') {
  if (!cookieHeader || typeof cookieHeader !== 'string') return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => {
        let value = v.join('=').trim();
        try { value = decodeURIComponent(value); } catch { /* keep raw */ }
        return [k.trim(), value];
      })
  );
}

function initSocketIO(server) {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map(s => s.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ===== AUTH MIDDLEWARE =====
  // Verify JWT on connection. SECURITY (P0-10): missing or invalid tokens
  // MUST reject the handshake — no "anonymous" fallback.
  //
  // Token lookup order (Tahap 7 Bug #1):
  //   1. Cookie `ptsss_token`           - web-admin (httpOnly, set by auth.controller.js)
  //   2. socket.handshake.auth.token    - mobile app passes it explicitly
  //   3. Authorization: Bearer ...      - also used by some clients
  //   4. socket.handshake.query.token   - legacy, kept for backward compat
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers && socket.handshake.headers.cookie);
    // auth.controller.js sets `res.cookie('ptsss_token', ...)`. Keep the
    // generic fallbacks in case the cookie name ever changes — picking the
    // first one that's present lets the server be tolerant of legacy
    // sessions or other deployments that named it differently.
    const cookieToken = cookies['ptsss_token'] || cookies['token'] || cookies['auth_token'] || cookies['accessToken'];

    const authObjToken = socket.handshake.auth && socket.handshake.auth.token;
    const authHeader = socket.handshake.headers && socket.handshake.headers.authorization;
    const headerToken = authHeader && typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '')
      : null;
    const queryToken = socket.handshake.query && socket.handshake.query.token;

    const token = cookieToken || authObjToken || headerToken || queryToken;

    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Minimum viable claim set – without an id and role the socket can't
      // even be placed in its rooms, so treat that case as invalid.
      if (!decoded || !decoded.id || !decoded.role) {
        return next(new Error('Authentication required'));
      }
      socket.user = decoded;
      return next();
    } catch (err) {
      // Don't leak whether the token was expired vs malformed – just reject.
      return next(new Error('Authentication required'));
    }
  });

  // ===== CONNECTION HANDLER =====
  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`[Socket.io] Connected: ${user.nama || user.nrp || user.id} (${user.role}) - ${socket.id}`);

    // Auto-join role + per-user rooms (we're guaranteed an authenticated
    // user at this point, so no anon guard is needed).
    socket.join(`role:${user.role}`);
    socket.join(`user:${user.id}`);

    // Join specific location room
    socket.on('join:lokasi', (lokasiId) => {
      if (lokasiId) {
        socket.join(`lokasi:${lokasiId}`);
        logger.info(`[Socket.io] ${user.nama || user.id} joined lokasi:${lokasiId}`);
      }
    });

    // Leave location room
    socket.on('leave:lokasi', (lokasiId) => {
      if (lokasiId) socket.leave(`lokasi:${lokasiId}`);
    });

    // Location ping from mobile
    socket.on('location:ping', (data) => {
      // Broadcast to supervisors and komandan
      io.to('role:supervisor').to('role:admin').to('role:komandan').emit('user:location', {
        userId: user.id,
        nama: user.nama,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date().toISOString(),
      });
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`[Socket.io] Disconnected: ${user.nama || user.id} - ${reason}`);
    });
  });

  logger.info('[Socket.io] Realtime server initialized');
  return io;
}

// ===== EMIT HELPERS (called from routes) =====

/**
 * Emit event to all connected clients
 */
function emitToAll(event, data) {
  if (io) io.emit(event, data);
}

/**
 * Emit event to specific role(s)
 * @param {string|string[]} roles - 'supervisor' or ['supervisor', 'admin']
 */
function emitToRole(roles, event, data) {
  if (!io) return;
  const roleArr = Array.isArray(roles) ? roles : [roles];
  roleArr.forEach(role => io.to(`role:${role}`).emit(event, data));
}

/**
 * Emit event to specific user
 */
function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit event to specific lokasi room
 */
function emitToLokasi(lokasiId, event, data) {
  if (io) io.to(`lokasi:${lokasiId}`).emit(event, data);
}

/**
 * Get online users count
 */
function getOnlineCount() {
  if (!io) return 0;
  return io.sockets.sockets.size;
}

module.exports = {
  initSocketIO,
  emitToAll,
  emitToRole,
  emitToUser,
  emitToLokasi,
  getOnlineCount,
  getIO: () => io,
};
