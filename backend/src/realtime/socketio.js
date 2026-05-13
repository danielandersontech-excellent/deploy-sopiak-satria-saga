/**
 * ============================================
 * SOCKET.IO REALTIME SERVER
 * ============================================
 * Mengganti polling 60 detik → push realtime instan
 * 
 * PENJELASAN:
 * Sebelumnya, aplikasi menggunakan "polling" - setiap 60 detik, 
 * semua client (HP anggota, HP komandan, web admin) mengirim request
 * ke server untuk mengecek "ada data baru nggak?". 
 * 
 * Masalahnya:
 * - Boros bandwidth (ratusan request/menit walau tidak ada perubahan)
 * - Delay sampai 60 detik (panic button baru muncul setelah 1 menit!)
 * - Server kelebihan beban jika banyak user online
 * 
 * Solusi Socket.io:
 * - Server langsung KIRIM data ke client saat ada perubahan
 * - Panic button → komandan langsung terima notifikasi (0-1 detik)
 * - Absensi baru → dashboard langsung update
 * - Laporan baru → badge langsung bertambah
 * - Bandwidth berkurang drastis (hanya kirim saat ada data baru)
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
 *      connections. The previous behavior of silently downgrading any
 *      missing/invalid token to an "anonymous" pseudo-user meant attackers
 *      could connect to the realtime channel without credentials and listen
 *      for events broadcast to all sockets (including panic alerts and live
 *      location pings). Connections without a valid JWT are now rejected
 *      at the io.use() handshake stage with "Authentication required".
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

let io = null;

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
  // Verify JWT token on connection. SECURITY (P0-10): missing or invalid
  // tokens MUST reject the handshake — no "anonymous" fallback.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
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
    console.log(`[Socket.io] ✅ Connected: ${user.nama || user.nrp || user.id} (${user.role}) - ${socket.id}`);

    // Auto-join role + per-user rooms (we're guaranteed an authenticated
    // user at this point, so no anon guard is needed).
    socket.join(`role:${user.role}`);
    socket.join(`user:${user.id}`);

    // Join specific location room
    socket.on('join:lokasi', (lokasiId) => {
      if (lokasiId) {
        socket.join(`lokasi:${lokasiId}`);
        console.log(`[Socket.io] ${user.nama || user.id} joined lokasi:${lokasiId}`);
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
      console.log(`[Socket.io] ❌ Disconnected: ${user.nama || user.id} - ${reason}`);
    });
  });

  console.log('[Socket.io] 🔌 Realtime server initialized');
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
