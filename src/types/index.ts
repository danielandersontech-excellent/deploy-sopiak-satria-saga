/**
 * ============================================
 * PT Sopiak Satria Saga - TypeScript Types
 * v24 - Synced with ptsss_db_new.sql schema
 * ============================================
 */

// === NAVIGATION ===
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  Absensi: undefined;
  AbsensiCamera: undefined;
  Patroli: undefined;
  QRScanner: { checkpointId?: string };
  LaporanHarian: undefined;
  LaporanKejadian: undefined;
  PanicButton: undefined;
  SerahTerima: undefined;
  Notifikasi: undefined;
  ProfilDetail: undefined;
  // Komandan
  ValidasiLaporan: undefined;
  DetailLaporan: { laporanId: string };
  MonitorRealtime: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Aktivitas: undefined;
  Notifications: undefined;
  Profil: undefined;
};

// === USER ===
// DB CHECK: role IN ('anggota','komandan','supervisor','admin')
// 'klien' login via clients table, not users table
export type UserRole = 'anggota' | 'komandan' | 'supervisor' | 'admin' | 'klien';

// Matches: users table columns in ptsss_db_new.sql
export interface User {
  id: string;
  nrp: string;
  nama: string;
  no_hp: string;
  role: UserRole;
  foto_url: string;
  pos_jaga_id: string;
  lokasi_id: string;
  shift: string;
  status: 'on_duty' | 'patroli' | 'break' | 'off_duty';
  skor: number;
  last_seen?: string;
  last_latitude?: number;
  last_longitude?: number;
  expo_push_token?: string;
  // Personal data
  no_ktp?: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  alamat_rumah?: string;
  pendidikan?: string;
  jenis_kelamin?: 'L' | 'P';
  golongan_darah?: string;
  agama?: string;
  catatan_personil?: string;
  status_penempatan?: 'belum_ditempatkan' | 'ditempatkan' | 'nonaktif';
  tanggal_bergabung?: string;
  // Berkas
  berkas_ktp?: string;
  berkas_ijazah?: string;
  berkas_skck?: string;
  berkas_sertifikat?: string;
  berkas_cv?: string;
  berkas_foto_formal?: string;
  berkas_kontrak?: string;
  berkas_lainnya?: string;
  berkas_foto?: string;
  // Computed (from JOINs)
  lokasi_nama?: string;
  pos_nama?: string;
}

// === CLIENTS ===
// Matches: clients table columns in ptsss_db_new.sql
export interface Client {
  id: number;
  kode_klien: string;
  nama_klien: string;
  jenis_kelamin: 'Laki-Laki' | 'Perempuan' | 'Lainnya/Instansi';
  kontak_person?: string;
  nomor_telepon?: string;
  email?: string;
  alamat_klien?: string;
  jenis_jasa?: string;
  tgl_mulai_kontrak?: string;
  tgl_habis_kontrak?: string;
  status_klien: 'Aktif' | 'Non-Aktif' | 'Blacklist';
  path_kontrak_pdf?: string;
  nrp_login?: string;
  foto_url?: string;
  last_seen?: string;
  lokasi_id?: string;
}

// === LOKASI ===
// Matches: lokasi table in ptsss_db_new.sql
export interface Lokasi {
  id: string;
  nama: string;
  alamat: string;
  latitude: number;
  longitude: number;
  radius: number;
  client_id?: number;
  status: 'active' | 'inactive';
}

// === POS JAGA ===
// Matches: pos_jaga table in ptsss_db_new.sql
export interface PosJaga {
  id: string;
  lokasi_id: string;
  nama: string;
  radius: number;
  latitude: number;
  longitude: number;
  status: 'active' | 'inactive';
}

// === ABSENSI ===
// Matches: absensi table columns in ptsss_db_new.sql
export interface AbsensiRecord {
  id: string;
  user_id: string;
  tipe: 'masuk' | 'keluar';
  waktu: string;
  foto_url: string;
  latitude: number;
  longitude: number;
  alamat: string;
  pos_jaga: string;
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'libur';
  dalam_radius: boolean;
  lokasi_id?: string;
}

// === PATROLI ===
// Matches: checkpoints table in ptsss_db_new.sql
export interface Checkpoint {
  id: string;
  nama: string;
  lokasi_id: string;
  area: string;
  latitude: number;
  longitude: number;
  radius: number;
  qr_code: string;
  status: 'active' | 'inactive';
  // Runtime fields
  waktuScan?: string;
  foto?: string;
}

// Matches: routes table in ptsss_db_new.sql
export interface PatrolRoute {
  id: string;
  nama: string;
  lokasi_id: string;
  checkpoint_ids: string[];
  waktu_estimasi: number;
  assigned_shift: string;
  status: 'active' | 'inactive';
}

