/**
 * UPLOAD PRIVAT — berkas yang TIDAK boleh dilayani sebagai file statis.
 *
 * Berbeda dengan middleware/upload.js (menulis ke UPLOAD_DIR yang dipublikasikan
 * lewat `app.use('/uploads', express.static(...))`), middleware ini menulis ke
 * PRIVATE_UPLOAD_DIR (default ./private-uploads, di-mount sebagai volume
 * `backend_private_uploads` di docker-compose). Folder ini SENGAJA tidak
 * di-mount ke express.static, sehingga:
 *   - GET https://api/.../uploads/rekrutmen/<file> → 404
 *   - satu-satunya jalur baca adalah endpoint ber-auth
 *     GET /api/rekrutmen/:id/berkas/:jenis (admin/supervisor).
 *
 * Dipakai oleh formulir rekrutmen publik: KTP, KK, ijazah, SKCK, foto, CV,
 * sertifikat adalah dokumen identitas pelamar — tidak boleh bisa ditebak URL-nya.
 *
 * Keamanan file:
 *   - nama file di disk = uuid + ekstensi dari mimetype yang di-whitelist
 *     (nama asli klien tidak pernah dipakai sebagai nama file);
 *   - batas 5 MB per file, maksimal 7 file per pengiriman;
 *   - pemeriksaan magic bytes (JPEG/PNG/PDF) dilakukan di service setelah
 *     file tersimpan (`verifyMagicBytes`), file yang tidak cocok dihapus.
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const PRIVATE_UPLOAD_DIR = process.env.PRIVATE_UPLOAD_DIR || './private-uploads';
const MAX_FILE_SIZE = parseInt(process.env.PRIVATE_MAX_FILE_SIZE || '') || 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

// Slot berkas yang dikenal formulir rekrutmen (nama field multipart).
const REKRUTMEN_SLOTS = ['foto', 'ktp', 'kk', 'ijazah', 'skck', 'cv', 'sertifikat'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Sub-folder per bulan agar satu folder tidak menampung ribuan file.
function monthFolder() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(PRIVATE_UPLOAD_DIR, 'rekrutmen', monthFolder());
    try { ensureDir(dir); cb(null, dir); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_EXT[file.mimetype] || '.bin';
    cb(null, uuid() + ext);
  },
});

const uploadPrivate = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: REKRUTMEN_SLOTS.length, fields: 40 },
  fileFilter: (req, file, cb) => {
    if (!REKRUTMEN_SLOTS.includes(file.fieldname)) {
      return cb(new Error(`Slot berkas tidak dikenal: ${file.fieldname}`), false);
    }
    const ok = Object.prototype.hasOwnProperty.call(ALLOWED_MIME_EXT, file.mimetype);
    cb(ok ? null : new Error('Tipe file tidak diizinkan (hanya JPG, PNG, PDF)'), ok);
  },
});

/**
 * Middleware multipart untuk formulir rekrutmen. Membungkus multer agar bila
 * multer gagal di tengah (mis. file ke-3 melebihi 5 MB) file yang SUDAH
 * tersimpan ikut dihapus — multer sendiri tidak membersihkannya.
 */
const rekrutmenFields = uploadPrivate.fields(REKRUTMEN_SLOTS.map((name) => ({ name, maxCount: 1 })));
function rekrutmenUpload(req, res, next) {
  rekrutmenFields(req, res, (err) => {
    if (err) {
      removeUploadedFiles(req.files);
      return next(err);
    }
    next();
  });
}

/** Hapus semua file dari `req.files` (bentuk object dari upload.fields). */
function removeUploadedFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : Object.values(files).flat();
  for (const f of list) {
    if (f && f.path) {
      try { fs.unlinkSync(f.path); } catch { /* sudah tidak ada */ }
    }
  }
}

/**
 * Periksa magic bytes file terhadap mimetype yang diklaim klien.
 * Mengembalikan true bila cocok. Mimetype hanyalah klaim dari browser;
 * pemeriksaan byte pertama memastikan file benar-benar JPEG/PNG/PDF.
 */
function verifyMagicBytes(filePath, mimetype) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    if (n < 4) return false;
    if (mimetype === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (mimetype === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (mimetype === 'application/pdf') return buf.slice(0, 4).toString('latin1') === '%PDF';
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* abaikan */ } }
  }
}

/**
 * Path relatif (terhadap PRIVATE_UPLOAD_DIR) yang disimpan di DB, memakai
 * pemisah '/' agar portabel antar OS.
 */
function toRelativePrivatePath(absOrRelPath) {
  const root = path.resolve(PRIVATE_UPLOAD_DIR);
  const abs = path.resolve(absOrRelPath);
  return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * Resolusi aman: path relatif dari DB → path absolut, dan pastikan hasilnya
 * tetap berada di dalam PRIVATE_UPLOAD_DIR (anti path-traversal).
 * Mengembalikan null bila tidak valid.
 */
function resolvePrivatePath(relPath) {
  if (!relPath || typeof relPath !== 'string' || relPath.includes('\0')) return null;
  const root = path.resolve(PRIVATE_UPLOAD_DIR);
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

// Pastikan folder dasar ada saat modul dimuat (agar volume kosong langsung siap).
try { ensureDir(path.join(PRIVATE_UPLOAD_DIR, 'rekrutmen')); } catch { /* dilaporkan saat upload */ }

module.exports = {
  PRIVATE_UPLOAD_DIR,
  MAX_FILE_SIZE,
  REKRUTMEN_SLOTS,
  ALLOWED_MIME_EXT,
  rekrutmenUpload,
  removeUploadedFiles,
  verifyMagicBytes,
  toRelativePrivatePath,
  resolvePrivatePath,
};
