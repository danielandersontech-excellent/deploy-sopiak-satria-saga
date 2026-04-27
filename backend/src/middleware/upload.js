const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const storage = multer.diskStorage({
  destination: (req, file, cb) => { const folder = req.uploadFolder || 'general'; const dir = path.join(uploadDir, folder); require('fs').mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { cb(null, uuid() + (path.extname(file.originalname) || '.jpg')); },
});
const upload = multer({ storage, fileFilter: (req, file, cb) => { const ok = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.mimetype); cb(ok ? null : new Error('Tipe file tidak diizinkan'), ok); }, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') } });
const setFolder = (folder) => (req, res, next) => { req.uploadFolder = folder; next(); };
const getFileUrl = (filePath) => { if (!filePath) return null; const rel = filePath.replace(/\\/g, '/').replace(/^\.?\/?uploads\//, ''); return (process.env.API_URL || 'http://localhost:3000') + '/uploads/' + rel; };
const getFileUrlAsync = async (filePath) => getFileUrl(filePath);
module.exports = { upload, setFolder, getFileUrl, getFileUrlAsync };
