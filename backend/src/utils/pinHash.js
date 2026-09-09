/**
 * PIN HASH POOL — bcrypt di worker thread (Misi V3 / B1: login lambat).
 *
 * Temuan terukur di produksi (4 vCPU, Node 20, bcryptjs cost 12):
 *   - satu bcrypt.compare  ≈ 300 ms CPU di thread utama
 *   - 5 login paralel      ≈ 1.590 ms (terserialisasi: event loop terblokir)
 *   - login NRP tak ada    ≈ 5 ms  → bcrypt adalah ±98% waktu login aplikasi
 * Saat ganti shift banyak anggota login bersamaan → login ke-N menunggu
 * (N-1) × 300 ms, dan request lain (absensi, health, socket) ikut tersendat.
 *
 * Solusi tanpa dependensi baru: pool kecil worker_threads (bawaan Node) yang
 * menjalankan bcryptjs. Thread utama tetap bebas; compare berjalan paralel
 * sebanyak jumlah worker.
 *
 * Konfigurasi env:
 *   PIN_HASH_WORKERS  jumlah worker (default: min(4, CPU-1), minimal 1).
 *                     0 → nonaktif, bcrypt berjalan di thread utama (perilaku lama).
 *   BCRYPT_ROUNDS     cost factor untuk hashPin (default 12, sama seperti sebelumnya).
 *
 * Fail-safe: bila worker gagal dibuat / crash / timeout, tugas dijalankan
 * ulang di thread utama (bcryptjs async) — login tidak pernah gagal hanya
 * karena pool bermasalah. Setelah terlalu banyak kegagalan, pool dimatikan
 * sendiri dan peringatan ditulis ke log.
 */
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Worker } = require('worker_threads');
const { logger } = require('./logger');

const DEFAULT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10) || 12;
const TASK_TIMEOUT_MS = 15000;
const MAX_FAILURES = 5;
const WORKER_FILE = path.join(__dirname, 'pinHash.worker.js');

function resolvePoolSize() {
  const raw = process.env.PIN_HASH_WORKERS;
  if (raw !== undefined && raw !== '') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 16) : 1;
  }
  const cpu = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : ((os.cpus() || []).length || 1);
  return Math.max(1, Math.min(4, cpu - 1));
}

const POOL_SIZE = resolvePoolSize();

/** @type {Array<{worker: import('worker_threads').Worker, busy: boolean, task: any}>} */
const slots = [];
const queue = [];
let seq = 0;
let failures = 0;
let disabled = POOL_SIZE === 0;
let announced = false;

function disablePool(reason) {
  if (disabled) return;
  disabled = true;
  logger.warn(`[PinHash] Pool worker dinonaktifkan (${reason}); bcrypt kembali ke thread utama`);
  for (const slot of slots) {
    try { slot.worker.terminate(); } catch { /* abaikan */ }
  }
  slots.length = 0;
  // Tugas yang masih mengantre diselesaikan di thread utama.
  while (queue.length) {
    const task = queue.shift();
    runInline(task.op, task.args).then(task.resolve, task.reject);
  }
}

function runInline(op, args) {
  if (op === 'compare') {
    const [pin, hash] = args;
    if (typeof hash !== 'string' || !hash) return Promise.resolve(false);
    return bcrypt.compare(String(pin), hash);
  }
  if (op === 'hash') {
    const [pin, rounds] = args;
    return bcrypt.hash(String(pin), Number(rounds) || DEFAULT_ROUNDS);
  }
  return Promise.reject(new Error(`Operasi tidak dikenal: ${op}`));
}

function finishTask(slot, err, result) {
  const task = slot.task;
  slot.task = null;
  slot.busy = false;
  if (!task) return;
  clearTimeout(task.timer);
  if (err) task.reject(err);
  else task.resolve(result);
}

