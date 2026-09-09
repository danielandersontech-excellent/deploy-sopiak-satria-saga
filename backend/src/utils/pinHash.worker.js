/**
 * PIN HASH WORKER — dijalankan di worker thread oleh utils/pinHash.js.
 *
 * bcryptjs murni JavaScript: satu compare cost 12 memakan ±300 ms CPU dan,
 * bila dijalankan di thread utama, memblokir event loop sehingga SEMUA
 * request lain (absensi, health, socket) ikut menunggu. Worker ini
 * memindahkan kerja CPU tersebut ke thread terpisah.
 *
 * Protokol pesan: { id, op: 'compare' | 'hash', args: [...] }
 *   compare → args [pin, hash]      → result boolean
 *   hash    → args [pin, rounds]    → result string
 * Balasan: { id, ok: true, result } atau { id, ok: false, error }.
 */
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

if (!parentPort) {
  throw new Error('pinHash.worker.js harus dijalankan sebagai worker thread');
}

parentPort.on('message', (msg) => {
  const { id, op, args } = msg || {};
  try {
    let result;
    if (op === 'compare') {
      const [pin, hash] = args;
      result = typeof hash === 'string' && hash.length > 0
        ? bcrypt.compareSync(String(pin), hash)
        : false;
    } else if (op === 'hash') {
      const [pin, rounds] = args;
      result = bcrypt.hashSync(String(pin), Number(rounds) || 12);
    } else {
      throw new Error(`Operasi tidak dikenal: ${op}`);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
});
