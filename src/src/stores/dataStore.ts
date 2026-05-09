/**
 * ============================================
 * DATA STORE - PT Sopiak Satria Saga (Express.js Backend)
 * ============================================
 * Same interfaces as v4, now backed by Express.js API
 * ALL screens continue to work WITHOUT any changes
 *
 * FIX v3.3:
 * - extractArray() helper untuk handle paginated response dari backend
 * - Backend paginatedResponse() mengembalikan { data: [...], pagination: {...} }
 * - Array.isArray(result) GAGAL karena result bukan array → store SELALU kosong []
 * - Sekarang pakai extractArray() yang handle kedua format (array & paginated)
 */
import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { api, usersApi, absensiApi, patroliApi, laporanApi, dataApi } from '../lib/apiClient';
import { executeOrQueue, isOnline } from '../services/offlineSync';
import {
  cacheAllData, getCachedUsers, getCachedAbsensiToday, getCachedCheckpoints,
  getCachedRoutes, getCachedLaporanHarian, getCachedLaporanKejadian,
  getCachedNotifikasi, getCachedBroadcasts, getCachedLokasi, getCachedPosJaga,
  getCachedJadwalShift, getCachedSerahTerima, getCachedPanicAlerts,
} from '../services/offlineDatabase';

// ==================== INTERFACES (unchanged from v4) ====================

export interface TeamMember {
  id: string; nrp: string; nama: string; noHp: string;
  role: 'anggota' | 'komandan'; foto: string; pos: string; lokasi: string;
  lokasiId: string | null;
  shift: string; status: 'on_duty' | 'patroli' | 'break' | 'off_duty';
  lastSeen: string; lastLatitude: number | null; lastLongitude: number | null;
  kehadiran: string; totalPatroli: number; skor: number; tglBergabung: string;
}

export interface AbsensiRecord {
  id: string; userId: string; nama: string; nrp: string;
  tipe: 'masuk' | 'keluar'; waktu: string; tanggal: string; fotoUri: string;
  latitude: number; longitude: number; alamat: string; posJaga: string;
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'libur'; dalamRadius: boolean;
  lokasiId?: string | null;
}

export interface CheckpointData {
  id: string; nama: string; area: string; lokasi: string;
  latitude: number; longitude: number; radius: number;
  qrCode: string; status: 'active' | 'inactive';
}

export interface PatrolRouteData {
  id: string; nama: string; lokasiId?: string | null; checkpointIds: string[];
  waktuEstimasi: number; assignedShift: string; status: 'active' | 'inactive';
}

export interface ActivePatrol {
  routeId: string; routeName: string; startTime: number; patrolDbId?: string;
  checkpoints: { id: string; nama: string; scanned: boolean; scanTime?: string }[];
  currentIndex: number; isActive: boolean;
}

export interface LaporanHarianData {
  id: string; userId: string; nama: string; nrp: string; tanggal: string;
  shift: string; posJaga: string; kondisi: 'aman' | 'ada_masalah' | 'perhatian_khusus';
  aktivitas: string; temuan: string; perhatianKhusus?: string; fotos: string[]; 
  fotoDokumentasi?: string[];
  status: 'draft' | 'pending' | 'approved' | 'revision' | 'rejected';
  catatanKomandan: string; waktuSubmit: string;
  lokasiId?: string | null;
}

export interface LaporanKejadianData {
  id: string; userId: string; nama: string; nrp: string; jenis: string;
  prioritas: 'rendah' | 'sedang' | 'tinggi' | 'kritis';
  waktuKejadian: string; lokasi: string; latitude: number; longitude: number;
  kronologi: string; buktiMedia: string[];
  status: 'draft' | 'pending' | 'approved' | 'revision' | 'rejected';
  catatanKomandan: string; waktuSubmit: string;
  lokasiId?: string | null; lokasi_id?: string | null;
}

export interface SerahTerimaData {
  id: string; userId: string; nama: string;
  kondisiArea: 'aman' | 'masalah' | 'perhatian';
  inventaris: { nama: string; tersedia: boolean }[];
  catatan: string; waktu: string;
}

export interface NotifikasiData {
  id: string; tipe: 'info' | 'warning' | 'danger' | 'success';
  judul: string; pesan: string; waktu: string; dibaca: boolean;
  targetRole: string[]; targetUserId: string | null;
}

export interface BroadcastData {
  id: string; pengirim: string; judul: string; pesan: string;
  prioritas: 'normal' | 'urgent'; target: string; waktu: string;
}

export interface LokasiData {
  id: string; nama: string; alamat: string;
  posList: { id: string; nama: string; radius: number; latitude: number; longitude: number; status: 'active' | 'inactive' }[];
  totalAnggota: number; status: 'active' | 'inactive';
}

export interface ShiftData {
  id: string; nama: string; waktu: string; color: string;
  anggota: { id: string; nama: string; pos: string; foto: string }[];
}

// ==================== HELPERS ====================

/**
 * FIX v3.3: Extract array dari response API.
 * 
 * MASALAH: Backend pagination.js mengembalikan:
 *   { data: [...], pagination: { page, limit, total, totalPages } }
 * 
 * Tapi kode lama memeriksa Array.isArray(result) yang SELALU false
 * karena result adalah object, bukan array → data SELALU kosong [].
 * 
 * SOLUSI: Fungsi ini handle kedua format:
 *   - Array langsung: [...] → return as-is
 *   - Paginated: { data: [...] } → return result.data
 */
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

