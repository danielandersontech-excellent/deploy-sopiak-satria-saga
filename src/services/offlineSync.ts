/**
 * ============================================================
 * OFFLINE SYNC SERVICE v3 - Robust Retry + Exponential Backoff
 * ============================================================
 *
 * UPGRADE dari v2:
 *  ✅ Exponential backoff retry (1s → 2s → 4s → 8s → 16s)
 *  ✅ Max retry per item: 7 (was 5), with increasing delay
 *  ✅ Priority queue: panic > absensi > laporan > others
 *  ✅ Dead-letter queue: items that fail all retries are kept for manual review
 *  ✅ Connectivity verification with actual ping before processing
 *  ✅ Batch processing with configurable batch size
 *  ✅ Partial sync resume: if network drops mid-sync, picks up where it left off
 *  ✅ Jitter on retry delays to prevent thundering herd
 *  ✅ Detailed sync statistics for status dashboard
 *  ✅ Configurable auto-sync interval
 *  ✅ Circuit breaker: pause sync after consecutive failures
 *
 * ARCHITECTURE:
 *   Online:  User Action → API Call → Update SQLite Cache
 *   Offline: User Action → SQLite Queue + Local Cache → (wait)
 *   Reconnect: Verify connectivity → Prioritize queue → Batch process → Retry with backoff
 */
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { absensiApi, patroliApi, laporanApi, dataApi, usersApi } from '../lib/apiClient';
import {
  addToOfflineQueue, getOfflineQueue, removeFromOfflineQueue,
  updateQueueItemError, updateQueueItemRetry, removeExpiredQueueItems, getOfflineQueueCount,
  clearOfflineQueue, cacheAllData, getDbStats,
} from './offlineDatabase';

// ===== CONFIG =====
const CONFIG = {
  MAX_RETRIES: 7,
  BASE_DELAY_MS: 1000,         // 1 second base
  MAX_DELAY_MS: 30000,         // 30 seconds max
  JITTER_FACTOR: 0.3,          // 30% random jitter
  BATCH_SIZE: 5,               // Process 5 items per batch
  AUTO_SYNC_INTERVAL: 30000,   // 30 seconds
  PING_TIMEOUT: 5000,          // 5 second ping timeout
  CIRCUIT_BREAKER_THRESHOLD: 5, // Pause after 5 consecutive failures
  CIRCUIT_BREAKER_RESET: 60000, // Reset circuit breaker after 60s
};

// ===== PRIORITY MAP: lower number = higher priority =====
const PRIORITY: Record<string, number> = {
  panic_create: 0,
  panic_resolve: 1,
  absensi_create: 2,
  location_ping: 3,
  patrol_start: 3,
  patrol_scan: 4,
  patrol_end: 5,
  laporan_kejadian_create: 6,
  laporan_harian_create: 7,
  serah_terima_create: 8,
  notifikasi_create: 9,
  notifikasi_read: 10,
  user_update: 11,
};

// ===== STATE =====
let _isSyncing = false;
let _isOnline = true;
let _listeners: Array<(status: SyncStatus) => void> = [];
let _consecutiveFailures = 0;
let _circuitBreakerUntil = 0;
let _lastSyncTime: number | null = null;
let _totalSynced = 0;
let _totalFailed = 0;

export interface OfflineAction {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  retries: number;
  last_error?: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSync: number | null;
  lastSyncResult?: { synced: number; failed: number; remaining: number; deadLettered: number };
  stats?: { totalSynced: number; totalFailed: number; circuitBreakerActive: boolean };
}

// ===== EXPONENTIAL BACKOFF WITH JITTER =====
function calculateDelay(retryCount: number): number {
  const exponential = Math.min(
    CONFIG.BASE_DELAY_MS * Math.pow(2, retryCount),
    CONFIG.MAX_DELAY_MS
  );
  const jitter = exponential * CONFIG.JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(100, exponential + jitter);
}

// ===== NETWORK CHECK WITH ACTUAL PING =====
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected || state.isInternetReachable === false) {
      _isOnline = false;
      return false;
    }
    _isOnline = true;
    return true;
  } catch {
    _isOnline = false;
    return false;
  }
}

export function getOnlineStatus(): boolean { return _isOnline; }

