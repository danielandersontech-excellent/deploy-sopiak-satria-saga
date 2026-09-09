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
import { executeOrQueue, isOnline, addToQueue } from '../services/offlineSync';
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
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'libur'; dalamRadius: boolean | null;
  lokasiId?: string | null;
}

export interface CheckpointData {
  id: string; nama: string; area: string; lokasi: string;
  lokasiId?: string | null; // [Audit 2D] dipakai addRoute untuk lokasi_id (wajib di backend)
  latitude: number; longitude: number; radius: number;
  qrCode: string; status: 'active' | 'inactive';
}

export interface PatrolRouteData {
  id: string; nama: string; lokasiId?: string | null; checkpointIds: string[];
  waktuEstimasi: number; assignedShift: string; status: 'active' | 'inactive';
}

export interface ActivePatrol {
  routeId: string; routeName: string; startTime: number; patrolDbId?: string; clientPatrolId?: string;
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
  // [Audit 2D] Kolom DATE (tanggal, tanggal_lahir, …) kini dikirim backend sebagai
  // string 'YYYY-MM-DD' (bukan ISO datetime). `new Date('YYYY-MM-DD')` = tengah
  // malam UTC → di zona negatif bergeser sehari; parse sebagai tanggal LOKAL.
  let dt: Date;
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
    dt = m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : new Date(d);
  } else {
    dt = d;
  }
  if (isNaN(dt.getTime())) return typeof d === 'string' ? d : '-';
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${String(dt.getDate()).padStart(2, '0')} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
};

// [Audit 2D] ID buatan lokal (mis. 'N-9001', 'AB-9002') tidak boleh dikirim ke
// endpoint yang memvalidasi UUID (400 "ID notifikasi tidak valid").
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: any) => typeof v === 'string' && UUID_RE.test(v);
const AUTHORITY_ROLES = ['admin', 'supervisor', 'komandan'];

