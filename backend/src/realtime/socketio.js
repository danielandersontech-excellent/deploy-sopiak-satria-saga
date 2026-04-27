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
  // Verify JWT token on connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      // Allow anonymous connections (web admin might connect differently)
      socket.user = { id: 'anon', role: 'anon', nama: 'Anonymous' };
      return next();
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      // Still allow connection but mark as unauthenticated
      socket.user = { id: 'anon', role: 'anon', nama: 'Anonymous' };
      next();
    }
  });

  // ===== CONNECTION HANDLER =====
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket.io] ✅ Connected: ${user.nama || 'Anonymous'} (${user.role}) - ${socket.id}`);

    // Auto-join role room
    if (user.role && user.role !== 'anon') {
      socket.join(`role:${user.role}`);
      socket.join(`user:${user.id}`);
    }

    // Join specific location room
    socket.on('join:lokasi', (lokasiId) => {
      if (lokasiId) {
        socket.join(`lokasi:${lokasiId}`);
        console.log(`[Socket.io] ${user.nama} joined lokasi:${lokasiId}`);
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
      console.log(`[Socket.io] ❌ Disconnected: ${user.nama || 'Anonymous'} - ${reason}`);
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