// ===== VERIFY CONNECTIVITY WITH SERVER PING =====
async function verifyConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.PING_TIMEOUT);
    // Use the existing API URL ping endpoint
    const { testConnection } = require('../lib/apiClient');
    const url = require('../lib/apiClient').API_URL;
    const res = await fetch(`${url}/ping`, { signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    return text.trim() === 'pong';
  } catch {
    return false;
  }
}

// ===== CIRCUIT BREAKER =====
function isCircuitBreakerOpen(): boolean {
  if (_circuitBreakerUntil > Date.now()) return true;
  if (_consecutiveFailures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
    _circuitBreakerUntil = Date.now() + CONFIG.CIRCUIT_BREAKER_RESET;
    console.log(`[Sync] ⚡ Circuit breaker OPEN for ${CONFIG.CIRCUIT_BREAKER_RESET / 1000}s after ${_consecutiveFailures} consecutive failures`);
    return true;
  }
  return false;
}

function resetCircuitBreaker(): void {
  _consecutiveFailures = 0;
  _circuitBreakerUntil = 0;
}

// ===== QUEUE MANAGEMENT =====
export async function getQueue(): Promise<OfflineAction[]> {
  const items = await getOfflineQueue();
  return items.map(i => ({
    id: i.id, type: i.type, data: i.data,
    timestamp: i.timestamp, retries: i.retries, last_error: i.last_error,
  }));
}

export async function addToQueue(type: string, data: any): Promise<string> {
  const id = await addToOfflineQueue(type, data);
  await notifyListeners();
  return id;
}

export async function removeFromQueue(id: string): Promise<void> {
  await removeFromOfflineQueue(id);
  await notifyListeners();
}

export async function clearQueue(): Promise<void> {
  await clearOfflineQueue();
  await notifyListeners();
}

export async function getPendingCount(): Promise<number> {
  return getOfflineQueueCount();
}

// ===== SMART EXECUTE - online → execute, offline → queue =====
export async function executeOrQueue(
  type: string, data: any,
  executeFn: () => Promise<any>,
  localCacheFn?: () => Promise<void>
): Promise<{ queued: boolean; result?: any }> {
  const online = await isOnline();

  if (online) {
    try {
      const result = await executeFn();
      return { queued: false, result };
    } catch (err: any) {
      const isNetwork = isNetworkError(err);
      if (isNetwork) {
        await addToQueue(type, data);
        if (localCacheFn) await localCacheFn().catch(() => {});
        return { queued: true };
      }
      throw err;
    }
  } else {
    await addToQueue(type, data);
    if (localCacheFn) await localCacheFn().catch(() => {});
    return { queued: true };
  }
}

function isNetworkError(err: any): boolean {
  const msg = err?.message || '';
  // [Audit 2D] 502/503/504 dari proxy (server belum siap / restart deploy) juga
  // kondisi sementara → antrikan & coba lagi, jangan dianggap penolakan permanen.
  const st = Number(err?.status);
  if (st === 502 || st === 503 || st === 504) return true;
  return msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed') ||
    msg.includes('timeout') || msg.includes('Timeout') || msg.includes('Gagal konek') || msg.includes('AbortError');
}