function spawn() {
  let worker;
  try {
    worker = new Worker(WORKER_FILE);
  } catch (e) {
    failures++;
    logger.warn(`[PinHash] Gagal membuat worker: ${e.message}`);
    if (failures >= MAX_FAILURES) disablePool('gagal membuat worker berulang');
    return null;
  }
  const slot = { worker, busy: false, task: null };

  worker.on('message', (msg) => {
    if (!slot.task || !msg || msg.id !== slot.task.id) return;
    if (msg.ok) finishTask(slot, null, msg.result);
    else finishTask(slot, new Error(msg.error || 'worker error'));
    dispatch();
  });

  worker.on('error', (err) => {
    // Kegagalan dihitung sekali di replace() lewat event 'exit' yang menyusul.
    logger.warn(`[PinHash] Worker error: ${err.message}`);
    finishTask(slot, err);
  });

  worker.on('exit', (code) => {
    if (slot.task) {
      finishTask(slot, new Error(`worker keluar (kode ${code})`));
    }
    replace(slot, code);
  });

  // Jangan biarkan worker menahan proses saat shutdown.
  worker.unref();
  slots.push(slot);
  return slot;
}

function replace(slot, exitCode) {
  const idx = slots.indexOf(slot);
  if (idx >= 0) slots.splice(idx, 1);
  if (disabled) return;
  if (exitCode !== undefined && exitCode !== 0) failures++;
  if (failures >= MAX_FAILURES) {
    disablePool('worker crash berulang');
    return;
  }
  spawn();
  dispatch();
}

function dispatch() {
  if (disabled) return;
  while (queue.length) {
    const slot = slots.find((s) => !s.busy);
    if (!slot) return;
    const task = queue.shift();
    slot.busy = true;
    slot.task = task;
    task.timer = setTimeout(() => {
      if (slot.task !== task) return;
      logger.warn(`[PinHash] Worker timeout ${TASK_TIMEOUT_MS} ms pada operasi ${task.op}; worker diganti`);
      finishTask(slot, new Error('worker timeout'));
      try { slot.worker.terminate(); } catch { /* exit handler akan mengganti */ }
    }, TASK_TIMEOUT_MS);
    try {
      slot.worker.postMessage({ id: task.id, op: task.op, args: task.args });
    } catch (e) {
      finishTask(slot, e);
    }
  }
}

function runInWorker(op, args) {
  return new Promise((resolve, reject) => {
    queue.push({ id: ++seq, op, args, resolve, reject, timer: null });
    dispatch();
  });
}

function ensurePool() {
  if (disabled) return;
  while (slots.length < POOL_SIZE) {
    if (!spawn()) break;
  }
  if (!announced) {
    announced = true;
    if (!disabled) logger.info(`[PinHash] Pool bcrypt aktif: ${slots.length} worker thread`);
  }
}

async function run(op, args) {
  if (disabled) return runInline(op, args);
  ensurePool();
  if (disabled || slots.length === 0) return runInline(op, args);
  try {
    return await runInWorker(op, args);
  } catch (e) {
    // Fail-safe: jalankan di thread utama agar login/ubah PIN tidak gagal.
    logger.warn(`[PinHash] Fallback ke thread utama untuk ${op}: ${e.message}`);
    return runInline(op, args);
  }
}

/** Bandingkan PIN plaintext dengan hash bcrypt. Selalu boolean, tidak melempar. */
async function comparePin(pin, hash) {
  if (pin === undefined || pin === null || typeof hash !== 'string' || !hash) return false;
  try {
    return !!(await run('compare', [String(pin), hash]));
  } catch {
    return false;
  }
}

/** Hash PIN plaintext dengan cost BCRYPT_ROUNDS (default 12). */
function hashPin(pin, rounds = DEFAULT_ROUNDS) {
  return run('hash', [String(pin), Number(rounds) || DEFAULT_ROUNDS]);
}

/** Statistik untuk /api/health & diagnosis. */
function getPoolStats() {
  return {
    enabled: !disabled,
    size: slots.length,
    busy: slots.filter((s) => s.busy).length,
    queued: queue.length,
    failures,
  };
}

// Pemanasan saat modul dimuat agar login pertama tidak menanggung biaya spawn.
if (!disabled) {
  try { ensurePool(); } catch (e) { logger.warn(`[PinHash] Pemanasan pool gagal: ${e.message}`); }
}

module.exports = { comparePin, hashPin, getPoolStats, DEFAULT_ROUNDS };
