/**
 * REKRUTMEN ROUTES - /api/rekrutmen
 *
 * Publik (tanpa auth, dibatasi rate limit + honeypot + idempotency):
 *   POST /publik            → formulir lamaran dari website /karir (multipart, 7 slot berkas)
 *   GET  /publik/status     → cek status lamaran (nomor referensi + NIK)
 *
 * Admin/supervisor (auth + requireRole):
 *   GET    /                → daftar pelamar (pagination, filter status/search)
 *   GET    /ringkasan       → jumlah per status (badge sidebar)
 *   GET    /:id             → detail pelamar
 *   PUT    /:id/status      → ubah status + catatan admin
 *   POST   /:id/jadikan-anggota → buat akun users (NRP AGT berikutnya, PIN 123456, must_change_pin)
 *   GET    /:id/berkas/:jenis   → unduh berkas privat (stream, bukan static)
 *   DELETE /:id             → hapus lamaran + berkasnya (admin saja)
 *
 * Urutan middleware POST publik: limiter → multer privat → controller, sama
 * dengan pola upload lain (limiter sebelum parse body agar request yang
 * ditolak tidak membuang bandwidth/disk).
 */
const router = require('express').Router();
const ctrl = require('../controllers/rekrutmen.controller');
const { auth, requireRole } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');
const { rekrutmenUpload } = require('../middleware/uploadPrivate');
const { rekrutmenSubmitLimiter, rekrutmenStatusLimiter } = require('../middleware/publicLimit');

const STAF_HR = requireRole('admin', 'supervisor');

// ---- Publik ----
router.post('/publik', rekrutmenSubmitLimiter, rekrutmenUpload, ctrl.daftarPublik);
router.get('/publik/status', rekrutmenStatusLimiter, ctrl.cekStatus);

// ---- Admin / Supervisor ----
router.get('/', auth, STAF_HR, ctrl.list);
router.get('/ringkasan', auth, STAF_HR, ctrl.ringkasan);
router.get('/:id', auth, STAF_HR, validateId, ctrl.detail);
router.put('/:id/status', auth, STAF_HR, validateId, ctrl.ubahStatus);
router.post('/:id/jadikan-anggota', auth, STAF_HR, validateId, ctrl.jadikanAnggota);
router.get('/:id/berkas/:jenis', auth, STAF_HR, validateId, ctrl.berkas);
router.delete('/:id', auth, requireRole('admin'), validateId, ctrl.hapus);

module.exports = router;