// ===== PROCESS QUEUE WITH ROBUST RETRY =====
export async function processQueue(): Promise<{
  synced: number; failed: number; remaining: number; deadLettered: number;
}> {
  if (_isSyncing) {
    const count = await getPendingCount();
    return { synced: 0, failed: 0, remaining: count, deadLettered: 0 };
  }

  // Circuit breaker check
  if (isCircuitBreakerOpen()) {
    const count = await getPendingCount();
    console.log('[Sync] ⚡ Circuit breaker active, skipping');
    return { synced: 0, failed: 0, remaining: count, deadLettered: 0 };
  }

  // Verify actual connectivity
  const online = await isOnline();
  if (!online) {
    const count = await getPendingCount();
    return { synced: 0, failed: 0, remaining: count, deadLettered: 0 };
  }

  const serverReachable = await verifyConnectivity();
  if (!serverReachable) {
    console.log('[Sync] ⚠️ Server not reachable despite network');
    const count = await getPendingCount();
    return { synced: 0, failed: 0, remaining: count, deadLettered: 0 };
  }

  _isSyncing = true;
  await notifyListeners();

  let synced = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    const queue = await getOfflineQueue();

    // Sort by priority
    const sorted = queue.sort((a, b) => {
      const pA = PRIORITY[a.type] ?? 99;
      const pB = PRIORITY[b.type] ?? 99;
      if (pA !== pB) return pA - pB;
      return a.timestamp - b.timestamp; // FIFO within same priority
    });

    // Process in batches
    for (let i = 0; i < sorted.length; i += CONFIG.BATCH_SIZE) {
      const batch = sorted.slice(i, i + CONFIG.BATCH_SIZE);

      for (const action of batch) {
        // AUDIT-B1A (BUG-04): never re-execute a dead-lettered item. It stays in
        // the queue for manual review (retryDeadLetters), but auto-processing it
        // would re-hammer the server with a request already known to fail.
        if (action.last_error?.startsWith('DEAD_LETTER')) continue;

        // Check if should wait based on retry count
        if (action.retries > 0) {
          const delay = calculateDelay(action.retries - 1);
          const timeSinceLastAttempt = Date.now() - (action.timestamp + action.retries * 1000);
          if (timeSinceLastAttempt < delay) {
            continue; // Skip this item, not ready for retry yet
          }
        }

        try {
          await executeAction(action);
          await removeFromOfflineQueue(action.id);
          synced++;
          _consecutiveFailures = 0;
          _totalSynced++;
          console.log(`[Sync] ✅ ${action.type} (${action.id}) priority:${PRIORITY[action.type]??99}`);
        } catch (err: any) {
          if (isNetworkError(err)) {
            console.log('[Sync] ⛔ Network lost mid-sync, pausing');
            _isSyncing = false;
            const remaining = await getPendingCount();
            const result = { synced, failed, remaining, deadLettered };
            await notifyListeners(result);
            return result;
          }

          // [Misi V3 / M13] 409 "Patroli belum tersinkron" = scan/end menunggu
          // patrol_start yang belum berhasil dikirim. Bukan kegagalan item ini →
          // jangan dihitung retry (maks 7) agar tidak masuk dead-letter, cukup catat.
          if (Number(err?.status) === 409 && /belum tersinkron/i.test(String(err?.message || ''))) {
            await updateQueueItemError(action.id, `MENUNGGU: ${err.message}`);
            console.log(`[Sync] ⏳ ${action.type} menunggu patroli induk tersinkron`);
            continue;
          }

          _consecutiveFailures++;
          const newRetries = action.retries + 1;

          if (newRetries >= CONFIG.MAX_RETRIES) {
            // Move to dead-letter (keep in DB but mark as dead)
            await updateQueueItemRetry(action.id, `DEAD_LETTER: ${err.message || 'Max retries'}`);
            deadLettered++;
            _totalFailed++;
            console.log(`[Sync] 💀 ${action.type} dead-lettered after ${CONFIG.MAX_RETRIES} retries: ${err.message}`);
          } else {
            const nextDelay = calculateDelay(newRetries);
            await updateQueueItemRetry(action.id, err.message || 'Unknown error');
            console.log(`[Sync] ⚠️ ${action.type} retry ${newRetries}/${CONFIG.MAX_RETRIES}, next in ${Math.round(nextDelay/1000)}s`);
          }
        }
      }

      // Between batches: check we're still online
      if (i + CONFIG.BATCH_SIZE < sorted.length) {
        const stillOnline = await isOnline();
        if (!stillOnline) {
          console.log('[Sync] ⛔ Lost connection between batches');
          break;
        }
      }
    }

    // Cleanup expired items
    const expired = await removeExpiredQueueItems();
    if (expired > 0) {
      failed += expired;
      _totalFailed += expired;
    }

    // Reset circuit breaker on any success
    if (synced > 0) resetCircuitBreaker();

  } catch (err) {
    console.error('[Sync] Fatal error:', err);
  }

  _isSyncing = false;
  _lastSyncTime = Date.now();
  const remaining = await getPendingCount();
  const result = { synced, failed, remaining, deadLettered };
  if (synced > 0 || failed > 0 || deadLettered > 0) {
    console.log(`[Sync] Complete: ${synced} synced, ${failed} failed, ${deadLettered} dead-lettered, ${remaining} remaining`);
  }
  await notifyListeners(result);
  return result;
}