export const timeAgo = (d: string) => {
  const t = new Date(d).getTime();
  if (!d || isNaN(t)) return d || '';
  const diff = Date.now() - t;
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

// [3-1] Hasil submit yang dikembalikan addX ke layar agar UI tahu apakah
// benar-benar sukses di server, tertahan di antrian offline, atau ditolak.
export type SubmitResult = { status: 'success' | 'queued' | 'error'; id?: string; data?: any; error?: string };

// [3-2] Idempotency key STABIL untuk satu submission. Dibuat sekali saat aksi
// pertama dibuat, ikut dalam payload → retry (online maupun dari antrian
// offline) memakai key yang SAMA sehingga backend men-dedup (tidak ganda).
// Tanpa dependency uuid: timestamp + 2 segmen acak (cukup unik untuk dedup).
const genIdemKey = () =>
  `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

// ==================== STORE INTERFACE ====================

interface DataStore {
  _loaded: boolean;
  loadAllData: () => Promise<void>;
  /**
   * AUDIT-B1A (BUG-01): full in-memory reset. Must be called on logout so a
   * different user logging in on the same device never sees the previous
   * user's team / absensi / laporan / notifikasi (cross-user data bleed).
   */
  reset: () => void;

  team: TeamMember[];
  getTeamMember: (id: string) => TeamMember | undefined;
  updateTeamStatus: (id: string, status: TeamMember['status']) => void;
  updateTeamMember: (id: string, data: Partial<TeamMember>) => void;
  addTeamMember: (m: TeamMember) => void;
  removeTeamMember: (id: string) => void;

  absensiRecords: AbsensiRecord[];
  addAbsensi: (r: Omit<AbsensiRecord, 'id'>) => Promise<SubmitResult>;
  getAbsensiByUser: (userId: string) => AbsensiRecord[];
  todayAbsensi: (userId: string) => { masuk?: AbsensiRecord; keluar?: AbsensiRecord };

  checkpoints: CheckpointData[];
  addCheckpoint: (c: Omit<CheckpointData, 'id'>) => void;
  updateCheckpoint: (id: string, data: Partial<CheckpointData>) => void;
  deleteCheckpoint: (id: string) => void;

  routes: PatrolRouteData[];
  // [Audit 2D] addRoute kini mengembalikan hasil server (bisa 400 bila lokasi_id
  // tidak dapat ditentukan) agar layar tidak menampilkan "berhasil" palsu.
  addRoute: (r: Omit<PatrolRouteData, 'id'>) => Promise<SubmitResult>;
  updateRoute: (id: string, data: Partial<PatrolRouteData>) => void;
  deleteRoute: (id: string) => void;

  activePatrol: ActivePatrol | null;
  startPatrol: (routeId: string) => void;
  scanCheckpoint: (checkpointId: string, fotoUrl?: string | null) => boolean;
  endPatrol: () => void;

  laporanHarian: LaporanHarianData[];
  addLaporanHarian: (l: Omit<LaporanHarianData, 'id'>) => Promise<SubmitResult>;

  laporanKejadian: LaporanKejadianData[];
  addLaporanKejadian: (l: Omit<LaporanKejadianData, 'id'>) => Promise<SubmitResult>;

  serahTerimaRecords: SerahTerimaData[];
  addSerahTerima: (s: Omit<SerahTerimaData, 'id'>, signature?: string | null) => Promise<SubmitResult>;

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
  activatePanic: () => Promise<{ queued: boolean; hasLocation: boolean }>;
  deactivatePanic: () => void;
}

// ==================== STORE IMPLEMENTATION ====================

export const useDataStore = create<DataStore>((set, get) => ({
  _loaded: false,

  // AUDIT-B1A (BUG-01): clear ALL store state back to initial values.
  // Called from the logout flow (see services/sessionCleanup.ts) so the
  // next user on the same device starts from an empty store instead of
  // briefly seeing the previous session's data.
  reset: () => set({
    _loaded: false,
    team: [],
    absensiRecords: [],
    checkpoints: [],
    routes: [],
    activePatrol: null,
    laporanHarian: [],
    laporanKejadian: [],
    serahTerimaRecords: [],
    notifikasi: [],
    broadcasts: [],
    lokasi: [],
    shifts: [],
    panicActive: false,
    panicTime: 0,
  }),

  // ==================== LOAD ALL DATA FROM BACKEND API ====================
  loadAllData: async () => {
    try {
      set({ _loaded: false });
      console.log('[DataStore] Loading from Express.js backend...');

      // Parallel fetch all data
      const [usersData, absensiData, cpData, routeData, lhData, lkData, notifData, bcData, lokasiData, shiftData, stData, panicData] = await Promise.all([
        // [Audit 2D] Tanpa all=true backend mengembalikan halaman 25 baris →
        // tim > 25 orang terpotong di semua layar (monitor, jadwal, dll).
        usersApi.list('role=anggota&role=komandan&all=true').catch(() => []),
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
        alamat: a.alamat || '', posJaga: a.pos_jaga || '-', status: a.status || 'hadir', dalamRadius: a.dalam_radius ?? null,
        // [Audit 2D] absensi lama bisa tanpa lokasi_id; backend kini ikut mengirim
        // user_lokasi_id (alias flat) → filter per-lokasi di layar komandan/klien tepat.
        lokasiId: a.lokasi_id || a.user_lokasi_id || null,
      }));

      // Map checkpoints
      const checkpoints: CheckpointData[] = extractArray(cpData).map((c: any) => ({
        id: c.id, nama: c.nama, area: c.area || '', lokasi: c.lokasi_nama || '', lokasiId: c.lokasi_id || null,
        latitude: c.latitude, longitude: c.longitude, radius: c.radius || 15,
        qrCode: c.qr_code, status: c.status || 'active',
      }));

      // Map routes
      const routes: PatrolRouteData[] = extractArray(routeData).map((r: any) => ({
        id: r.id, nama: r.nama, lokasiId: r.lokasi_id || null, checkpointIds: r.checkpoint_ids || [],
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
        waktu: n.created_at || '', dibaca: n.dibaca ?? false, // [3-9] simpan ISO, format saat render
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
            alamat: a.alamat || '', posJaga: a.pos_jaga || '-', status: a.status || 'hadir', dalamRadius: a.dalam_radius ?? null, lokasiId: a.lokasi_id || null,
          }));

          const checkpoints: CheckpointData[] = cachedCP.map((c: any) => ({
            id: c.id, nama: c.nama, area: c.area || '', lokasi: c.lokasi_nama || '', lokasiId: c.lokasi_id || null,
            latitude: c.latitude, longitude: c.longitude, radius: c.radius || 15,
            qrCode: c.qr_code, status: c.status || 'active',
          }));

          const routes: PatrolRouteData[] = cachedRoutes.map((r: any) => ({
            id: r.id, nama: r.nama, lokasiId: r.lokasi_id || null, checkpointIds: r.checkpoint_ids || [],
            waktuEstimasi: r.waktu_estimasi || 30, assignedShift: r.assigned_shift || '', status: r.status || 'active',
          }));

          const notifikasi: NotifikasiData[] = cachedNotif.map((n: any) => ({
            id: n.id, tipe: n.tipe || 'info', judul: n.judul, pesan: n.pesan || '',
            waktu: n.created_at || '', dibaca: n.dibaca ?? false, // [3-9] simpan ISO, format saat render
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
  addAbsensi: async (r) => {
    const id = genId('AB');
    const idempotency_key = genIdemKey();
    set((s) => ({ absensiRecords: [{ ...r, id }, ...s.absensiRecords] }));

    const payload = {
      tipe: r.tipe, foto_url: r.fotoUri || null,
      latitude: r.latitude, longitude: r.longitude, alamat: r.alamat,
      pos_jaga: r.posJaga, status: r.status, dalam_radius: r.dalamRadius,
      idempotency_key, // [3-2]
    };
    let outcome: SubmitResult;
    try {
      const { queued, result } = await executeOrQueue('absensi_create', payload, () => absensiApi.create(payload));
      if (!queued && result?.id) {
        set((s) => ({ absensiRecords: s.absensiRecords.map((a) => a.id === id ? { ...a, id: result.id } : a) }));
        outcome = { status: 'success', id: result.id, data: result };
      } else if (queued) {
        outcome = { status: 'queued', id };
      } else {
        outcome = { status: 'success', id, data: result };
      }
    } catch (e: any) {
      // [3-1] Penolakan server (non-jaringan) → rollback optimistik agar tak ada record hantu.
      set((s) => ({ absensiRecords: s.absensiRecords.filter((a) => a.id !== id) }));
      outcome = { status: 'error', error: e?.message || 'Gagal menyimpan absensi' };
    }

    if (outcome.status !== 'error') {
      const statusLabel = r.status === 'terlambat' ? ' (Terlambat!)' : '';
      get().addNotifikasi({
        tipe: r.status === 'terlambat' ? 'warning' : 'success',
        judul: `Absensi ${r.tipe === 'masuk' ? 'Masuk' : 'Keluar'}${statusLabel}`,
        pesan: `${r.nama} absensi ${r.tipe} di ${r.posJaga} pukul ${r.waktu}`,
        waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null,
      });
    }
    return outcome;
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
  addRoute: async (r) => {
    const id = genId('R');
    // [Audit 2D] Backend (audit 2A) mewajibkan lokasi_id untuk routes → tanpa
    // itu POST ditolak 400 "Validasi gagal" dan rute hanya "ada" di memori sampai
    // refresh. Turunkan lokasi_id dari checkpoint terpilih (semua checkpoint
    // satu rute seharusnya satu lokasi), fallback lokasi user yang login.
    const cps = get().checkpoints;
    const lokasiById = get().lokasi;
    let lokasiId: string | null = r.lokasiId || null;
    if (!lokasiId) {
      for (const cid of r.checkpointIds) {
        const cp = cps.find((c) => c.id === cid);
        if (!cp) continue;
        if (cp.lokasiId) { lokasiId = cp.lokasiId; break; }
        const byName = cp.lokasi ? lokasiById.find((l) => l.nama === cp.lokasi) : null;
        if (byName) { lokasiId = byName.id; break; }
      }
    }
    if (!lokasiId) lokasiId = useAuthStore.getState().user?.lokasi_id || null;
    if (!lokasiId) {
      return { status: 'error', error: 'Lokasi rute tidak dapat ditentukan. Pastikan checkpoint terpilih memiliki lokasi.' };
    }

    set((s) => ({ routes: [...s.routes, { ...r, id, lokasiId }] }));
    try {
      const created: any = await dataApi.routes.create({
        nama: r.nama, lokasi_id: lokasiId, checkpoint_ids: r.checkpointIds,
        waktu_estimasi: r.waktuEstimasi, assigned_shift: r.assignedShift, status: r.status,
      });
      if (created?.id) {
        set((s) => ({ routes: s.routes.map((x) => x.id === id ? { ...x, id: created.id } : x) }));
        return { status: 'success', id: created.id, data: created };
      }
      return { status: 'success', id, data: created };
    } catch (e: any) {
      // Ditolak server → rollback agar tidak ada rute hantu.
      set((s) => ({ routes: s.routes.filter((x) => x.id !== id) }));
      const details = Array.isArray(e?.details) ? ` (${e.details.join(', ')})` : '';
      return { status: 'error', error: (e?.message || 'Gagal menyimpan rute') + details };
    }
  },
  updateRoute: (id, data) => {
    set((s) => ({ routes: s.routes.map((r) => r.id === id ? { ...r, ...data } : r) }));
    const u: any = {}; if (data.nama) u.nama = data.nama; if (data.checkpointIds) u.checkpoint_ids = data.checkpointIds;
    // [Audit 2D] estimasi & shift hasil edit sebelumnya tidak pernah dikirim ke server.
    if (data.waktuEstimasi != null) u.waktu_estimasi = data.waktuEstimasi;
    if (data.assignedShift != null) u.assigned_shift = data.assignedShift;
    if (data.status) u.status = data.status;
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
    // [4-2] Referensi lokal stabil → backend dapat menautkan scan/end ke patroli
    // ini setelah start tersinkron, walau start dimulai OFFLINE.
    const clientPatrolId = genIdemKey();
    set({ activePatrol: { routeId, routeName: route.nama, startTime: Date.now(), checkpoints: cps, currentIndex: 0, isActive: true, clientPatrolId } });

    get().addNotifikasi({ tipe: 'info', judul: 'Patroli Dimulai', pesan: `Patroli rute "${route.nama}" sedang berlangsung (${cps.length} checkpoint)`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });

    // Start RESILIENT: online → langsung & simpan patrolDbId; offline → antri
    // (prioritas patrol_start < patrol_scan, jadi start tersinkron lebih dulu).
    const startPayload = { route_id: routeId, route_name: route.nama, client_patrol_id: clientPatrolId };
    executeOrQueue('patrol_start', startPayload, () => patroliApi.start(startPayload))
      .then((res) => {
        if (res && !res.queued && res.result?.id) {
          set((s) => (s.activePatrol && s.activePatrol.clientPatrolId === clientPatrolId)
            ? { activePatrol: { ...s.activePatrol, patrolDbId: res.result.id } } : {});
        }
      })
      .catch((e) => console.error('[Patroli] Start error:', e));
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

    // [4-2] Scan TIDAK lagi bergantung mutlak pada patrolDbId. Bawa client_patrol_id
    // + idempotency_key. Jika start belum sinkron (offline/race) → antri langsung
    // (backend menautkan via client_patrol_id setelah start sinkron). Idempotency
    // mencegah duplikasi saat replay.
    const idempotency_key = genIdemKey();
    const scanData: any = { patroli_id: ap.patrolDbId || null, client_patrol_id: ap.clientPatrolId, checkpoint_id: checkpointId, foto_url: fotoUrl || null, idempotency_key };
    if (ap.patrolDbId) {
      executeOrQueue('patrol_scan', scanData, () => patroliApi.scan(ap.patrolDbId!, scanData)).catch(console.error);
    } else {
      addToQueue('patrol_scan', scanData).catch(console.error);
    }
    return true;
  },
  endPatrol: () => {
    const ap = get().activePatrol;
    const scannedCount = ap?.checkpoints.filter((c) => c.scanned).length || 0;
    const totalCount = ap?.checkpoints.length || 0;
    set({ activePatrol: null });

    get().addNotifikasi({ tipe: scannedCount === totalCount ? 'success' : 'warning', judul: 'Patroli Selesai', pesan: `Rute "${ap?.routeName || '-'}" selesai. ${scannedCount}/${totalCount} checkpoint dipindai.`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });

    // [4-2] End juga tidak bergantung mutlak pada patrolDbId (offline patrol).
    if (ap) {
      const endData: any = { patroli_id: ap.patrolDbId || null, client_patrol_id: ap.clientPatrolId, checkpoint_scanned: scannedCount, checkpoint_total: totalCount };
      if (ap.patrolDbId) {
        executeOrQueue('patrol_end', endData, () => patroliApi.end(ap.patrolDbId!, endData)).catch(console.error);
      } else {
        addToQueue('patrol_end', endData).catch(console.error);
      }
    }
  },

  // ==================== LAPORAN HARIAN ====================
  laporanHarian: [],
  addLaporanHarian: async (l) => {
    const id = genId('LH');
    const idempotency_key = genIdemKey();
    set((s) => ({ laporanHarian: [{ ...l, id }, ...s.laporanHarian] }));
    const payload = { shift: l.shift, pos_jaga: l.posJaga, kondisi: l.kondisi, aktivitas: l.aktivitas, temuan: l.temuan, foto_urls: JSON.stringify(l.fotos), status: 'pending', idempotency_key };
    let outcome: SubmitResult;
    try {
      const { queued, result } = await executeOrQueue('laporan_harian_create', payload, () => laporanApi.harianCreate(payload));
      if (!queued && result?.id) {
        set((s) => ({ laporanHarian: s.laporanHarian.map((x) => x.id === id ? { ...x, id: result.id } : x) }));
        outcome = { status: 'success', id: result.id, data: result };
      } else if (queued) { outcome = { status: 'queued', id }; }
      else { outcome = { status: 'success', id, data: result }; }
    } catch (e: any) {
      set((s) => ({ laporanHarian: s.laporanHarian.filter((x) => x.id !== id) }));
      outcome = { status: 'error', error: e?.message || 'Gagal mengirim laporan harian' };
    }
    if (outcome.status !== 'error') {
      get().addNotifikasi({ tipe: 'info', judul: 'Laporan Harian Baru', pesan: `${l.nama} mengirim laporan harian (${l.kondisi})`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });
    }
    return outcome;
  },
  // ==================== LAPORAN KEJADIAN ====================
  laporanKejadian: [],
  addLaporanKejadian: async (l) => {
    const id = genId('LK');
    const idempotency_key = genIdemKey();
    set((s) => ({ laporanKejadian: [{ ...l, id }, ...s.laporanKejadian] }));
    const payload = { jenis: l.jenis, prioritas: l.prioritas, lokasi_text: l.lokasi, latitude: l.latitude, longitude: l.longitude, kronologi: l.kronologi, foto_urls: JSON.stringify(l.buktiMedia), status: 'pending', idempotency_key };
    let outcome: SubmitResult;
    try {
      const { queued, result } = await executeOrQueue('laporan_kejadian_create', payload, () => laporanApi.kejadianCreate(payload));
      if (!queued && result?.id) {
        set((s) => ({ laporanKejadian: s.laporanKejadian.map((x) => x.id === id ? { ...x, id: result.id } : x) }));
        outcome = { status: 'success', id: result.id, data: result };
      } else if (queued) { outcome = { status: 'queued', id }; }
      else { outcome = { status: 'success', id, data: result }; }
    } catch (e: any) {
      set((s) => ({ laporanKejadian: s.laporanKejadian.filter((x) => x.id !== id) }));
      outcome = { status: 'error', error: e?.message || 'Gagal mengirim laporan kejadian' };
    }
    if (outcome.status !== 'error') {
      get().addNotifikasi({ tipe: 'danger', judul: 'Insiden Baru!', pesan: `${l.nama} melaporkan ${l.jenis} (Prioritas: ${l.prioritas})`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });
    }
    return outcome;
  },
  // ==================== SERAH TERIMA ====================
  serahTerimaRecords: [],
  addSerahTerima: async (s, signature) => {
    const id = genId('ST');
    const idempotency_key = genIdemKey();
    set((st) => ({ serahTerimaRecords: [{ ...s, id }, ...st.serahTerimaRecords] }));
    const payload: any = { kondisi_area: s.kondisiArea, inventaris: s.inventaris, catatan: s.catatan, idempotency_key };
    if (signature) payload.tanda_tangan = signature; // [3-3] alirkan tanda tangan ke backend
    let outcome: SubmitResult;
    try {
      const { queued, result } = await executeOrQueue('serah_terima_create', payload, () => dataApi.serahTerima.create(payload));
      if (!queued && result?.id) {
        set((st) => ({ serahTerimaRecords: st.serahTerimaRecords.map((x) => x.id === id ? { ...x, id: result.id } : x) }));
        outcome = { status: 'success', id: result.id, data: result };
      } else if (queued) { outcome = { status: 'queued', id }; }
      else { outcome = { status: 'success', id, data: result }; }
    } catch (e: any) {
      set((st) => ({ serahTerimaRecords: st.serahTerimaRecords.filter((x) => x.id !== id) }));
      outcome = { status: 'error', error: e?.message || 'Gagal mengirim serah terima' };
    }
    if (outcome.status !== 'error') {
      get().addNotifikasi({ tipe: 'info', judul: 'Serah Terima', pesan: `${s.nama} mengirim laporan serah terima shift`, waktu: 'Baru saja', dibaca: false, targetRole: ['komandan'], targetUserId: null });
    }
    return outcome;
  },

  // ==================== NOTIFIKASI ====================
  notifikasi: [],
  addNotifikasi: (n) => {
    const id = genId('N');
    // [3-9] Simpan timestamp ISO yang konsisten (bukan literal 'Baru saja').
    // Tampilan relatif ("Baru saja", "5 menit lalu") dihitung saat RENDER.
    const notif = { ...n, id, waktu: new Date().toISOString() };
    set((s) => ({ notifikasi: [notif, ...s.notifikasi] }));
    // [Audit 2D] Backend hanya mengizinkan anggota/klien membuat notifikasi
    // untuk DIRINYA sendiri (target_role → 403). Jangan kirim yang pasti ditolak;
    // notifikasi tetap tampil lokal, dan komandan menerima event realtime dari
    // server (absensi:new, laporan:new, panic:alert) — bukan dari mirror ini.
    const me = useAuthStore.getState().user;
    const isAuthority = !!me && AUTHORITY_ROLES.includes(me.role);
    const targetsRole = Array.isArray(n.targetRole) && n.targetRole.length > 0;
    const targetsOther = !!n.targetUserId && n.targetUserId !== me?.id;
    if (!isAuthority && (targetsRole || targetsOther)) return;
    dataApi.notifikasi.create({ tipe: n.tipe, judul: n.judul, pesan: n.pesan, target_role: n.targetRole, target_user_id: n.targetUserId || null }).catch(() => {});
  },
  markRead: (id) => {
    set((s) => ({ notifikasi: s.notifikasi.map((n) => n.id === id ? { ...n, dibaca: true } : n) }));
    if (!isUuid(id)) return; // [Audit 2D] notifikasi lokal tidak ada di server
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
    // [Audit 2D] Backend memvalidasi target ∈ all/anggota/komandan/supervisor;
    // label bebas (mis. "Semua Anggota") → 400. Normalisasi sebelum kirim.
    const apiTarget = ['all', 'anggota', 'komandan', 'supervisor'].includes(b.target) ? b.target : 'all';
    dataApi.broadcasts.create({ judul: b.judul, pesan: b.pesan, prioritas: b.prioritas, target: apiTarget }).catch(console.error);
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
  activatePanic: async () => {
    set({ panicActive: true, panicTime: Date.now() });
    const idempotency_key = genIdemKey(); // [3-2] replay aman (tak menggandakan alert)
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

    const payload = { latitude: lat, longitude: lng, alamat, idempotency_key };
    // [4-1] Panic WAJIB offline-capable: masuk antrian prioritas-0 bila offline,
    // dan TETAP di-antri walau server menolak (non-jaringan) — alert darurat
    // tidak boleh hilang senyap. GPS ikut terkirim. Idempotency cegah duplikat.
    let queued = false;
    try {
      const res = await executeOrQueue('panic_create', payload, () => dataApi.panic.create(payload));
      queued = !!res.queued;
    } catch (e) {
      try { await addToQueue('panic_create', payload); queued = true; } catch (e2) { console.error('[Panic] enqueue gagal:', e2); }
    }

    get().addNotifikasi({ tipe: 'danger', judul: '🚨 PANIC ALERT!', pesan: 'Tombol darurat diaktifkan! Segera kirim bantuan!', waktu: 'Baru saja', dibaca: false, targetRole: ['komandan', 'supervisor'], targetUserId: null });
    return { queued, hasLocation: lat != null };
  },
  deactivatePanic: () => {
    set({ panicActive: false, panicTime: 0 });
    // Resolve all active panic alerts (done via API)
    (async () => {
      try {
        const alerts = await dataApi.panic.list();
        // [Audit 2D] GET /panic ber-scope lokasi → anggota ikut melihat panic rekan
        // se-lokasi; backend menolak resolve milik orang lain (403) dan loop lama
        // berhenti di error pertama sehingga panic MILIK SENDIRI bisa tak ter-resolve.
        // Non-komando: hanya milik sendiri; error per item tidak menghentikan sisanya.
        const me = useAuthStore.getState().user;
        const isAuthority = !!me && AUTHORITY_ROLES.includes(me.role);
        const mine = extractArray(alerts).filter((p: any) => p.status === 'active' && (isAuthority || p.user_id === me?.id));
        for (const a of mine) {
          try { await dataApi.panic.resolve(a.id, 'resolved'); }
          catch (e) { console.log('[Panic] Resolve gagal untuk', a.id, (e as any)?.message); }
        }
      } catch (e) { console.error('[Panic] Deactivate error:', e); }
    })();
  },
}));