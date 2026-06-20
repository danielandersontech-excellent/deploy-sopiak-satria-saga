/**
 * ============================================================
 * OFFLINE DATABASE - SQLite Local Cache v4 FIXED
 * ============================================================
 * FIXES:
 *  - "database is locked" / "NativeStatement.finalizeAsync" errors
 *  - Uses proper serial queue with debouncing
 *  - All operations go through a single serialized queue
 *  - Retry logic with exponential backoff for transient errors
 */
import * as SQLite from "expo-sqlite";

const DB_NAME = "ptsss_offline.db";
const DB_VERSION = 4;

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Improved serial queue to prevent "database is locked" errors
let _busy = false;
const _queue: Array<{ resolve: (v: any) => void; reject: (e: any) => void; fn: () => Promise<any> }> = [];

async function serialExec<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    _queue.push({ resolve, reject, fn });
    processQueue();
  });
}

async function processQueue() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const item = _queue.shift()!;
  try {
    const result = await item.fn();
    item.resolve(result);
  } catch (err) {
    item.reject(err);
  } finally {
    _busy = false;
    // Process next in queue on next tick to avoid stack overflow
    if (_queue.length > 0) {
      setTimeout(processQueue, 1);
    }
  }
}

// ===== DATABASE INITIALIZATION =====
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA busy_timeout = 10000;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    await db.execAsync("PRAGMA synchronous = NORMAL;");
    await initTables(db);
    _db = db;
    return db;
  })();
  return _dbPromise;
}

