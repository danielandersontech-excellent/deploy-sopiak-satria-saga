/**
 * USER SERVICE - v23 - Fixed null handling, status_penempatan auto-set
 */
const userRepo = require('../repositories/user.repository');

class UserService {
  async getAll(filters) { return userRepo.findAllWithJoins(filters); }

  async getById(id) {
    const user = await userRepo.findByIdWithJoins(id);
    if (!user) throw { status: 404, message: 'User tidak ditemukan' };
    delete user.pin_hash;
    return user;
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
    return user;
  }

  async delete(id) { return userRepo.delete(id); }

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
