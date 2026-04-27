export type UserRole = 'admin' | 'supervisor' | 'komandan' | 'anggota' | 'klien';
export type Lang = 'id' | 'en';

export interface User {
  id: string;
  nrp: string;
  nama: string;
  role: UserRole;
  no_hp?: string;
  foto_url?: string;
  lokasi_id?: string;
  lokasi?: { nama: string };
  lokasi_nama?: string;
  shift?: string;
  status?: string;
  status_penempatan?: string;
  skor?: number;
  client_id?: string;
  no_ktp?: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  alamat_rumah?: string;
  pendidikan?: string;
  jenis_kelamin?: string;
  golongan_darah?: string;
  agama?: string;
  catatan_personil?: string;
  berkas_ktp?: string;
  berkas_ijazah?: string;
  berkas_skck?: string;
  berkas_sertifikat?: string;
  berkas_cv?: string;
  tanggal_bergabung?: string;
  last_seen?: string;
  created_at?: string;
}

export interface DashboardStats {
  total_personil?: number;
  total?: number;
  on_duty?: number;
  onDuty?: number;
  absensi_today?: number;
  absToday?: number;
  pending_reports?: number;
  pending?: number;
  active_panic?: number;
  panic?: number;
  total_lokasi?: number;
  lokasi?: number;
}

export interface AbsensiRecord {
  id: string;
  user_id?: string;
  users?: Partial<User>;
  nama?: string;
  nrp?: string;
  tipe: 'masuk' | 'keluar';
  waktu: string;
  status: string;
  pos_jaga?: string;
  latitude?: number;
  longitude?: number;
  alamat?: string;
  dalam_radius?: boolean;
  foto_url?: string;
  created_at?: string;
}

export interface PatroliRecord {
  id: string;
  users?: Partial<User>;
  nama?: string;
  route_name?: string;
  start_time?: string;
  end_time?: string;
  status: string;
  checkpoint_scanned?: number;
  checkpoint_total?: number;
  patrol_scans?: PatroliScan[];
}

export interface PatroliScan {
  id: string;
  checkpoint_nama?: string;
  checkpoints?: { nama: string };
  scan_time?: string;
  foto_url?: string;
}

export interface PanicRecord {
  id: string;
  user_id?: string;
  user?: Partial<User>;
  nama_pelapor?: string;
  nrp_pelapor?: string;
  role_pelapor?: string;
  foto_pelapor?: string;
  no_hp?: string;
  pesan?: string;
  jenis_darurat?: string;
  latitude?: number;
  longitude?: number;
  alamat?: string;
  lokasi_text?: string;
  lokasi_nama?: string;
  status: string;
  resolved_by?: string;
  resolved_at?: string;
  resolver?: { nama: string };
  resolver_nama?: string;
  catatan_resolver?: string;
  respon_detail?: string;
  nomor_kontak?: string;
  foto_url?: string;
  created_at?: string;
}

export interface ToastType {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  msg: string;
}