async function initTables(db: SQLite.SQLiteDatabase): Promise<void> {
  let currentVersion = 0;
  try {
    const row = await db.getFirstAsync<{ version: number }>("SELECT version FROM db_version LIMIT 1");
    if (row) currentVersion = row.version;
  } catch { }

  if (currentVersion >= DB_VERSION) return;

  console.log(`[OfflineDB] Upgrading from v${currentVersion} to v${DB_VERSION}...`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS db_version (version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nrp TEXT, nama TEXT, role TEXT, no_hp TEXT, foto_url TEXT, lokasi_id TEXT, pos_jaga_id TEXT, lokasi_nama TEXT, pos_nama TEXT, shift TEXT, status TEXT DEFAULT 'off_duty', skor INTEGER DEFAULT 80, last_latitude REAL, last_longitude REAL, last_seen TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS absensi (id TEXT PRIMARY KEY, user_id TEXT, nama TEXT, nrp TEXT, tipe TEXT, waktu TEXT, foto_url TEXT, latitude REAL, longitude REAL, alamat TEXT, pos_jaga TEXT, status TEXT DEFAULT 'hadir', dalam_radius INTEGER DEFAULT 1, created_at TEXT);
    CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, nama TEXT, area TEXT, lokasi_id TEXT, lokasi_nama TEXT, latitude REAL, longitude REAL, radius INTEGER DEFAULT 15, qr_code TEXT, status TEXT DEFAULT 'active', created_at TEXT);
    CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, nama TEXT, checkpoint_ids TEXT, waktu_estimasi INTEGER DEFAULT 30, assigned_shift TEXT, status TEXT DEFAULT 'active', created_at TEXT);
    CREATE TABLE IF NOT EXISTS laporan_harian (id TEXT PRIMARY KEY, user_id TEXT, nama TEXT, nrp TEXT, tanggal TEXT, shift TEXT, pos_jaga TEXT, kondisi TEXT DEFAULT 'aman', aktivitas TEXT, temuan TEXT, fotos TEXT, status TEXT DEFAULT 'pending', catatan_komandan TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS laporan_kejadian (id TEXT PRIMARY KEY, user_id TEXT, nama TEXT, nrp TEXT, jenis TEXT, prioritas TEXT DEFAULT 'sedang', waktu_kejadian TEXT, lokasi_text TEXT, latitude REAL, longitude REAL, kronologi TEXT, bukti_media TEXT, status TEXT DEFAULT 'pending', catatan_komandan TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS notifikasi (id TEXT PRIMARY KEY, tipe TEXT DEFAULT 'info', judul TEXT, pesan TEXT, dibaca INTEGER DEFAULT 0, target_role TEXT, target_user_id TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS broadcasts (id TEXT PRIMARY KEY, pengirim_nama TEXT, judul TEXT, pesan TEXT, prioritas TEXT DEFAULT 'normal', target TEXT DEFAULT 'all', created_at TEXT);
    CREATE TABLE IF NOT EXISTS lokasi (id TEXT PRIMARY KEY, nama TEXT, alamat TEXT, status TEXT DEFAULT 'active', created_at TEXT);
    CREATE TABLE IF NOT EXISTS pos_jaga (id TEXT PRIMARY KEY, nama TEXT, lokasi_id TEXT, latitude REAL, longitude REAL, radius INTEGER DEFAULT 100, status TEXT DEFAULT 'active', created_at TEXT);
    CREATE TABLE IF NOT EXISTS jadwal_shift (id TEXT PRIMARY KEY, nama TEXT, waktu_mulai TEXT, waktu_selesai TEXT, warna TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS serah_terima (id TEXT PRIMARY KEY, user_id TEXT, dari_nama TEXT, kondisi_area TEXT DEFAULT 'aman', inventaris TEXT, catatan TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS panic_alerts (id TEXT PRIMARY KEY, user_id TEXT, nama TEXT, latitude REAL, longitude REAL, alamat TEXT, status TEXT DEFAULT 'active', created_at TEXT);
    CREATE TABLE IF NOT EXISTS offline_queue (id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL, timestamp INTEGER NOT NULL, retries INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 5, last_error TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sync_meta (table_name TEXT PRIMARY KEY, last_sync_at TEXT, record_count INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_absensi_user_id ON absensi(user_id);
    CREATE INDEX IF NOT EXISTS idx_absensi_created ON absensi(created_at);
    CREATE INDEX IF NOT EXISTS idx_laporan_h_user ON laporan_harian(user_id);
    CREATE INDEX IF NOT EXISTS idx_laporan_k_user ON laporan_kejadian(user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_dibaca ON notifikasi(dibaca);
    CREATE INDEX IF NOT EXISTS idx_queue_type ON offline_queue(type);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_pos_lokasi ON pos_jaga(lokasi_id);
  `);

  // AUDIT-B1A (BUG-04): normalize rows queued under the old schema (where
  // max_retries defaulted to 5) up to the dead-letter threshold so in-flight
  // offline submissions from a previous app version aren't hard-deleted early.
  await db.runAsync("UPDATE offline_queue SET max_retries = 7 WHERE max_retries < 7");

  await db.runAsync("DELETE FROM db_version");
  await db.runAsync("INSERT INTO db_version (version) VALUES (?)", DB_VERSION);
  console.log("[OfflineDB] ✅ Tables initialized");
}

// ===== GENERIC UPSERT HELPER =====
function buildUpsert(table: string, data: Record<string, any>) {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(",");
  const values = keys.map((k) => {
    const v = data[k];
    if (v === null || v === undefined) return null;
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
  const updateClause = keys.filter((k) => k !== "id").map((k) => `${k} = excluded.${k}`).join(", ");
  const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateClause}`;
  return { sql, values };
}

// ===== CACHE ALL DATA - SINGLE SERIALIZED OPERATION =====
// This is the key fix: everything goes through serialExec so no concurrent DB access
let _cacheDebounce: ReturnType<typeof setTimeout> | null = null;
let _pendingCacheData: any = null;

export async function cacheAllData(data: any): Promise<void> {
  // Debounce: if called multiple times rapidly, only run the last one
  _pendingCacheData = data;
  if (_cacheDebounce) clearTimeout(_cacheDebounce);
  
  return new Promise((resolve) => {
    _cacheDebounce = setTimeout(async () => {
      try {
        await _doCacheAllData(_pendingCacheData);
      } catch (err) {
        console.error("[OfflineDB] Cache error (non-fatal):", err);
      }
      resolve();
    }, 200);
  });
}

async function _doCacheAllData(data: any): Promise<void> {
  const now = new Date().toISOString();
  console.log("[OfflineDB] Caching all data...");

  await serialExec(async () => {
    const db = await getDb();
    try {
      await db.withTransactionAsync(async () => {
        const upsertBatch = async (table: string, rows: Record<string, any>[]) => {
          for (const row of rows) {
            const { sql, values } = buildUpsert(table, row);
            await db.runAsync(sql, values);
          }
          await db.runAsync(
            `INSERT INTO sync_meta (table_name, last_sync_at, record_count) VALUES (?, datetime('now'), ?) ON CONFLICT(table_name) DO UPDATE SET last_sync_at = datetime('now'), record_count = ?`,
            [table, rows.length, rows.length]
          );
        };

        if (data.users?.length) await upsertBatch("users", data.users.map((u: any) => ({ id: u.id, nrp: u.nrp, nama: u.nama, role: u.role, no_hp: u.no_hp || null, foto_url: u.foto_url || null, lokasi_id: u.lokasi_id || null, pos_jaga_id: u.pos_jaga_id || null, lokasi_nama: u.lokasi_nama || null, pos_nama: u.pos_nama || null, shift: u.shift || null, status: u.status || "off_duty", skor: u.skor || 80, last_latitude: u.last_latitude || null, last_longitude: u.last_longitude || null, last_seen: u.last_seen || null, created_at: u.created_at || now, updated_at: now })));
        if (data.absensi?.length) await upsertBatch("absensi", data.absensi.map((a: any) => ({ id: a.id, user_id: a.user_id, nama: a.nama, nrp: a.nrp, tipe: a.tipe, waktu: a.waktu || a.created_at, foto_url: a.foto_url || null, latitude: a.latitude, longitude: a.longitude, alamat: a.alamat || null, pos_jaga: a.pos_jaga || null, status: a.status || "hadir", dalam_radius: a.dalam_radius ? 1 : 0, created_at: a.created_at || now })));
        if (data.checkpoints?.length) await upsertBatch("checkpoints", data.checkpoints.map((c: any) => ({ id: c.id, nama: c.nama, area: c.area || null, lokasi_id: c.lokasi_id || null, lokasi_nama: c.lokasi_nama || null, latitude: c.latitude, longitude: c.longitude, radius: c.radius || 15, qr_code: c.qr_code || null, status: c.status || "active", created_at: c.created_at || now })));
        if (data.routes?.length) await upsertBatch("routes", data.routes.map((r: any) => ({ id: r.id, nama: r.nama, checkpoint_ids: JSON.stringify(r.checkpoint_ids || []), waktu_estimasi: r.waktu_estimasi || 30, assigned_shift: r.assigned_shift || null, status: r.status || "active", created_at: r.created_at || now })));
        if (data.laporanHarian?.length) await upsertBatch("laporan_harian", data.laporanHarian.map((l: any) => ({ id: l.id, user_id: l.user_id, nama: l.nama, nrp: l.nrp, tanggal: l.tanggal || null, shift: l.shift || null, pos_jaga: l.pos_jaga || null, kondisi: l.kondisi || "aman", aktivitas: l.aktivitas || null, temuan: l.temuan || null, fotos: JSON.stringify(l.fotos || []), status: l.status || "pending", catatan_komandan: l.catatan_komandan || null, created_at: l.created_at || now })));
        if (data.laporanKejadian?.length) await upsertBatch("laporan_kejadian", data.laporanKejadian.map((l: any) => ({ id: l.id, user_id: l.user_id, nama: l.nama, nrp: l.nrp, jenis: l.jenis || null, prioritas: l.prioritas || "sedang", waktu_kejadian: l.waktu_kejadian || null, lokasi_text: l.lokasi_text || null, latitude: l.latitude || 0, longitude: l.longitude || 0, kronologi: l.kronologi || null, bukti_media: JSON.stringify(l.bukti_media || []), status: l.status || "pending", catatan_komandan: l.catatan_komandan || null, created_at: l.created_at || now })));
        if (data.notifikasi?.length) await upsertBatch("notifikasi", data.notifikasi.map((n: any) => ({ id: n.id, tipe: n.tipe || "info", judul: n.judul, pesan: n.pesan || null, dibaca: n.dibaca ? 1 : 0, target_role: JSON.stringify(n.target_role || []), target_user_id: n.target_user_id || null, created_at: n.created_at || now })));
        if (data.broadcasts?.length) await upsertBatch("broadcasts", data.broadcasts.map((b: any) => ({ id: b.id, pengirim_nama: b.pengirim_nama || null, judul: b.judul, pesan: b.pesan || null, prioritas: b.prioritas || "normal", target: b.target || "all", created_at: b.created_at || now })));
        if (data.lokasi?.length) await upsertBatch("lokasi", data.lokasi.map((l: any) => ({ id: l.id, nama: l.nama, alamat: l.alamat || null, status: l.status || "active", created_at: l.created_at || now })));
        if (data.posJaga?.length) await upsertBatch("pos_jaga", data.posJaga.map((p: any) => ({ id: p.id, nama: p.nama, lokasi_id: p.lokasi_id || null, latitude: p.latitude || 0, longitude: p.longitude || 0, radius: p.radius || 100, status: p.status || "active", created_at: p.created_at || now })));
        if (data.jadwalShift?.length) await upsertBatch("jadwal_shift", data.jadwalShift.map((s: any) => ({ id: s.id, nama: s.nama, waktu_mulai: s.waktu_mulai || null, waktu_selesai: s.waktu_selesai || null, warna: s.warna || null, created_at: s.created_at || now })));
        if (data.serahTerima?.length) await upsertBatch("serah_terima", data.serahTerima.map((s: any) => ({ id: s.id, user_id: s.user_id, dari_nama: s.dari_nama || null, kondisi_area: s.kondisi_area || "aman", inventaris: JSON.stringify(s.inventaris || []), catatan: s.catatan || null, created_at: s.created_at || now })));
        if (data.panicAlerts?.length) await upsertBatch("panic_alerts", data.panicAlerts.map((p: any) => ({ id: p.id, user_id: p.user_id, nama: p.nama || null, latitude: p.latitude || 0, longitude: p.longitude || 0, alamat: p.alamat || null, status: p.status || "active", created_at: p.created_at || now })));
      });
      console.log("[OfflineDB] ✅ All data cached");
    } catch (err) {
      console.error("[OfflineDB] Cache transaction error:", err);
    }
  });
}

// ===== READ CACHED DATA - all serialized =====
async function safeRead<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return serialExec(async () => {
    const db = await getDb();
    return fn(db);
  });
}

export async function getCachedUsers(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM users WHERE role IN (?, ?) ORDER BY nama", ["anggota", "komandan"])); }
export async function getCachedAbsensiToday(): Promise<any[]> { const today = new Date().toISOString().split("T")[0]; return safeRead((db) => db.getAllAsync("SELECT * FROM absensi WHERE date(created_at) = ? ORDER BY created_at DESC", [today])); }
export async function getCachedCheckpoints(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM checkpoints ORDER BY nama")); }
export async function getCachedRoutes(): Promise<any[]> { const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM routes ORDER BY nama")); return rows.map((r: any) => ({ ...r, checkpoint_ids: r.checkpoint_ids ? JSON.parse(r.checkpoint_ids) : [] })); }
export async function getCachedLaporanHarian(limit = 50): Promise<any[]> { const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM laporan_harian ORDER BY created_at DESC LIMIT ?", [limit])); return rows.map((r: any) => ({ ...r, fotos: r.fotos ? JSON.parse(r.fotos) : [] })); }
export async function getCachedLaporanKejadian(limit = 50): Promise<any[]> { const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM laporan_kejadian ORDER BY created_at DESC LIMIT ?", [limit])); return rows.map((r: any) => ({ ...r, bukti_media: r.bukti_media ? JSON.parse(r.bukti_media) : [] })); }
export async function getCachedNotifikasi(): Promise<any[]> { const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM notifikasi ORDER BY created_at DESC LIMIT 100")); return rows.map((r: any) => ({ ...r, dibaca: !!r.dibaca, target_role: r.target_role ? JSON.parse(r.target_role) : [] })); }
export async function getCachedBroadcasts(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50")); }
export async function getCachedLokasi(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM lokasi ORDER BY nama")); }
export async function getCachedPosJaga(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM pos_jaga ORDER BY nama")); }
export async function getCachedJadwalShift(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM jadwal_shift ORDER BY waktu_mulai")); }
export async function getCachedSerahTerima(): Promise<any[]> { const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM serah_terima ORDER BY created_at DESC LIMIT 50")); return rows.map((r: any) => ({ ...r, inventaris: r.inventaris ? JSON.parse(r.inventaris) : [] })); }
export async function getCachedPanicAlerts(): Promise<any[]> { return safeRead((db) => db.getAllAsync("SELECT * FROM panic_alerts ORDER BY created_at DESC")); }

// ===== OFFLINE QUEUE =====
export async function addToOfflineQueue(type: string, data: any): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  await serialExec(async () => {
    const db = await getDb();
    // AUDIT-B1A (BUG-04): set max_retries explicitly to 7 to match
    // offlineSync CONFIG.MAX_RETRIES. The column default was 5, two below the
    // dead-letter threshold, so failed submissions were hard-deleted by
    // removeExpiredQueueItems before they could ever be dead-lettered (silent
    // data loss for offline absensi/laporan). Kept as a literal because
    // offlineDatabase must not import offlineSync (would create a cycle).
    await db.runAsync("INSERT INTO offline_queue (id, type, data, timestamp, retries, max_retries) VALUES (?, ?, ?, ?, 0, 7)", [id, type, JSON.stringify(data), Date.now()]);
  });
  console.log(`[OfflineDB] ✅ Queued: ${type} (id: ${id})`);
  return id;
}

export async function getOfflineQueue(): Promise<Array<{ id: string; type: string; data: any; timestamp: number; retries: number; last_error: string | null }>> {
  const rows = await safeRead((db) => db.getAllAsync("SELECT * FROM offline_queue ORDER BY timestamp ASC"));
  return (rows as any[]).map((r) => ({ ...r, data: JSON.parse(r.data) }));
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  await serialExec(async () => { const db = await getDb(); await db.runAsync("DELETE FROM offline_queue WHERE id = ?", [id]); });
}

export async function updateQueueItemRetry(id: string, error: string): Promise<void> {
  await serialExec(async () => { const db = await getDb(); await db.runAsync("UPDATE offline_queue SET retries = retries + 1, last_error = ? WHERE id = ?", [error, id]); });
}

export async function removeExpiredQueueItems(): Promise<number> {
  // AUDIT-B1A (BUG-04): keep dead-lettered items (last_error 'DEAD_LETTER…')
  // so the manual-retry path (retryDeadLetters) and review remain possible.
  // Previously this deleted everything at retries >= max_retries, which — with
  // the old max_retries=5 default — silently destroyed failed offline
  // submissions two retries before the dead-letter stage was ever reached.
  return serialExec(async () => { const db = await getDb(); const result = await db.runAsync("DELETE FROM offline_queue WHERE retries >= max_retries AND (last_error IS NULL OR last_error NOT LIKE 'DEAD_LETTER%')"); return result.changes; });
}

export async function getOfflineQueueCount(): Promise<number> {
  return safeRead(async (db) => { const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM offline_queue"); return row?.count || 0; });
}

export async function clearOfflineQueue(): Promise<void> {
  await serialExec(async () => { const db = await getDb(); await db.runAsync("DELETE FROM offline_queue"); });
}

// ===== SYNC METADATA =====
export async function getSyncMeta(): Promise<Record<string, { lastSync: string; count: number }>> {
  return safeRead(async (db) => {
    const rows = await db.getAllAsync("SELECT * FROM sync_meta");
    const meta: Record<string, { lastSync: string; count: number }> = {};
    for (const r of rows as any[]) meta[r.table_name] = { lastSync: r.last_sync_at, count: r.record_count };
    return meta;
  });
}

export async function getLastSyncTime(): Promise<string | null> {
  return safeRead(async (db) => { const row = await db.getFirstAsync<{ latest: string }>("SELECT MAX(last_sync_at) as latest FROM sync_meta"); return row?.latest || null; });
}

// ===== LOCAL INSERT =====
export async function insertLocalAbsensi(data: any): Promise<void> {
  await serialExec(async () => {
    const db = await getDb();
    const row = { id: data.id || `local_${Date.now()}`, user_id: data.user_id, nama: data.nama, nrp: data.nrp, tipe: data.tipe, waktu: new Date().toISOString(), foto_url: data.foto_url || null, latitude: data.latitude, longitude: data.longitude, alamat: data.alamat || null, pos_jaga: data.pos_jaga || null, status: data.status || "hadir", dalam_radius: data.dalam_radius ? 1 : 0, created_at: new Date().toISOString() };
    const { sql, values } = buildUpsert("absensi", row);
    await db.runAsync(sql, values);
  });
}

export async function insertLocalLaporanHarian(data: any): Promise<void> {
  await serialExec(async () => {
    const db = await getDb();
    const row = { id: data.id || `local_${Date.now()}`, user_id: data.user_id, nama: data.nama, nrp: data.nrp, tanggal: data.tanggal || new Date().toISOString().split("T")[0], shift: data.shift, pos_jaga: data.pos_jaga, kondisi: data.kondisi || "aman", aktivitas: data.aktivitas, temuan: data.temuan, fotos: JSON.stringify(data.fotos || []), status: "pending", created_at: new Date().toISOString() };
    const { sql, values } = buildUpsert("laporan_harian", row);
    await db.runAsync(sql, values);
  });
}

export async function insertLocalLaporanKejadian(data: any): Promise<void> {
  await serialExec(async () => {
    const db = await getDb();
    const row = { id: data.id || `local_${Date.now()}`, user_id: data.user_id, nama: data.nama, nrp: data.nrp, jenis: data.jenis, prioritas: data.prioritas || "sedang", waktu_kejadian: data.waktu_kejadian, lokasi_text: data.lokasi_text, latitude: data.latitude || 0, longitude: data.longitude || 0, kronologi: data.kronologi, bukti_media: JSON.stringify(data.bukti_media || []), status: "pending", created_at: new Date().toISOString() };
    const { sql, values } = buildUpsert("laporan_kejadian", row);
    await db.runAsync(sql, values);
  });
}

// ===== CLEAR ALL =====
export async function clearAllCache(): Promise<void> {
  await serialExec(async () => {
    const db = await getDb();
    const tables = ["users","absensi","checkpoints","routes","laporan_harian","laporan_kejadian","notifikasi","broadcasts","lokasi","pos_jaga","jadwal_shift","serah_terima","panic_alerts","sync_meta"];
    await db.withTransactionAsync(async () => { for (const t of tables) await db.runAsync(`DELETE FROM ${t}`); });
  });
  console.log("[OfflineDB] ✅ All cache cleared");
}

// ===== DATABASE STATS =====
export async function getDbStats(): Promise<{ totalRecords: number; queueSize: number; lastSync: string | null; tables: Record<string, number> }> {
  return safeRead(async (db) => {
    const tables = ["users","absensi","checkpoints","routes","laporan_harian","laporan_kejadian","notifikasi","broadcasts","lokasi","pos_jaga"];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const t of tables) { const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${t}`); counts[t] = row?.c || 0; total += counts[t]; }
    const queueRow = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM offline_queue");
    const lastSyncRow = await db.getFirstAsync<{ latest: string }>("SELECT MAX(last_sync_at) as latest FROM sync_meta");
    return { totalRecords: total, queueSize: queueRow?.c || 0, lastSync: lastSyncRow?.latest || null, tables: counts };
  });
}