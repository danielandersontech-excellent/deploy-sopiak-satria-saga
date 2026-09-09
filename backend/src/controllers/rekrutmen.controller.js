/**
 * REKRUTMEN CONTROLLER — tipis: bongkar req, panggil service, kirim JSON.
 * Berkas privat di-stream lewat res.sendFile (bukan express.static).
 */
const rekrutmenService = require('../services/rekrutmen.service');
const { removeUploadedFiles } = require('../middleware/uploadPrivate');

function sendError(res, e) {
  const payload = { error: e && e.message ? e.message : 'Server error' };
  if (e && e.details) payload.details = e.details;
  res.status((e && e.status) || 500).json(payload);
}

// ===== PUBLIK =====
exports.daftarPublik = async (req, res) => {
  try {
    const result = await rekrutmenService.daftarPublik(req.body, req.files, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    // Honeypot / duplikat idempotency tetap 201 agar bot & klien retry tidak
    // bisa membedakan; field internal tidak dikirim.
    const { honeypot, duplicate, ...publik } = result;
    res.status(201).json(publik);
  } catch (e) {
    // Bila error bukan dari service (mis. DB), pastikan file yang sudah
    // tersimpan tidak menjadi sampah di volume privat.
    if (!e || !e.status) removeUploadedFiles(req.files);
    sendError(res, e);
  }
};

exports.cekStatus = async (req, res) => {
  try { res.json(await rekrutmenService.cekStatus(req.query.nomor, req.query.nik)); }
  catch (e) { sendError(res, e); }
};

// ===== ADMIN / SUPERVISOR =====
exports.list = async (req, res) => {
  try { res.json(await rekrutmenService.list(req.query)); }
  catch (e) { sendError(res, e); }
};

exports.ringkasan = async (req, res) => {
  try { res.json(await rekrutmenService.ringkasan()); }
  catch (e) { sendError(res, e); }
};

exports.detail = async (req, res) => {
  try { res.json(await rekrutmenService.detail(req.params.id)); }
  catch (e) { sendError(res, e); }
};

exports.ubahStatus = async (req, res) => {
  try { res.json(await rekrutmenService.ubahStatus(req.params.id, req.user, req.body)); }
  catch (e) { sendError(res, e); }
};

exports.jadikanAnggota = async (req, res) => {
  try { res.status(201).json(await rekrutmenService.jadikanAnggota(req.params.id, req.user, req.body)); }
  catch (e) { sendError(res, e); }
};

exports.hapus = async (req, res) => {
  try { res.json(await rekrutmenService.hapus(req.params.id, req.user)); }
  catch (e) { sendError(res, e); }
};

exports.berkas = async (req, res) => {
  try {
    const { abs, mime, nama } = await rekrutmenService.berkasPath(req.params.id, req.params.jenis);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${nama}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(abs);
  } catch (e) { sendError(res, e); }
};