// Matches: patroli table in ptsss_db_new.sql
export interface Patroli {
  id: string;
  user_id: string;
  route_id?: string;
  route_name?: string;
  start_time: string;
  end_time?: string;
  status: 'active' | 'completed' | 'incomplete' | 'cancelled';
  checkpoint_scanned: number;
  checkpoint_total: number;
}

// === LAPORAN ===
export type KondisiUmum = 'aman' | 'ada_masalah' | 'perhatian_khusus';
export type PrioritasInsiden = 'rendah' | 'sedang' | 'tinggi' | 'kritis';
export type StatusLaporan = 'draft' | 'pending' | 'approved' | 'revision' | 'rejected';

// Matches: laporan_harian table in ptsss_db_new.sql
export interface LaporanHarian {
  id: string;
  user_id: string;
  tanggal: string;
  shift: string;
  pos_jaga: string;
  kondisi: KondisiUmum;
  aktivitas: string;
  temuan: string;
  perhatian_khusus?: string;
  fotos: string[];
  foto_dokumentasi?: string[];
  status: StatusLaporan;
  catatan_komandan?: string;
  validated_by?: string;
  lokasi_id?: string;
}

// Matches: laporan_kejadian table in ptsss_db_new.sql
export interface LaporanKejadian {
  id: string;
  user_id: string;
  jenis: string;
  prioritas: PrioritasInsiden;
  waktu_kejadian: string;
  lokasi_text: string;
  latitude: number;
  longitude: number;
  kronologi: string;
  bukti_media: string[];
  status: StatusLaporan;
  catatan_komandan?: string;
  validated_by?: string;
  lokasi_id?: string;
}

// === SERAH TERIMA ===
// Matches: serah_terima table in ptsss_db_new.sql
export interface SerahTerima {
  id: string;
  user_id: string;
  penerima_id?: string;
  kondisi_area: 'aman' | 'masalah' | 'perhatian';
  inventaris: { nama: string; tersedia: boolean }[];
  catatan: string;
  fotos: string[];
  dikonfirmasi: boolean;
  signature_data?: string;
  created_at: string;
}

// === NOTIFIKASI ===
// Matches: notifikasi table in ptsss_db_new.sql
export interface Notifikasi {
  id: string;
  tipe: 'info' | 'warning' | 'danger' | 'success';
  judul: string;
  pesan: string;
  target_user_id?: string;
  target_role?: string[];
  target_lokasi_id?: string;
  dibaca: boolean;
  data?: any;
  created_at: string;
}

// === BROADCASTS ===
// Matches: broadcasts table in ptsss_db_new.sql
export interface Broadcast {
  id: string;
  pengirim_id: string;
  judul: string;
  pesan: string;
  prioritas: 'normal' | 'urgent';
  target: string;
  lokasi_id?: string;
  created_at: string;
}

// === PANIC ALERTS ===
// Matches: panic_alerts table in ptsss_db_new.sql
export interface PanicAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  alamat?: string;
  pesan?: string;
  jenis_darurat: string;
  nomor_kontak?: string;
  foto_url?: string;
  lokasi_text?: string;
  status: 'active' | 'resolved' | 'false_alarm';
  resolved_by?: string;
  resolved_at?: string;
  catatan_resolver?: string;
  respon_detail?: string;
  lokasi_id?: string;
  created_at: string;
}

// === GEOFENCE ===
// Matches: geofence_izin table in ptsss_db_new.sql
export interface GeofenceIzin {
  id: string;
  user_id: string;
  lokasi_id: string;
  alasan: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'returned';
  durasi_menit?: number;
  batas_waktu?: string;
  approved_by?: string;
  catatan?: string;
  catatan_komandan?: string;
  latitude?: number;
  longitude?: number;
  approved_at?: string;
  waktu_keluar?: string;
  waktu_kembali?: string;
}

// Matches: geofence_violations table in ptsss_db_new.sql
export interface GeofenceViolation {
  id: string;
  user_id: string;
  lokasi_id: string;
  tipe: 'no_permission' | 'overtime';
  jarak_dari_pusat: number;
  latitude: number;
  longitude: number;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  izin_keluar_id?: string;
}

// === JADWAL SHIFT ===
// Matches: jadwal_shift table in ptsss_db_new.sql
export interface JadwalShift {
  id: string;
  lokasi_id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  warna: string;
}

// === SHIFT ASSIGNMENTS ===
// Matches: shift_assignments table in ptsss_db_new.sql
export interface ShiftAssignment {
  id: string;
  shift_id: string;
  user_id: string;
  pos_jaga_id?: string;
  tanggal: string;
}

// === BERKAS PERSONIL ===
// Matches: berkas_personil table in ptsss_db_new.sql
export interface BerkasPersonil {
  id: string;
  user_id: string;
  jenis: 'ktp' | 'ijazah' | 'skck' | 'sertifikat' | 'cv' | 'foto' | 'kontrak' | 'lainnya';
  nama_file: string;
  file_url: string;
  file_size?: number;
  uploaded_at: string;
}