const fmtTime = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (d: Date | string) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${String(dt.getDate()).padStart(2, '0')} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
};

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
};

const todayStr = () => fmtDate(new Date());

let _idCounter = 9000;
const genId = (prefix: string) => `${prefix}-${++_idCounter}`;

// ==================== STORE INTERFACE ====================

interface DataStore {
  _loaded: boolean;
  loadAllData: () => Promise<void>;

  team: TeamMember[];
  getTeamMember: (id: string) => TeamMember | undefined;
  updateTeamStatus: (id: string, status: TeamMember['status']) => void;
  updateTeamMember: (id: string, data: Partial<TeamMember>) => void;
  addTeamMember: (m: TeamMember) => void;
  removeTeamMember: (id: string) => void;

  absensiRecords: AbsensiRecord[];
  addAbsensi: (r: Omit<AbsensiRecord, 'id'>) => string;
  getAbsensiByUser: (userId: string) => AbsensiRecord[];
  todayAbsensi: (userId: string) => { masuk?: AbsensiRecord; keluar?: AbsensiRecord };

  checkpoints: CheckpointData[];
  addCheckpoint: (c: Omit<CheckpointData, 'id'>) => void;
  updateCheckpoint: (id: string, data: Partial<CheckpointData>) => void;
  deleteCheckpoint: (id: string) => void;

  routes: PatrolRouteData[];
  addRoute: (r: Omit<PatrolRouteData, 'id'>) => void;
  updateRoute: (id: string, data: Partial<PatrolRouteData>) => void;
  deleteRoute: (id: string) => void;

  activePatrol: ActivePatrol | null;
  startPatrol: (routeId: string) => void;
  scanCheckpoint: (checkpointId: string, fotoUrl?: string | null) => boolean;
  endPatrol: () => void;

  laporanHarian: LaporanHarianData[];
  addLaporanHarian: (l: Omit<LaporanHarianData, 'id'>) => string;
  updateLaporanHarianStatus: (id: string, status: LaporanHarianData['status'], catatan?: string) => void;

  laporanKejadian: LaporanKejadianData[];
  addLaporanKejadian: (l: Omit<LaporanKejadianData, 'id'>) => string;
  updateLaporanKejadianStatus: (id: string, status: LaporanKejadianData['status'], catatan?: string) => void;

  serahTerimaRecords: SerahTerimaData[];
  addSerahTerima: (s: Omit<SerahTerimaData, 'id'>) => void;

