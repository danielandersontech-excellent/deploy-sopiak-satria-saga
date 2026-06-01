/**
 * LOGGING UTILITY — Tahap 9 Bug #2 (P2-10) ASYNC REWRITE
 * =======================================================
 * Sebelumnya: setiap log call memanggil fs.appendFileSync() — operasi
 * sync yang memblokir event loop. Di production dengan banyak request
 * concurrent, ini menyebabkan latency spike.
 *
 * Sekarang: setiap file log punya WriteStream yang dibuka sekali, lalu
 * tulis ke stream itu via stream.write() yang non-blocking. Node.js
 * mem-buffer otomatis dengan highWaterMark.
 *
 * Log files:
 *   logs/app.log       - General application logs
 *   logs/error.log     - Errors only
 *   logs/access.log    - HTTP access logs (Morgan)
 *
 * Rotation: file di-rotate saat byte counter > MAX_SIZE. Counter
 * di-track di memory karena fs.statSync() di hot path = sync (yang
 * persis kita hindari). Saat rotate: stream lama di-close, file
 * di-rename (sync — hanya sekali per rotasi, jarang terjadi), lalu
 * stream baru dibuka.
 *
 * Behaviour saat error stream:
 * - 'error' listener di-attach supaya gagal tulis tidak meng-kill app
 * - Fallback: tulis ke process.stderr supaya operator masih bisa
 *   melihat di docker logs walaupun file system bermasalah.
 *
 * Graceful shutdown: SIGTERM/SIGINT/exit → flush + close semua stream.
 *
 * Backward compatibility: exported API tetap sama (logger.info/warn/
 * error/access + morganStream). Caller tidak perlu diubah.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_SIZE_MB = parseInt(process.env.LOG_MAX_SIZE || '10');
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const MAX_FILES = parseInt(process.env.LOG_MAX_FILES || '30');

// Pastikan direktori log ada SEKALI di startup, lalu jangan dicek lagi
// di hot path (cek per-write = syscall sync, persis yang kita hindari).
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Cache stream + byte counter per file.
 *   streams[filename] = { stream: WriteStream, bytes: number, path: string }
 */
const streams = {};

/**
 * Initial byte count untuk file yang sudah ada (saat boot).
 * Sync sekali per file, tapi hanya di startup — bukan di hot path.
 */
function initialSize(filepath) {
  try {
    return fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
  } catch {
    return 0;
  }
}

/**
 * Buka WriteStream untuk file log. Append mode, dengan error handler
 * yang fallback ke stderr (bukan crash).
 */
function openStream(filepath) {
  const stream = fs.createWriteStream(filepath, {
    flags: 'a',
    encoding: 'utf8',
    highWaterMark: 16 * 1024, // 16KB buffer, default-Node-ish
  });
  stream.on('error', (err) => {
    // Fallback ke stderr supaya tetap visible di docker logs / journalctl
    try {
      process.stderr.write(`[Logger] Stream error for ${filepath}: ${err.message}\n`);
    } catch { /* even stderr failed — give up silently */ }
  });
  return stream;
}

/**
 * Ambil (atau buat) entry stream untuk filename tertentu.
 */
function getStream(filename) {
  if (streams[filename] && streams[filename].stream && !streams[filename].stream.destroyed) {
    return streams[filename];
  }
  const filepath = path.join(LOG_DIR, filename);
  streams[filename] = {
    stream: openStream(filepath),
    bytes: initialSize(filepath),
    path: filepath,
  };
  return streams[filename];
}

/**
 * Rotate file kalau sudah > MAX_SIZE.
 *
 * Penting: ini sync di bagian rename(), tapi:
 *   1. Hanya jalan kalau threshold tercapai (jarang),
 *   2. Tidak ada I/O lain saat rename (atomic op di POSIX),
 *   3. Stream lama di-close dulu sehingga tidak ada race.
 *
 * Alternatifnya — async rename — bikin window di mana write baru
 * bisa nyangkut ke file yang seharusnya sudah di-rotate. Sync di sini
 * adalah trade-off yang benar.
 */
function rotateIfNeeded(entry, filename) {
  if (entry.bytes < MAX_SIZE) return;
  const filepath = entry.path;
  try {
    // Close stream lama dulu — kalau tidak, write yang masih di buffer
    // bisa hilang setelah rename.
    entry.stream.end();

    // Shift file rotasi: file.log.5 → file.log.6, etc., dan buang file
    // paling lama jika sudah > MAX_FILES.
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const older = `${filepath}.${i}`;
      const newer = `${filepath}.${i + 1}`;
      if (fs.existsSync(older)) {
        if (i + 1 > MAX_FILES) {
          try { fs.unlinkSync(older); } catch { /* ignore */ }
        } else {
          fs.renameSync(older, newer);
        }
      }
    }
    // Rotate yang current jadi .1
    if (fs.existsSync(filepath)) fs.renameSync(filepath, `${filepath}.1`);
  } catch (err) {
    try {
      process.stderr.write(`[Logger] Rotation failed for ${filepath}: ${err.message}\n`);
    } catch { /* give up */ }
  }
  // Buka stream baru — counter reset ke 0.
  streams[filename] = {
    stream: openStream(filepath),
    bytes: 0,
    path: filepath,
  };
}

/**
 * Tulis baris log ke file (NON-BLOCKING).
 */
function appendLog(filename, level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? ' ' + safeJsonStringify(meta) : '';
  const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

  let entry = getStream(filename);
  // Cek dulu — apa perlu rotate sebelum write?
  if (entry.bytes >= MAX_SIZE) {
    rotateIfNeeded(entry, filename);
    entry = getStream(filename);
  }

  entry.bytes += Buffer.byteLength(line, 'utf8');
  // stream.write() kembalikan false kalau buffer penuh, tapi Node akan
  // tetap queue dan flush — kita tidak perlu drain di sini karena log
  // volume normal tidak akan saturate stream.
  entry.stream.write(line);
}

/**
 * JSON.stringify yang aman terhadap circular reference.
 */
function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
    } catch {
      return '"[Unserializable meta]"';
    }
  }
}

/**
 * Tutup semua stream — dipanggil saat shutdown.
 */
function closeAll() {
  for (const filename of Object.keys(streams)) {
    try {
      streams[filename].stream.end();
    } catch { /* ignore */ }
  }
}

// Graceful shutdown: flush + close stream supaya tidak ada log yang
// tertinggal di buffer.
process.on('exit', closeAll);
process.on('SIGTERM', closeAll);
process.on('SIGINT', closeAll);

const logger = {
  info: (msg, meta) => {
    appendLog('app.log', 'INFO', msg, meta);
    if (process.env.NODE_ENV !== 'production') console.log(`[INFO] ${msg}`);
  },
  warn: (msg, meta) => {
    appendLog('app.log', 'WARN', msg, meta);
    appendLog('error.log', 'WARN', msg, meta);
    console.warn(`[WARN] ${msg}`);
  },
  error: (msg, meta) => {
    appendLog('app.log', 'ERROR', msg, meta);
    appendLog('error.log', 'ERROR', msg, meta);
    console.error(`[ERROR] ${msg}`);
  },
  access: (msg) => {
    appendLog('access.log', 'ACCESS', msg);
  },
};

/**
 * Morgan stream — Morgan akan call .write() untuk setiap request HTTP.
 * Karena writeStream kita non-blocking, ini tidak block event loop.
 */
const morganStream = {
  write: (message) => {
    const clean = message.trim();
    logger.access(clean);
  },
};

module.exports = { logger, morganStream };