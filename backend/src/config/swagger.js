/**
 * ============================================
 * SWAGGER API DOCUMENTATION
 * ============================================
 * Akses di: http://localhost:3000/api-docs
 * 
 * PENJELASAN:
 * "Swagger" (sekarang bernama OpenAPI) adalah standar dokumentasi API.
 * Fungsinya:
 * - Menampilkan semua endpoint API dalam format yang mudah dibaca
 * - Bisa TEST langsung endpoint dari browser (tanpa Postman)
 * - Developer lain bisa langsung paham cara pakai API
 * - Otomatis generate dari komentar di code
 * 
 * Cara akses: Buka http://localhost:3000/api-docs di browser
 */
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PT Sopiak Satria Saga Management System - API',
      version: '13.0.0',
      description: `
## API Backend PT Sopiak Satria Saga

Dokumentasi lengkap semua endpoint REST API untuk sistem manajemen keamanan PT Sopiak Satria Saga.

### Autentikasi
Semua endpoint (kecuali login) memerlukan JWT token di header:
\`\`\`
Authorization: Bearer <token>
\`\`\`

### Base URL
- Development: \`http://localhost:3000\`
- Production: sesuaikan di .env

### Realtime (Socket.io)
Selain REST API, sistem juga mendukung WebSocket realtime via Socket.io.
Connect ke \`ws://localhost:3000\` dengan auth token.
      `,
      contact: { name: 'PT Sopiak Satria Saga', email: 'admin@ptsss.app' },
    },
    servers: [
      { url: process.env.API_URL || 'http://localhost:3000', description: 'Development Server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token dari endpoint /api/auth/login',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Login & Register' },
      { name: 'Users', description: 'Manajemen Personil' },
      { name: 'Absensi', description: 'Absensi Masuk & Keluar' },
      { name: 'Patroli', description: 'Patroli & Scan Checkpoint' },
      { name: 'Laporan', description: 'Laporan Harian & Kejadian' },
      { name: 'Geofence', description: 'Geofence & Izin Keluar Wilayah' },
      { name: 'Data', description: 'CRUD Lokasi, Pos Jaga, Checkpoint, dll' },
      { name: 'Export', description: 'Export Excel & Statistik' },
      { name: 'Audit', description: 'Audit Log' },
    ],
    paths: {
      // ===== AUTH =====
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login dengan NRP & PIN',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['nrp', 'pin'],
              properties: {
                nrp: { type: 'string', example: 'ADM001' },
                pin: { type: 'string', example: '123456' },
              },
            }}},
          },
          responses: {
            200: { description: 'Login berhasil, return JWT token + user data' },
            401: { description: 'NRP atau PIN salah' },
          },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register user baru (admin only)',
          requestBody: {
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['nrp', 'nama', 'pin', 'role'],
              properties: {
                nrp: { type: 'string', example: 'AGT099' },
                nama: { type: 'string', example: 'Ahmad Rizky' },
                pin: { type: 'string', example: '123456' },
                role: { type: 'string', enum: ['anggota', 'komandan', 'supervisor', 'admin'] },
                no_hp: { type: 'string' },
                lokasi_id: { type: 'string', format: 'uuid' },
              },
            }}},
          },
          responses: { 201: { description: 'User berhasil dibuat' } },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['refresh_token'],
              properties: {
                refresh_token: { type: 'string', description: 'Refresh token dari login' },
              },
            }}},
          },
          responses: {
            200: { description: 'Token baru + refresh token baru' },
            401: { description: 'Refresh token invalid/expired' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout & revoke refresh token',
          responses: { 200: { description: 'Berhasil logout' } },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get profil user saat ini',
          responses: { 200: { description: 'Data profil user' } },
        },
      },
      '/api/auth/change-pin': {
        put: {
          tags: ['Auth'],
          summary: 'Ubah PIN',
          requestBody: {
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['old_pin', 'new_pin'],
              properties: {
                old_pin: { type: 'string' },
                new_pin: { type: 'string', minLength: 6 },
              },
            }}},
          },
          responses: { 200: { description: 'PIN berhasil diubah' } },
        },
      },

      // ===== USERS =====
      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'List semua personil',
          parameters: [
            { name: 'role', in: 'query', schema: { type: 'string' } },
            { name: 'lokasi_id', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Array of users' } },
        },
      },
      '/api/users/{id}/location': {
        put: {
          tags: ['Users'],
          summary: 'Update posisi GPS user',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                latitude: { type: 'number', example: 0.5071 },
                longitude: { type: 'number', example: 101.4478 },
              },
            }}},
          },
          responses: { 200: { description: 'Posisi diperbarui' } },
        },
      },

      // ===== ABSENSI =====
      '/api/absensi': {
        get: { tags: ['Absensi'], summary: 'List absensi (filter by user_id, date)', responses: { 200: { description: 'Array of absensi' } } },
        post: {
          tags: ['Absensi'],
          summary: 'Catat absensi (masuk/keluar)',
          requestBody: {
            content: {
              'multipart/form-data': { schema: {
                type: 'object',
                required: ['tipe', 'latitude', 'longitude'],
                properties: {
                  tipe: { type: 'string', enum: ['masuk', 'keluar'] },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  alamat: { type: 'string' },
                  pos_jaga: { type: 'string' },
                  foto: { type: 'string', format: 'binary' },
                },
              }},
            },
          },
          responses: { 201: { description: 'Absensi tercatat' } },
        },
      },

      // ===== PATROLI =====
      '/api/patroli': { get: { tags: ['Patroli'], summary: 'List patroli', responses: { 200: { description: 'Array of patroli' } } } },
      '/api/patroli/start': {
        post: {
          tags: ['Patroli'], summary: 'Mulai patroli baru',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { route_id: { type: 'string' }, route_name: { type: 'string' } } } } } },
          responses: { 201: { description: 'Patroli dimulai' } },
        },
      },
      '/api/patroli/{id}/scan': {
        post: {
          tags: ['Patroli'], summary: 'Scan checkpoint',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', required: ['checkpoint_id'], properties: { checkpoint_id: { type: 'string' }, foto: { type: 'string', format: 'binary' } } } } } },
          responses: { 201: { description: 'Checkpoint di-scan' } },
        },
      },
      '/api/patroli/{id}/end': { put: { tags: ['Patroli'], summary: 'Selesaikan patroli', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Patroli selesai' } } } },

      // ===== LAPORAN =====
      '/api/laporan/harian': {
        get: { tags: ['Laporan'], summary: 'List laporan harian', responses: { 200: { description: 'Array of laporan harian' } } },
        post: { tags: ['Laporan'], summary: 'Buat laporan harian baru', responses: { 201: { description: 'Laporan dibuat' } } },
      },
      '/api/laporan/kejadian': {
        get: { tags: ['Laporan'], summary: 'List laporan kejadian', responses: { 200: { description: 'Array of laporan kejadian' } } },
        post: { tags: ['Laporan'], summary: 'Buat laporan kejadian baru', responses: { 201: { description: 'Laporan dibuat' } } },
      },

      // ===== GEOFENCE =====
      '/api/geofence/check': {
        post: {
          tags: ['Geofence'],
          summary: 'Cek posisi anggota terhadap geofence',
          description: 'Dipanggil oleh mobile app setiap update GPS. Otomatis buat violation jika keluar radius tanpa izin.',
          requestBody: {
            content: { 'application/json': { schema: {
              type: 'object',
              required: ['latitude', 'longitude'],
              properties: {
                latitude: { type: 'number', example: 0.5071 },
                longitude: { type: 'number', example: 101.4478 },
                accuracy: { type: 'number', example: 10 },
              },
            }}},
          },
          responses: {
            200: { description: 'Status geofence: dalam_radius, jarak, izin_aktif, violation' },
          },
        },
      },
      '/api/geofence/izin': {
        get: { tags: ['Geofence'], summary: 'List permintaan izin keluar', parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'expired', 'returned'] } },
          { name: 'lokasi_id', in: 'query', schema: { type: 'string' } },
        ], responses: { 200: { description: 'Array of izin keluar' } } },
        post: {
          tags: ['Geofence'],
          summary: 'Anggota minta izin keluar wilayah',
          requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['alasan'], properties: { alasan: { type: 'string', example: 'Perlu ambil logistik di luar area' }, latitude: { type: 'number' }, longitude: { type: 'number' } } } } } },
          responses: { 201: { description: 'Permintaan izin dibuat' } },
        },
      },
      '/api/geofence/izin/{id}/approve': {
        put: {
          tags: ['Geofence'],
          summary: 'Komandan approve izin keluar',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['durasi_menit'], properties: { durasi_menit: { type: 'integer', example: 30, description: 'Berapa menit boleh keluar' }, catatan: { type: 'string' } } } } } },
          responses: { 200: { description: 'Izin disetujui dengan batas waktu' } },
        },
      },
      '/api/geofence/izin/{id}/reject': {
        put: { tags: ['Geofence'], summary: 'Komandan tolak izin keluar', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Izin ditolak' } } },
      },
      '/api/geofence/violations': {
        get: { tags: ['Geofence'], summary: 'List pelanggaran geofence', responses: { 200: { description: 'Array of violations' } } },
      },
      '/api/geofence/live-map': {
        get: {
          tags: ['Geofence'],
          summary: 'Data peta realtime - posisi semua personil + geofence',
          description: 'Mengembalikan posisi semua anggota, status geofence, lokasi/pos jaga, violations, dan izin aktif.',
          parameters: [{ name: 'lokasi_id', in: 'query', schema: { type: 'string' }, description: 'Filter by lokasi' }],
          responses: { 200: { description: 'Live map data: personnel, lokasi, pos_jaga, violations, izin_aktif' } },
        },
      },

      // ===== EXPORT =====
      '/api/export/absensi': { get: { tags: ['Export'], summary: 'Download Excel absensi', parameters: [
        { name: 'start_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'end_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'lokasi_id', in: 'query', schema: { type: 'string' } },
      ], responses: { 200: { description: 'File .xlsx' } } } },
      '/api/export/complete': { get: { tags: ['Export'], summary: 'Download Excel lengkap (semua data)', responses: { 200: { description: 'File .xlsx dengan 6 sheets' } } } },

      // ===== DATA =====
      '/api/data/lokasi': { get: { tags: ['Data'], summary: 'List lokasi/klien', responses: { 200: { description: 'Array' } } } },
      '/api/data/pos-jaga': { get: { tags: ['Data'], summary: 'List pos jaga', responses: { 200: { description: 'Array' } } } },
      '/api/data/checkpoints': { get: { tags: ['Data'], summary: 'List checkpoint', responses: { 200: { description: 'Array' } } } },
      '/api/data/routes': { get: { tags: ['Data'], summary: 'List rute patroli', responses: { 200: { description: 'Array' } } } },
      '/api/data/broadcasts': { get: { tags: ['Data'], summary: 'List broadcast', responses: { 200: { description: 'Array' } } } },
      '/api/data/panic': { get: { tags: ['Data'], summary: 'List panic alerts', responses: { 200: { description: 'Array' } } } },

      // ===== HEALTH =====
      '/api/health': { get: { tags: ['System'], summary: 'Health check + Socket.io stats', security: [], responses: { 200: { description: 'Server status' } } } },
    },
  },
  apis: [], // We define paths inline above
};

function setupSwagger(app) {
  const spec = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'PT Sopiak Satria Saga API Documentation',
    customCss: '.swagger-ui .topbar { background-color: #1e3a5f; } .swagger-ui .topbar .download-url-wrapper { display: none; }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tagsSorter: 'alpha',
    },
  }));
  
  // Raw JSON spec
  app.get('/api-docs.json', (req, res) => res.json(spec));
  
  console.log(`📖 Swagger docs: http://localhost:${process.env.PORT || 3000}/api-docs`);
}

module.exports = { setupSwagger };
