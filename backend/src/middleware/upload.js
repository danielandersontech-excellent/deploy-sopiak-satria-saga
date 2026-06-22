const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// [1-14] The set of accepted upload types and their canonical, safe on-disk
// extension. The output filename is derived from the validated mimetype rather
// than from the client-supplied originalname, so a spoofed extension (e.g.
// `evil.php`/`evil.svg`/`evil.html`) can never land on disk — the stored file
// is always one of these safe extensions. (Content-Type itself can still be
// faked; full byte-signature inspection is deferred — see CHANGELOG — but the
// watermark step re-encodes images and the extension is now never
// attacker-controlled.)
const ALLOWED_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => { const folder = req.uploadFolder || 'general'; const dir = path.join(uploadDir, folder); require('fs').mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const ext = ALLOWED_MIME_EXT[file.mimetype] || '.bin'; cb(null, uuid() + ext); },
});
const upload = multer({ storage, fileFilter: (req, file, cb) => { const ok = Object.prototype.hasOwnProperty.call(ALLOWED_MIME_EXT, file.mimetype); cb(ok ? null : new Error('Tipe file tidak diizinkan'), ok); }, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') } });
const setFolder = (folder) => (req, res, next) => { req.uploadFolder = folder; next(); };
const getFileUrl = (filePath) => { if (!filePath) return null; const rel = filePath.replace(/\\/g, '/').replace(/^\.?\/?uploads\//, ''); return (process.env.API_URL || 'http://localhost:3000') + '/uploads/' + rel; };
const getFileUrlAsync = async (filePath) => getFileUrl(filePath);
module.exports = { upload, setFolder, getFileUrl, getFileUrlAsync };
