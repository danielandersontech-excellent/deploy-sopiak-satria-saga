/**
 * USER SERVICE - v23 - Fixed null handling, status_penempatan auto-set
 *
 * Fase 1:
 *  [1-2] getAll / getById are now scope-aware (lokasi isolation) and strip
 *        heavy PII for low-privilege roles (anggota/klien). getById also
 *        rejects out-of-scope ids (closes the IDOR).
 *  [1-7] When an account is deactivated (status_penempatan -> 'nonaktif'),
 *        its refresh tokens are revoked so it can't ride the 7-day refresh.
 *  [1-10] Sensitive admin actions (role/lokasi change, user deletion) write
 *        an audit-log entry via the existing audit mechanism.
 */
const userRepo = require('../repositories/user.repository');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');
const { revokeRefreshToken } = require('../middleware/auth');
const { logEvent } = require('../middleware/auditlog');

// [1-2] Sensitive personal data that must NOT be exposed to low-privilege
// roles (anggota viewing a colleague, klien viewing site staff). Kept for
// the staff member themselves and for admin/supervisor/komandan (who manage
// personnel). NRP/nama/role/lokasi/shift/status/foto/GPS stay so rosters and
// live-team views keep working — those are the fields the mobile roster maps.
const HEAVY_PII_FIELDS = [
  'no_ktp', 'tempat_lahir', 'tanggal_lahir', 'alamat_rumah', 'pendidikan',
  'golongan_darah', 'agama', 'catatan_personil', 'expo_push_token',
  'berkas_ktp', 'berkas_ijazah', 'berkas_skck', 'berkas_sertifikat',
  'berkas_cv', 'berkas_foto_formal', 'berkas_kontrak', 'berkas_lainnya', 'berkas_foto',
];
function stripHeavyPII(u) {
  if (!u || typeof u !== 'object') return u;
  for (const f of HEAVY_PII_FIELDS) { if (f in u) delete u[f]; }
  return u;
}
function isLowRole(role) { return role === 'anggota' || role === 'klien'; }

class UserService {
  async getAll(filters, user) {
    // [1-2] apply lokasi scope: admin/supervisor unrestricted; komandan/anggota
    // their lokasi; klien their client's lokasi; others deny. The repo handles
    // lokasi_id / lokasi_ids (empty = deny-all).
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    const result = await userRepo.findAllWithJoins(filters);

    // Low-privilege roles get a PII-free view even within their scope.
    if (isLowRole(user.role)) {
      if (Array.isArray(result)) return result.map(stripHeavyPII);
      if (result && Array.isArray(result.data)) {
        result.data = result.data.map(stripHeavyPII);
      }
    }
    return result;
  }

  async getById(id, user) {
    const target = await userRepo.findByIdWithJoins(id);
    if (!target) throw { status: 404, message: 'User tidak ditemukan' };
    delete target.pin_hash;

    const isElevated = user && (user.role === 'admin' || user.role === 'supervisor');
    const isSelf = String(id) === String(user && user.id);

    if (!isElevated && !isSelf) {
      // [1-2] IDOR fix: a non-elevated caller may only read a user that falls
      // within their own lokasi scope. Out-of-scope -> 404 (don't reveal
      // existence). komandan see their lokasi's staff (full); anggota/klien
      // see same-scope staff but PII-stripped.
      const scope = await getScopeFilter(user);
      const inScope = !scope.unrestricted && target.lokasi_id && scope.lokasiIds.includes(target.lokasi_id);
      if (!inScope) throw { status: 404, message: 'User tidak ditemukan' };
      if (isLowRole(user.role)) stripHeavyPII(target);
    }
    return target;
  }

  async update(id, requestUser, data) {
    const isAdmin = ['admin', 'supervisor'].includes(requestUser.role);
    const isSelf = id === requestUser.id;
    if (!isAdmin && !isSelf) throw { status: 403, message: 'Akses ditolak' };

    const fields = {};
    const allowedFields = [
      'nama', 'no_hp', 'shift', 'status', 'lokasi_id', 'pos_jaga_id', 'foto_url',
      'no_ktp', 'tempat_lahir', 'tanggal_lahir', 'alamat_rumah', 'pendidikan',
      'jenis_kelamin', 'golongan_darah', 'agama', 'catatan_personil', 'status_penempatan',
      'berkas_ktp', 'berkas_ijazah', 'berkas_skck', 'berkas_sertifikat',
      'berkas_cv', 'berkas_foto_formal', 'berkas_kontrak', 'berkas_lainnya',
      'berkas_foto', 'tanggal_bergabung',
    ];
    
    allowedFields.forEach(k => {
      if (data[k] !== undefined) fields[k] = data[k];
    });

    if (isAdmin) {
      if (data.role !== undefined) fields.role = data.role;
      if (data.skor !== undefined) fields.skor = data.skor;
      if (data.nrp !== undefined) fields.nrp = data.nrp;
    }

    // Auto-set status_penempatan
    if (data.lokasi_id !== undefined && !data.status_penempatan) {
      fields.status_penempatan = data.lokasi_id ? 'ditempatkan' : 'belum_ditempatkan';
    }

    if (!Object.keys(fields).length) throw { status: 400, message: 'Tidak ada field yang diubah' };

    const user = await userRepo.updateFields(id, fields);
    if (!user) throw { status: 404, message: 'User tidak ditemukan' };
    delete user.pin_hash;

    // [1-7] If this update deactivated the account, revoke its refresh tokens
    // so a held token can't be used to refresh past the deactivation.
    if (fields.status_penempatan === 'nonaktif') {
      try { await revokeRefreshToken(id); } catch (e) { /* non-fatal */ }
    }

    // [1-10] Audit sensitive privilege/placement changes by an admin.
    if (isAdmin && (fields.role !== undefined || fields.lokasi_id !== undefined || fields.status_penempatan !== undefined)) {
      logEvent(requestUser.id, requestUser.nama || '', 'USER_UPDATE_PRIVILEGE', 'users', id, {
        role: fields.role,
        lokasi_id: fields.lokasi_id,
        status_penempatan: fields.status_penempatan,
      }).catch(() => {});
    }
    return user;
  }

  async delete(id, actor) {
    const result = await userRepo.delete(id);
    // [1-10] Audit user deletion (no PII/secrets in the detail).
    if (actor) {
      logEvent(actor.id, actor.nama || '', 'USER_DELETE', 'users', id, { deleted_user_id: id }).catch(() => {});
    }
    return result;
  }

  async updateLocation(userId, lat, lng) {
    await userRepo.updateLocation(userId, lat, lng);
    return { message: 'OK' };
  }

  async updatePushToken(userId, token) {
    await userRepo.updatePushToken(userId, token);
    return { message: 'OK' };
  }
}

module.exports = new UserService();
