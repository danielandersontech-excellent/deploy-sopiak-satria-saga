/**
 * INPUT VALIDATION & SANITIZATION MIDDLEWARE
 * Validasi semua input API untuk mencegah injection dan data kotor.
 *
 * Menggunakan validasi manual (tanpa express-validator) agar zero dependency.
 * Semua string di-trim dan di-sanitize dari karakter berbahaya.
 */

// ===== SANITIZERS =====

/** Trim & remove null bytes */
function cleanString(val) {
  if (typeof val !== 'string') return val;
  return val.trim().replace(/\0/g, '');
}

/** Strip HTML tags */
function stripHtml(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/<[^>]*>/g, '');
}

/** Recursively sanitize all string values in an object */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      clean[key] = cleanString(val);
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitizeObject(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

// ===== VALIDATORS =====

function isUUID(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function isDateString(val) {
  return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
}

function isNumeric(val) {
  return !isNaN(parseFloat(val)) && isFinite(val);
}

function isIn(val, allowed) {
  return allowed.includes(val);
}

// ===== MIDDLEWARE: Auto-sanitize all request bodies =====
function sanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

// ===== VALIDATION SCHEMAS =====

const schemas = {
  login: (body) => {
    const errors = [];
    if (!body.nrp || typeof body.nrp !== 'string' || body.nrp.length < 1 || body.nrp.length > 20) {
      errors.push('NRP wajib diisi (max 20 karakter)');
    }
    if (!body.pin || typeof body.pin !== 'string' || body.pin.length < 4 || body.pin.length > 20) {
      errors.push('PIN wajib diisi (min 4, max 20 karakter)');
    }
    return errors;
  },

  register: (body) => {
    const errors = [];
    if (!body.nrp || body.nrp.length < 1 || body.nrp.length > 20) errors.push('NRP wajib (max 20 karakter)');
    if (!body.nama || body.nama.length < 2 || body.nama.length > 100) errors.push('Nama wajib (2-100 karakter)');
    if (!body.role || !isIn(body.role, ['anggota', 'komandan', 'supervisor', 'admin'])) {
      errors.push('Role wajib (anggota/komandan/supervisor/admin/klien)');
    }
    if (body.no_hp && body.no_hp.length > 20) errors.push('No HP max 20 karakter');
    if (body.lokasi_id && !isUUID(body.lokasi_id)) errors.push('lokasi_id harus UUID valid');
    return errors;
  },

  changePin: (body) => {
    const errors = [];
    if (!body.old_pin || body.old_pin.length < 4) errors.push('PIN lama wajib (min 4 karakter)');
    if (!body.new_pin || body.new_pin.length < 6) errors.push('PIN baru wajib (min 6 karakter)');
    return errors;
  },

  absensi: (body) => {
    const errors = [];
    if (!body.tipe || !isIn(body.tipe, ['masuk', 'keluar'])) errors.push('Tipe wajib (masuk/keluar)');
    if (!isNumeric(body.latitude)) errors.push('Latitude wajib (angka)');
    if (!isNumeric(body.longitude)) errors.push('Longitude wajib (angka)');
    return errors;
  },

  laporanHarian: (body) => {
    const errors = [];
    if (!body.kondisi || !isIn(body.kondisi, ['aman', 'ada_masalah', 'perhatian_khusus'])) {
      errors.push('Kondisi wajib (aman/ada_masalah/perhatian_khusus)');
    }
    if (body.aktivitas && body.aktivitas.length > 2000) errors.push('Aktivitas max 2000 karakter');
    if (body.temuan && body.temuan.length > 2000) errors.push('Temuan max 2000 karakter');
    return errors;
  },

  laporanKejadian: (body) => {
    const errors = [];
    if (!body.jenis || body.jenis.length < 2) errors.push('Jenis kejadian wajib');
    if (body.prioritas && !isIn(body.prioritas, ['rendah', 'sedang', 'tinggi', 'kritis'])) {
      errors.push('Prioritas harus rendah/sedang/tinggi/kritis');
    }
    if (body.kronologi && body.kronologi.length > 5000) errors.push('Kronologi max 5000 karakter');
    return errors;
  },

  broadcast: (body) => {
    const errors = [];
    if (!body.judul || body.judul.length < 2 || body.judul.length > 200) errors.push('Judul wajib (2-200 karakter)');
    if (!body.pesan || body.pesan.length < 2) errors.push('Pesan wajib');
    if (body.prioritas && !isIn(body.prioritas, ['normal', 'urgent'])) errors.push('Prioritas harus normal/urgent');
    return errors;
  },

  panic: (body) => {
    const errors = [];
    // Panic minimal, tapi validasi koordinat jika ada
    if (body.latitude && !isNumeric(body.latitude)) errors.push('Latitude harus angka');
    if (body.longitude && !isNumeric(body.longitude)) errors.push('Longitude harus angka');
    return errors;
  },

  geofenceCheck: (body) => {
    const errors = [];
    if (!isNumeric(body.latitude)) errors.push('Latitude wajib');
    if (!isNumeric(body.longitude)) errors.push('Longitude wajib');
    return errors;
  },

  izinKeluar: (body) => {
    const errors = [];
    if (!body.alasan || body.alasan.length < 5 || body.alasan.length > 500) {
      errors.push('Alasan wajib (5-500 karakter)');
    }
    return errors;
  },

  lokasi: (body) => {
    const errors = [];
    if (!body.nama || body.nama.length < 2) errors.push('Nama lokasi wajib');
    if (!body.alamat || body.alamat.length < 5) errors.push('Alamat wajib');
    return errors;
  },

  uuidParam: (id) => {
    if (!id || !isUUID(id)) return ['ID harus UUID valid'];
    return [];
  },
};

/**
 * Factory: create validation middleware for a schema
 * @param {string} schemaName - key in schemas object
 * @param {'body'|'params'} source - where to validate
 */
function validate(schemaName, source = 'body') {
  return (req, res, next) => {
    const validator = schemas[schemaName];
    if (!validator) return next();
    const data = source === 'body' ? req.body : req.params;
    const errors = validator(data);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validasi gagal', details: errors });
    }
    next();
  };
}

/**
 * Validate UUID in params.id
 */
function validateId(req, res, next) {
  if (req.params.id) {
    const errors = schemas.uuidParam(req.params.id);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }
  }
  next();
}

module.exports = {
  sanitizeMiddleware,
  sanitizeObject,
  validate,
  validateId,
  isUUID,
  isDateString,
  isNumeric,
  isIn,
  stripHtml,
};