  notifikasi: NotifikasiData[];
  addNotifikasi: (n: Omit<NotifikasiData, 'id'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  unreadCount: () => number;
  clearNotifikasi: () => void;
  unreadCountForRole: (role: string) => number;

  broadcasts: BroadcastData[];
  addBroadcast: (b: Omit<BroadcastData, 'id'>) => void;

  lokasi: LokasiData[];
  addLokasi: (l: Omit<LokasiData, 'id'>) => void;
  updateLokasi: (id: string, data: Partial<LokasiData>) => void;

  shifts: ShiftData[];

  panicActive: boolean;
  panicTime: number;
  activatePanic: () => void;
  deactivatePanic: () => void;
}

// ==================== STORE IMPLEMENTATION ====================

export const useDataStore = create<DataStore>((set, get) => ({
  _loaded: false,

  // ==================== LOAD ALL DATA FROM BACKEND API ====================
  loadAllData: async () => {
    try {
      set({ _loaded: false });
      console.log('[DataStore] Loading from Express.js backend...');

      // Parallel fetch all data
      const [usersData, absensiData, cpData, routeData, lhData, lkData, notifData, bcData, lokasiData, shiftData, stData, panicData] = await Promise.all([
        usersApi.list('role=anggota&role=komandan').catch(() => []),
        absensiApi.today().catch(() => []),
        dataApi.checkpoints.list().catch(() => []),
        dataApi.routes.list().catch(() => []),
        laporanApi.harianList('limit=50').catch(() => []),
        laporanApi.kejadianList('limit=50').catch(() => []),
        dataApi.notifikasi.list().catch(() => []),
        dataApi.broadcasts.list().catch(() => []),
        dataApi.lokasi.list().catch(() => []),
        dataApi.jadwalShift.list().catch(() => []),
        dataApi.serahTerima.list().catch(() => []),
        dataApi.panic.list().catch(() => []),
      ]);

      // FIX v3.3: extractArray() handles both raw arrays AND paginated { data: [...] }
      // BEFORE: (Array.isArray(lhData) ? lhData : []) → ALWAYS [] because lhData is { data: [...], pagination: {...} }
      // AFTER:  extractArray(lhData) → returns lhData.data array correctly

      // Map users → TeamMember
      const team: TeamMember[] = extractArray(usersData).map((u: any) => ({
        id: u.id, nrp: u.nrp, nama: u.nama, noHp: u.no_hp || '',
        role: u.role, foto: u.foto_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
        pos: u.pos_nama || '-', lokasi: u.lokasi_nama || '-', lokasiId: u.lokasi_id || null, shift: u.shift || '08:00-16:00',
        status: u.status || 'off_duty', lastSeen: u.last_seen ? timeAgo(u.last_seen) : '-',
        lastLatitude: u.last_latitude || null, lastLongitude: u.last_longitude || null,
        kehadiran: `${Math.max(80, (u.skor || 80))}%`, totalPatroli: 0, skor: u.skor || 80,
        tglBergabung: u.created_at ? fmtDate(u.created_at) : '-',
      }));

      // Map absensi
      const absensiRecords: AbsensiRecord[] = extractArray(absensiData).map((a: any) => ({
        id: a.id, userId: a.user_id, nama: a.nama || '-', nrp: a.nrp || '-', tipe: a.tipe,
        waktu: a.waktu ? fmtTime(a.waktu) : fmtTime(a.created_at), tanggal: fmtDate(a.created_at),
        fotoUri: a.foto_url || '', latitude: a.latitude, longitude: a.longitude,
        alamat: a.alamat || '', posJaga: a.pos_jaga || '-', status: a.status || 'hadir', dalamRadius: a.dalam_radius ?? true, lokasiId: a.lokasi_id || null,
      }));

      // Map checkpoints
      const checkpoints: CheckpointData[] = extractArray(cpData).map((c: any) => ({
        id: c.id, nama: c.nama, area: c.area || '', lokasi: c.lokasi_nama || '',
        latitude: c.latitude, longitude: c.longitude, radius: c.radius || 15,
        qrCode: c.qr_code, status: c.status || 'active',
      }));

      // Map routes
      const routes: PatrolRouteData[] = extractArray(routeData).map((r: any) => ({
        id: r.id, nama: r.nama, checkpointIds: r.checkpoint_ids || [],
        waktuEstimasi: r.waktu_estimasi || 30, assignedShift: r.assigned_shift || '', status: r.status || 'active',
      }));

      // Map laporan harian
      const laporanHarian: LaporanHarianData[] = extractArray(lhData).map((l: any) => ({
        id: l.id, userId: l.user_id, nama: l.nama || '-', nrp: l.nrp || '-',
        tanggal: l.tanggal ? fmtDate(l.tanggal) : fmtDate(l.created_at), shift: l.shift || '',
        posJaga: l.pos_jaga || '-', kondisi: l.kondisi || 'aman', aktivitas: l.aktivitas || '',
        temuan: l.temuan || '', perhatianKhusus: l.perhatian_khusus || '',
        fotos: l.fotos || [], fotoDokumentasi: l.foto_dokumentasi || [],
        status: l.status || 'pending', catatanKomandan: l.catatan_komandan || '',
        waktuSubmit: fmtTime(l.created_at), lokasiId: l.lokasi_id || null,
      }));

      // Map laporan kejadian
      const laporanKejadian: LaporanKejadianData[] = extractArray(lkData).map((l: any) => ({
        id: l.id, userId: l.user_id, nama: l.nama || '-', nrp: l.nrp || '-',
        jenis: l.jenis || '', prioritas: l.prioritas || 'sedang',
        waktuKejadian: l.waktu_kejadian ? fmtTime(l.waktu_kejadian) : '', lokasi: l.lokasi_text || '',
        latitude: l.latitude || 0, longitude: l.longitude || 0, kronologi: l.kronologi || '',
        buktiMedia: l.bukti_media || [], status: l.status || 'pending',
        catatanKomandan: l.catatan_komandan || '', waktuSubmit: fmtTime(l.created_at), lokasiId: l.lokasi_id || null,
      }));

      // Map notifikasi
      const notifikasi: NotifikasiData[] = extractArray(notifData).map((n: any) => ({
        id: n.id, tipe: n.tipe || 'info', judul: n.judul, pesan: n.pesan || '',
        waktu: n.created_at ? timeAgo(n.created_at) : '', dibaca: n.dibaca ?? false,
        targetRole: n.target_role || [], targetUserId: n.target_user_id || null,
      }));

      // Map broadcasts
      const broadcasts: BroadcastData[] = extractArray(bcData).map((b: any) => ({
        id: b.id, pengirim: b.pengirim_nama || '-', judul: b.judul, pesan: b.pesan || '',
        prioritas: b.prioritas || 'normal', target: b.target || 'all',
        waktu: b.created_at ? timeAgo(b.created_at) : '',
      }));

      // Map lokasi + pos_jaga (need separate fetch for pos_jaga)
      let posJagaData: any[] = [];
      try { posJagaData = await dataApi.posJaga.list() || []; } catch {}
      const lokasi: LokasiData[] = extractArray(lokasiData).map((l: any) => ({
        id: l.id, nama: l.nama, alamat: l.alamat || '',
        posList: extractArray(posJagaData)
          .filter((p: any) => p.lokasi_id === l.id)
          .map((p: any) => ({ id: p.id, nama: p.nama, radius: p.radius || 100, latitude: p.latitude ?? null, longitude: p.longitude ?? null, status: p.status || 'active' })),
        totalAnggota: team.filter((t) => t.lokasi === l.nama).length,
        status: l.status || 'active',
      }));

      // Map shifts
      const shifts: ShiftData[] = extractArray(shiftData).map((s: any) => ({
        id: s.id, nama: s.nama, waktu: `${s.waktu_mulai} - ${s.waktu_selesai}`,
        color: s.warna || '#2980b9', anggota: [],
      }));

      // Map serah terima
      const serahTerimaRecords: SerahTerimaData[] = extractArray(stData).map((s: any) => ({
        id: s.id, userId: s.user_id, nama: s.dari_nama || '-',
        kondisiArea: s.kondisi_area || 'aman', inventaris: (s.inventaris as any[]) || [],
        catatan: s.catatan || '', waktu: s.created_at ? fmtTime(s.created_at) : '',
      }));

      // Check active panic
      const panicActive = extractArray(panicData).some((p: any) => p.status === 'active');

      set({
        _loaded: true, team, absensiRecords, checkpoints, routes, laporanHarian, laporanKejadian,
        notifikasi, broadcasts, lokasi, shifts: shifts.length > 0 ? shifts : get().shifts,
        serahTerimaRecords, panicActive, panicTime: panicActive ? Date.now() : 0,
      });

      console.log('[DataStore] ✅ Loaded!', `Team:${team.length} Abs:${absensiRecords.length} CP:${checkpoints.length} Lok:${lokasi.length} LH:${laporanHarian.length} LK:${laporanKejadian.length}`);

      // === CACHE TO SQLITE for offline use ===
      try {
        await cacheAllData({
          users: extractArray(usersData),
          absensi: extractArray(absensiData),
          checkpoints: extractArray(cpData),
          routes: extractArray(routeData),
          laporanHarian: extractArray(lhData),
          laporanKejadian: extractArray(lkData),
          notifikasi: extractArray(notifData),
          broadcasts: extractArray(bcData),
          lokasi: extractArray(lokasiData),
          posJaga: extractArray(posJagaData),
          jadwalShift: extractArray(shiftData),
          serahTerima: extractArray(stData),
          panicAlerts: extractArray(panicData),
        });
      } catch (cacheErr) {
        console.log('[DataStore] SQLite cache error (non-fatal):', cacheErr);
      }

    } catch (error) {
      console.error('[DataStore] API Load error - trying SQLite cache...', error);

      // === FALLBACK TO SQLITE CACHE ===
      try {
        const online = await isOnline();
        if (!online) {
          console.log('[DataStore] 📦 Loading from SQLite offline cache...');

          const [cachedUsers, cachedAbsensi, cachedCP, cachedRoutes, cachedLH, cachedLK,
                 cachedNotif, cachedBC, cachedLokasi, cachedPosJaga, cachedShifts,
                 cachedST, cachedPanic] = await Promise.all([
            getCachedUsers(), getCachedAbsensiToday(), getCachedCheckpoints(),
            getCachedRoutes(), getCachedLaporanHarian(), getCachedLaporanKejadian(),
            getCachedNotifikasi(), getCachedBroadcasts(), getCachedLokasi(),
            getCachedPosJaga(), getCachedJadwalShift(), getCachedSerahTerima(),
            getCachedPanicAlerts(),
          ]);

          const team: TeamMember[] = cachedUsers.map((u: any) => ({
            id: u.id, nrp: u.nrp, nama: u.nama, noHp: u.no_hp || '',
            role: u.role, foto: u.foto_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
            pos: u.pos_nama || '-', lokasi: u.lokasi_nama || '-', lokasiId: u.lokasi_id || null, shift: u.shift || '08:00-16:00',
            status: u.status || 'off_duty', lastSeen: u.last_seen ? timeAgo(u.last_seen) : '-',
            lastLatitude: u.last_latitude || null, lastLongitude: u.last_longitude || null,
            kehadiran: `${Math.max(80, (u.skor || 80))}%`, totalPatroli: 0, skor: u.skor || 80,
            tglBergabung: u.created_at ? fmtDate(u.created_at) : '-',
          }));

          const absensiRecords: AbsensiRecord[] = cachedAbsensi.map((a: any) => ({
            id: a.id, userId: a.user_id, nama: a.nama || '-', nrp: a.nrp || '-', tipe: a.tipe,
            waktu: a.waktu ? fmtTime(a.waktu) : fmtTime(a.created_at), tanggal: fmtDate(a.created_at),
            fotoUri: a.foto_url || '', latitude: a.latitude, longitude: a.longitude,
            alamat: a.alamat || '', posJaga: a.pos_jaga || '-', status: a.status || 'hadir', dalamRadius: !!a.dalam_radius, lokasiId: a.lokasi_id || null,
          }));

          const checkpoints: CheckpointData[] = cachedCP.map((c: any) => ({
            id: c.id, nama: c.nama, area: c.area || '', lokasi: c.lokasi_nama || '',
            latitude: c.latitude, longitude: c.longitude, radius: c.radius || 15,
            qrCode: c.qr_code, status: c.status || 'active',
          }));

          const routes: PatrolRouteData[] = cachedRoutes.map((r: any) => ({
            id: r.id, nama: r.nama, checkpointIds: r.checkpoint_ids || [],
            waktuEstimasi: r.waktu_estimasi || 30, assignedShift: r.assigned_shift || '', status: r.status || 'active',
          }));

          const notifikasi: NotifikasiData[] = cachedNotif.map((n: any) => ({
            id: n.id, tipe: n.tipe || 'info', judul: n.judul, pesan: n.pesan || '',
            waktu: n.created_at ? timeAgo(n.created_at) : '', dibaca: n.dibaca ?? false,
            targetRole: n.target_role || [], targetUserId: n.target_user_id || null,
          }));

          const laporanHarian: LaporanHarianData[] = cachedLH.map((l: any) => ({
            id: l.id, userId: l.user_id, nama: l.nama || '-', nrp: l.nrp || '-',
            tanggal: l.tanggal || fmtDate(l.created_at), shift: l.shift || '',
            posJaga: l.pos_jaga || '-', kondisi: l.kondisi || 'aman', aktivitas: l.aktivitas || '',
            temuan: l.temuan || '', perhatianKhusus: l.perhatian_khusus || '',
            fotos: l.fotos || [], fotoDokumentasi: l.foto_dokumentasi || [],
            status: l.status || 'pending', catatanKomandan: l.catatan_komandan || '',
            waktuSubmit: fmtTime(l.created_at), lokasiId: l.lokasi_id || null,
          }));

          const laporanKejadian: LaporanKejadianData[] = cachedLK.map((l: any) => ({
            id: l.id, userId: l.user_id, nama: l.nama || '-', nrp: l.nrp || '-',
            jenis: l.jenis || '', prioritas: l.prioritas || 'sedang',
            waktuKejadian: l.waktu_kejadian || '', lokasi: l.lokasi_text || '',
            latitude: l.latitude || 0, longitude: l.longitude || 0, kronologi: l.kronologi || '',
            buktiMedia: l.bukti_media || [], status: l.status || 'pending',
            catatanKomandan: l.catatan_komandan || '', waktuSubmit: fmtTime(l.created_at), lokasiId: l.lokasi_id || null,
          }));

          const lokasi: LokasiData[] = cachedLokasi.map((l: any) => ({
            id: l.id, nama: l.nama, alamat: l.alamat || '',
            posList: cachedPosJaga
              .filter((p: any) => p.lokasi_id === l.id)
              .map((p: any) => ({ id: p.id, nama: p.nama, radius: p.radius || 100, latitude: p.latitude ?? null, longitude: p.longitude ?? null, status: p.status || 'active' })),
            totalAnggota: team.filter(t => t.lokasi === l.nama).length,
            status: l.status || 'active',
          }));

          const shifts: ShiftData[] = cachedShifts.map((s: any) => ({
            id: s.id, nama: s.nama, waktu: `${s.waktu_mulai} - ${s.waktu_selesai}`,
            color: s.warna || '#2980b9', anggota: [],
          }));

          const serahTerimaRecords: SerahTerimaData[] = cachedST.map((s: any) => ({
            id: s.id, userId: s.user_id, nama: s.dari_nama || '-',
            kondisiArea: s.kondisi_area || 'aman', inventaris: s.inventaris || [],
            catatan: s.catatan || '', waktu: s.created_at ? fmtTime(s.created_at) : '',
          }));

          const panicActive = cachedPanic.some((p: any) => p.status === 'active');

          set({
            _loaded: true, team, absensiRecords, checkpoints, routes, laporanHarian, laporanKejadian,
            notifikasi, lokasi, shifts: shifts.length > 0 ? shifts : get().shifts,
            serahTerimaRecords, panicActive, panicTime: panicActive ? Date.now() : 0,
            broadcasts: cachedBC.map((b: any) => ({
              id: b.id, pengirim: b.pengirim_nama || '-', judul: b.judul, pesan: b.pesan || '',
              prioritas: b.prioritas || 'normal', target: b.target || 'all',
              waktu: b.created_at ? timeAgo(b.created_at) : '',
            })),
          });

          console.log('[DataStore] ✅ Loaded from SQLite cache!', `Team:${team.length} CP:${checkpoints.length}`);
          return;
        }
      } catch (cacheError) {
        console.error('[DataStore] SQLite fallback also failed:', cacheError);
      }

      set({ _loaded: true });
    }
  },

  // ==================== TEAM ====================
  team: [],
  getTeamMember: (id) => get().team.find((m) => m.id === id || m.nrp === id),
  updateTeamStatus: (id, status) => {
    set((s) => ({ team: s.team.map((m) => m.id === id ? { ...m, status } : m) }));
    usersApi.update(id, { status }).catch(console.error);
  },
  updateTeamMember: (id, data) => {
    set((s) => ({ team: s.team.map((m) => m.id === id ? { ...m, ...data } : m) }));
    const dbData: any = {};
    if (data.status) dbData.status = data.status;
    if (data.noHp) dbData.no_hp = data.noHp;
    if (data.shift) dbData.shift = data.shift;
    if (data.skor !== undefined) dbData.skor = data.skor;
    if (Object.keys(dbData).length > 0) usersApi.update(id, dbData).catch(console.error);
  },
  addTeamMember: (m) => set((s) => ({ team: [...s.team, m] })),
  removeTeamMember: (id) => {
    set((s) => ({ team: s.team.filter((m) => m.id !== id) }));
    usersApi.delete(id).catch(console.error);
  },

  // ==================== ABSENSI ====================
  absensiRecords: [],
  addAbsensi: (r) => {
    const id = genId('AB');
    set((s) => ({ absensiRecords: [{ ...r, id }, ...s.absensiRecords] }));

    (async () => {
      const payload = {
        tipe: r.tipe, foto_url: r.fotoUri || null,
        latitude: r.latitude, longitude: r.longitude, alamat: r.alamat,
        pos_jaga: r.posJaga, status: r.status, dalam_radius: r.dalamRadius,
      };
      try {
        const { queued, result } = await executeOrQueue('absensi_create', payload, () => absensiApi.create(payload));
        if (!queued && result?.id) set((s) => ({ absensiRecords: s.absensiRecords.map((a) => a.id === id ? { ...a, id: result.id } : a) }));
        if (queued) console.log('[Absensi] Queued offline');
      } catch (e) { console.error('[Absensi] API error:', e); }
    })();

    const statusLabel = r.status === 'terlambat' ? ' (Terlambat!)' : '';
    get().addNotifikasi({
      tipe: r.status === 'terlambat' ? 'warning' : 'success',
      judul: `Absensi ${r.tipe === 'masuk' ? 'Masuk' : 'Keluar'}${statusLabel}`,
      pesan: `${r.nama} absensi ${r.tipe} di ${r.posJaga} pukul ${r.waktu}`,
      waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null,
    });
    return id;
  },
  getAbsensiByUser: (userId) => get().absensiRecords.filter((r) => r.userId === userId),
  todayAbsensi: (userId) => {
    const td = todayStr();
    const recs = get().absensiRecords.filter((r) => r.userId === userId && r.tanggal === td);
    return { masuk: recs.find((r) => r.tipe === 'masuk'), keluar: recs.find((r) => r.tipe === 'keluar') };
  },

  // ==================== CHECKPOINTS ====================
  checkpoints: [],
  addCheckpoint: (c) => {
    const id = genId('CP');
    set((s) => ({ checkpoints: [...s.checkpoints, { ...c, id }] }));
    dataApi.checkpoints.create({ nama: c.nama, area: c.area, latitude: c.latitude, longitude: c.longitude, radius: c.radius, qr_code: c.qrCode, status: c.status }).catch(console.error);
  },
  updateCheckpoint: (id, data) => {
    set((s) => ({ checkpoints: s.checkpoints.map((c) => c.id === id ? { ...c, ...data } : c) }));
    const u: any = {}; if (data.nama) u.nama = data.nama; if (data.area) u.area = data.area; if (data.status) u.status = data.status; if (data.radius) u.radius = data.radius;
    if (Object.keys(u).length) dataApi.checkpoints.update(id, u).catch(console.error);
  },
  deleteCheckpoint: (id) => {
    set((s) => ({ checkpoints: s.checkpoints.filter((c) => c.id !== id) }));
    dataApi.checkpoints.delete(id).catch(console.error);
  },

  // ==================== ROUTES ====================
  routes: [],
  addRoute: (r) => {
    const id = genId('R');
    set((s) => ({ routes: [...s.routes, { ...r, id }] }));
    dataApi.routes.create({ nama: r.nama, checkpoint_ids: r.checkpointIds, waktu_estimasi: r.waktuEstimasi, assigned_shift: r.assignedShift, status: r.status }).catch(console.error);
  },
  updateRoute: (id, data) => {
    set((s) => ({ routes: s.routes.map((r) => r.id === id ? { ...r, ...data } : r) }));
    const u: any = {}; if (data.nama) u.nama = data.nama; if (data.checkpointIds) u.checkpoint_ids = data.checkpointIds;
    if (Object.keys(u).length) dataApi.routes.update(id, u).catch(console.error);
  },
  deleteRoute: (id) => {
    set((s) => ({ routes: s.routes.filter((r) => r.id !== id) }));
    dataApi.routes.delete(id).catch(console.error);
  },

  // ==================== ACTIVE PATROL ====================
  activePatrol: null,
  startPatrol: (routeId) => {
    const route = get().routes.find((r) => r.id === routeId);
    if (!route) return;
    const cps = route.checkpointIds.map((cid) => {
      const cp = get().checkpoints.find((c) => c.id === cid);
      return { id: cid, nama: cp?.nama || cid, scanned: false };
    });
    set({ activePatrol: { routeId, routeName: route.nama, startTime: Date.now(), checkpoints: cps, currentIndex: 0, isActive: true } });

    get().addNotifikasi({ tipe: 'info', judul: 'Patroli Dimulai', pesan: `Patroli rute "${route.nama}" sedang berlangsung (${cps.length} checkpoint)`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });

    (async () => {
      try {
        const data = await patroliApi.start({ route_id: routeId, route_name: route.nama });
        if (data?.id) set((s) => s.activePatrol ? { activePatrol: { ...s.activePatrol, patrolDbId: data.id } } : {});
      } catch (e) { console.error('[Patroli] Start error:', e); }
    })();
  },
  scanCheckpoint: (checkpointId, fotoUrl) => {
    const ap = get().activePatrol;
    if (!ap) return false;
    const idx = ap.checkpoints.findIndex((c) => c.id === checkpointId && !c.scanned);
    if (idx === -1) return false;
    const updated = [...ap.checkpoints];
    const now = fmtTime(new Date());
    updated[idx] = { ...updated[idx], scanned: true, scanTime: now };
    const nextUnscanned = updated.findIndex((c) => !c.scanned);
    set({ activePatrol: { ...ap, checkpoints: updated, currentIndex: nextUnscanned === -1 ? updated.length : nextUnscanned } });

    if (ap.patrolDbId) {
      const scanPayload = { patroli_id: ap.patrolDbId, checkpoint_id: checkpointId, foto_url: fotoUrl || null };
      executeOrQueue('patrol_scan', scanPayload, () => patroliApi.scan(ap.patrolDbId!, { checkpoint_id: checkpointId, foto_url: fotoUrl || null })).catch(console.error);
    }
    return true;
  },
  endPatrol: () => {
    const ap = get().activePatrol;
    const scannedCount = ap?.checkpoints.filter((c) => c.scanned).length || 0;
    const totalCount = ap?.checkpoints.length || 0;
    set({ activePatrol: null });

    get().addNotifikasi({ tipe: scannedCount === totalCount ? 'success' : 'warning', judul: 'Patroli Selesai', pesan: `Rute "${ap?.routeName || '-'}" selesai. ${scannedCount}/${totalCount} checkpoint dipindai.`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });

    if (ap?.patrolDbId) {
      const endPayload = { patroli_id: ap.patrolDbId, checkpoint_scanned: scannedCount, checkpoint_total: totalCount };
      executeOrQueue('patrol_end', endPayload, () => patroliApi.end(ap.patrolDbId!, { checkpoint_scanned: scannedCount, checkpoint_total: totalCount })).catch(console.error);
    }
  },

  // ==================== LAPORAN HARIAN ====================
  laporanHarian: [],
  addLaporanHarian: (l) => {
    const id = genId('LH');
    set((s) => ({ laporanHarian: [{ ...l, id }, ...s.laporanHarian] }));
    (async () => {
      const payload = { shift: l.shift, pos_jaga: l.posJaga, kondisi: l.kondisi, aktivitas: l.aktivitas, temuan: l.temuan, foto_urls: JSON.stringify(l.fotos), status: 'pending' };
      try { await executeOrQueue('laporan_harian_create', payload, () => laporanApi.harianCreate(payload)); } catch (e) { console.error('[LH] API error:', e); }
    })();
    get().addNotifikasi({ tipe: 'info', judul: 'Laporan Harian Baru', pesan: `${l.nama} mengirim laporan harian (${l.kondisi})`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });
    return id;
  },
  updateLaporanHarianStatus: (id, status, catatan) => {
    const laporan = get().laporanHarian.find((l) => l.id === id);
    set((s) => ({ laporanHarian: s.laporanHarian.map((l) => l.id === id ? { ...l, status, catatanKomandan: catatan || l.catatanKomandan } : l) }));
    if (laporan) {
      const isApproved = status === 'approved';
      get().addNotifikasi({ tipe: isApproved ? 'success' : 'warning', judul: isApproved ? 'Laporan Harian Disetujui ✅' : 'Laporan Harian Perlu Revisi ⚠️', pesan: isApproved ? `Laporan harian Anda tanggal ${laporan.tanggal} telah disetujui.` : `Laporan harian Anda perlu direvisi: ${catatan || 'Silakan periksa.'}`, waktu: 'Baru saja', dibaca: false, targetRole: ['anggota'], targetUserId: null });
    }
    laporanApi.harianValidate(id, status, catatan).catch(console.error);
  },

  // ==================== LAPORAN KEJADIAN ====================
  laporanKejadian: [],
  addLaporanKejadian: (l) => {
    const id = genId('LK');
    set((s) => ({ laporanKejadian: [{ ...l, id }, ...s.laporanKejadian] }));
    (async () => {
      const payload = { jenis: l.jenis, prioritas: l.prioritas, lokasi_text: l.lokasi, latitude: l.latitude, longitude: l.longitude, kronologi: l.kronologi, foto_urls: JSON.stringify(l.buktiMedia), status: 'pending' };
      try { await executeOrQueue('laporan_kejadian_create', payload, () => laporanApi.kejadianCreate(payload)); } catch (e) { console.error('[LK] API error:', e); }
    })();
    get().addNotifikasi({ tipe: 'danger', judul: 'Insiden Baru!', pesan: `${l.nama} melaporkan ${l.jenis} (Prioritas: ${l.prioritas})`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });
    return id;
  },
  updateLaporanKejadianStatus: (id, status, catatan) => {
    const laporan = get().laporanKejadian.find((l) => l.id === id);
    set((s) => ({ laporanKejadian: s.laporanKejadian.map((l) => l.id === id ? { ...l, status, catatanKomandan: catatan || l.catatanKomandan } : l) }));
    if (laporan) {
      const isApproved = status === 'approved';
      get().addNotifikasi({ tipe: isApproved ? 'success' : 'warning', judul: isApproved ? 'Laporan Kejadian Disetujui ✅' : 'Laporan Kejadian Perlu Revisi ⚠️', pesan: isApproved ? `Laporan kejadian "${laporan.jenis}" disetujui.` : `Laporan kejadian "${laporan.jenis}" perlu direvisi.`, waktu: 'Baru saja', dibaca: false, targetRole: ['anggota'], targetUserId: null });
    }
    laporanApi.kejadianValidate(id, status, catatan).catch(console.error);
  },

  // ==================== SERAH TERIMA ====================
  serahTerimaRecords: [],
  addSerahTerima: (s) => {
    const id = genId('ST');
    set((st) => ({ serahTerimaRecords: [{ ...s, id }, ...st.serahTerimaRecords] }));
    dataApi.serahTerima.create({ kondisi_area: s.kondisiArea, inventaris: s.inventaris, catatan: s.catatan }).catch(console.error);
    get().addNotifikasi({ tipe: 'info', judul: 'Serah Terima', pesan: `${s.nama} mengirim laporan serah terima shift`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });
  },

  // ==================== NOTIFIKASI ====================
  notifikasi: [],
  addNotifikasi: (n) => {
    const id = genId('N');
    set((s) => ({ notifikasi: [{ ...n, id }, ...s.notifikasi] }));
    dataApi.notifikasi.create({ tipe: n.tipe, judul: n.judul, pesan: n.pesan, target_role: n.targetRole, target_user_id: n.targetUserId || null }).catch(() => {});
  },
  markRead: (id) => {
    set((s) => ({ notifikasi: s.notifikasi.map((n) => n.id === id ? { ...n, dibaca: true } : n) }));
    dataApi.notifikasi.read(id).catch(() => {});
  },
  markAllRead: () => {
    set((s) => ({ notifikasi: s.notifikasi.map((n) => ({ ...n, dibaca: true })) }));
    dataApi.notifikasi.readAll().catch(() => {});
  },
  unreadCount: () => get().notifikasi.filter((n) => !n.dibaca).length,
  clearNotifikasi: () => set({ notifikasi: [] }),
  unreadCountForRole: (role: string) => {
    const userId = useAuthStore.getState().user?.id || '';
    return get().notifikasi.filter((n) => {
      if (n.dibaca) return false;
      if (n.targetUserId) return n.targetUserId === userId;
      if (!n.targetRole || n.targetRole.length === 0) return true;
      if (n.targetRole.includes('all')) return true;
      return n.targetRole.includes(role);
    }).length;
  },

  // ==================== BROADCAST ====================
  broadcasts: [],
  addBroadcast: (b) => {
    const id = genId('BC');
    set((s) => ({ broadcasts: [{ ...b, id }, ...s.broadcasts] }));
    dataApi.broadcasts.create({ judul: b.judul, pesan: b.pesan, prioritas: b.prioritas, target: b.target }).catch(console.error);
    get().addNotifikasi({ tipe: 'warning', judul: b.judul, pesan: b.pesan, waktu: 'Baru saja', dibaca: false, targetRole: ['anggota', 'komandan'], targetUserId: null });
  },

  // ==================== LOKASI ====================
  lokasi: [],
  addLokasi: (l) => {
    const id = genId('LOK');
    set((s) => ({ lokasi: [...s.lokasi, { ...l, id }] }));
    dataApi.lokasi.create({ nama: l.nama, alamat: l.alamat }).catch(console.error);
  },
  updateLokasi: (id, data) => {
    set((s) => ({ lokasi: s.lokasi.map((l) => l.id === id ? { ...l, ...data } : l) }));
    const u: any = {}; if (data.nama) u.nama = data.nama; if (data.alamat) u.alamat = data.alamat; if (data.status) u.status = data.status;
    if (Object.keys(u).length) dataApi.lokasi.update(id, u).catch(console.error);
  },

  // ==================== SHIFTS ====================
  shifts: [],

  // ==================== PANIC ====================
  panicActive: false,
  panicTime: 0,
  activatePanic: () => {
    set({ panicActive: true, panicTime: Date.now() });
    (async () => {
      try {
        let lat: number | null = null, lng: number | null = null, alamat: string | null = null;
        try {
          const Location = require('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            lat = pos.coords.latitude; lng = pos.coords.longitude;
            try { const [geo] = await Location.reverseGeocodeAsync({ latitude: lat!, longitude: lng! }); if (geo) alamat = [geo.street, geo.district, geo.city].filter(Boolean).join(', '); } catch {}
          }
        } catch {}
        await dataApi.panic.create({ latitude: lat, longitude: lng, alamat });
      } catch (e) { console.error('[Panic] API error:', e); }
    })();
    get().addNotifikasi({ tipe: 'danger', judul: '🚨 PANIC ALERT!', pesan: 'Tombol darurat diaktifkan! Segera kirim bantuan!', waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });
  },
  deactivatePanic: () => {
    set({ panicActive: false, panicTime: 0 });
    // Resolve all active panic alerts (done via API)
    (async () => {
      try {
        const alerts = await dataApi.panic.list();
        for (const a of extractArray(alerts).filter((p: any) => p.status === 'active')) {
          await dataApi.panic.resolve(a.id, 'resolved');
        }
      } catch (e) { console.error('[Panic] Deactivate error:', e); }
    })();
  },
}));