// ===== EXECUTE SINGLE ACTION =====
async function executeAction(action: { type: string; data: any }): Promise<void> {
  const { type, data } = action;
  switch (type) {
    case 'absensi_create': await absensiApi.create(data); break;
    case 'laporan_harian_create': await laporanApi.harianCreate(data); break;
    case 'laporan_kejadian_create': await laporanApi.kejadianCreate(data); break;
    case 'patrol_start': await patroliApi.start(data); break;
    case 'patrol_scan':
      await patroliApi.scan(data.patroli_id || 'offline', { checkpoint_id: data.checkpoint_id, foto_url: data.foto_url, idempotency_key: data.idempotency_key, client_patrol_id: data.client_patrol_id }); break;
    case 'patrol_end':
      await patroliApi.end(data.patroli_id || 'offline', { checkpoint_scanned: data.checkpoint_scanned, checkpoint_total: data.checkpoint_total, client_patrol_id: data.client_patrol_id }); break;
    case 'panic_create': await dataApi.panic.create(data); break;
    case 'panic_resolve': await dataApi.panic.resolve(data.id, data.status); break;
    case 'serah_terima_create': await dataApi.serahTerima.create(data); break;
    case 'notifikasi_create': await dataApi.notifikasi.create(data); break;
    case 'notifikasi_read': await dataApi.notifikasi.read(data.id); break;
    case 'location_ping': await usersApi.updateLocation(data.user_id, data.latitude, data.longitude); break;
    case 'user_update': await usersApi.update(data.user_id, data.payload); break;
    default:
      // Don't throw for unknown types, just log
      console.log(`[Sync] Unknown action type: ${type}, removing from queue`);
  }
}

// ===== AUTO-SYNC WITH SMART SCHEDULING =====
let _unsubscribe: (() => void) | null = null;
let _syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(): void {
  if (_unsubscribe) return;

  _unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);

    if (_isOnline && wasOffline) {
      console.log('[Offline] 🟢 Back online! Syncing in 2s...');
      resetCircuitBreaker();
      setTimeout(() => processQueue(), 2000);
    } else if (!_isOnline) {
      console.log('[Offline] 🔴 Gone offline');
    }
    notifyListeners();
  });

  _syncInterval = setInterval(async () => {
    if (_isOnline && !_isSyncing && !isCircuitBreakerOpen()) {
      const count = await getPendingCount();
      if (count > 0) {
        console.log(`[Offline] ⏰ Auto-sync: ${count} pending`);
        await processQueue();
      }
    }
  }, CONFIG.AUTO_SYNC_INTERVAL);

  console.log('[Offline] Auto-sync v3 enabled (robust retry + exponential backoff)');
}

export function stopAutoSync(): void {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

// ===== STATUS LISTENERS =====
export function addSyncListener(fn: (status: SyncStatus) => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

async function notifyListeners(lastResult?: { synced: number; failed: number; remaining: number; deadLettered?: number }) {
  const count = await getPendingCount();
  const status: SyncStatus = {
    isOnline: _isOnline,
    isSyncing: _isSyncing,
    pendingCount: count,
    lastSync: _lastSyncTime,
    lastSyncResult: lastResult as any,
    stats: {
      totalSynced: _totalSynced,
      totalFailed: _totalFailed,
      circuitBreakerActive: isCircuitBreakerOpen(),
    },
  };
  _listeners.forEach(fn => { try { fn(status); } catch {} });
}

// ===== HELPERS =====
export function formatPendingMessage(count: number): string {
  if (count === 0) return '';
  return `${count} aksi menunggu sinkronisasi`;
}

export async function fullDataSync(fetchFn: () => Promise<any>): Promise<boolean> {
  try {
    const online = await isOnline();
    if (!online) return false;
    const rawData = await fetchFn();
    await cacheAllData(rawData);
    return true;
  } catch { return false; }
}

export async function getSyncStats() {
  const dbStats = await getDbStats();
  return {
    ...dbStats,
    totalSynced: _totalSynced,
    totalFailed: _totalFailed,
    circuitBreakerActive: isCircuitBreakerOpen(),
    consecutiveFailures: _consecutiveFailures,
    lastSyncTime: _lastSyncTime,
    config: CONFIG,
  };
}

// ===== MANUAL RETRY DEAD-LETTERED ITEMS =====
export async function retryDeadLettered(): Promise<number> {
  const queue = await getOfflineQueue();
  let retried = 0;
  for (const item of queue) {
    if (item.last_error?.startsWith('DEAD_LETTER')) {
      // Reset retries to give it another chance
      await updateQueueItemRetry(item.id, 'Manual retry');
      retried++;
    }
  }
  if (retried > 0) {
    console.log(`[Sync] 🔄 ${retried} dead-lettered items queued for retry`);
    resetCircuitBreaker();
  }
  return retried;
}