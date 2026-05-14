/**
 * WATERMARK SERVICE
 *
 * Burns a small info card (user, time, GPS, custom tag) into the bottom-
 * left corner of a JPEG before it's stored on disk. Used by the absensi,
 * patroli, laporan and generic upload flows so every piece of photographic
 * evidence carries its own verification metadata.
 *
 * Tahap-6 hardening (P1-17):
 *
 *   The previous implementation silently returned the ORIGINAL,
 *   un-watermarked path on every failure path (sharp not installed,
 *   I/O error, malformed input, ...). That meant a photo could be saved
 *   as "verified" with NO watermark whenever something went wrong — and
 *   nothing in the rest of the system would know. Evidence chain broken,
 *   no alert.
 *
 *   The new contract:
 *     - sharp not installed → log ONE warning at module load, then on
 *       every call throw a clear error (in strict mode) or fall back
 *       silently (in lenient mode).
 *     - applyWatermark() failures → throw in strict mode, return the
 *       original path in lenient mode.
 *     - WATERMARK_REQUIRED env var picks the mode:
 *         "true"  → strict  (default in production)
 *         "false" → lenient (default in dev — current behaviour)
 *
 *   All callers (absensi.controller, patroli.controller, laporan.controller,
 *   data.routes) already wrap applyWatermark() in their own try/catch,
 *   so the thrown error is visible in their logs without crashing the
 *   request. Strict mode therefore upgrades the audit trail without
 *   adding new failure surface for end users.
 *
 *   Logging:
 *     - Switched from console.log/error to logger.info/warn/error so
 *       failures end up in logs/error.log (rotated, persistent) rather
 *       than only on stdout (lost on container redeploy).
 */
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

// Optional native dep: sharp is the only thing we need from native land.
// If it failed to install (musl mismatch, low-memory build host, ...)
// we surface ONE warning at module load — quieter than logging on every
// call — and let isStrictMode() decide what to do at call time.
let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  logger.warn(
    '[Watermark] `sharp` module is not installed — watermarking is unavailable. ' +
    'Set WATERMARK_REQUIRED=false to allow uploads without watermarks (NOT recommended in production).',
    { error: err.message }
  );
}

/**
 * Decide whether a watermark failure should throw or be swallowed.
 *
 * Defaults:
 *   - production → strict (throw on failure)
 *   - everything else → lenient (return original path, log the error)
 *
 * Operators can override either way:
 *   WATERMARK_REQUIRED=true   → force strict
 *   WATERMARK_REQUIRED=false  → force lenient
 */
function isStrictMode() {
  const raw = (process.env.WATERMARK_REQUIRED || '').toLowerCase().trim();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * Centralised failure handler. In strict mode it throws; in lenient
 * mode it returns the original (un-watermarked) path so the caller can
 * continue. Either way, the failure is logged.
 */
function handleFailure(context, err, inputPath) {
  const message = err && err.message ? err.message : String(err);
  if (isStrictMode()) {
    logger.error(`[Watermark] FAILED (strict) — ${context}`, { error: message, inputPath });
    // Re-throw with a stable, descriptive prefix so callers logging the
    // error get something useful in their `console.log('WM skip:', e.message)`.
    throw new Error(`Watermark failed: ${context}: ${message}`);
  }
  logger.warn(`[Watermark] failed (lenient) — ${context}, returning original`, { error: message, inputPath });
  return inputPath;
}

/**
 * Build the human-readable lines that get rasterised onto the photo.
 *
 * Inputs are loose-shaped on purpose: every caller has slightly different
 * info available (no GPS for a desk-side report, no nrp for a klien
 * upload, etc.), and missing fields are silently dropped.
 */
function buildWatermarkLines(info) {
  const lines = [];
  const now = new Date();
  // Force the timestamp to WIB (UTC+7) regardless of server TZ.
  const wib = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  if (info.customText) {
    lines.push('[' + info.customText + ']');
  }
  if (info.nama && info.nrp) {
    lines.push(info.nama + ' (' + info.nrp + ')');
  } else if (info.nama) {
    lines.push(info.nama);
  }

  const dd = String(wib.getDate()).padStart(2, '0');
  const mm = months[wib.getMonth()];
  const yyyy = wib.getFullYear();
  const hh = String(wib.getHours()).padStart(2, '0');
  const mi = String(wib.getMinutes()).padStart(2, '0');
  const ss = String(wib.getSeconds()).padStart(2, '0');
  lines.push(`${dd} ${mm} ${yyyy}  ${hh}:${mi}:${ss} WIB`);

  if (info.latitude && info.longitude) {
    lines.push('GPS: ' + Number(info.latitude).toFixed(6) + ', ' + Number(info.longitude).toFixed(6));
  }
  if (info.lokasi) {
    lines.push('Lokasi: ' + info.lokasi);
  }
  return lines;
}

/**
 * Escape characters that would break out of the SVG `<text>` content.
 * Kept minimal: the input is operator-supplied location/name strings,
 * not user-controlled markup, but we still want to be tidy.
 */
function escapeSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the watermark info card as an SVG buffer that overlays the
 * full image. Kept pure (no I/O) so it can be unit-tested without sharp.
 */
function renderOverlaySvg(width, height, lines) {
  // Font size scales with image width so we don't end up with 50px text
  // on a thumbnail or 11px text on a 4K photo. Clamped to 11..18.
  const fontSize = Math.max(11, Math.min(18, Math.round(width / 45)));
  const lineHeight = fontSize + 7;
  const pad = 12;
  const boxWidth = Math.min(width - 20, Math.max(300, Math.round(width * 0.75)));
  const boxHeight = lines.length * lineHeight + pad * 2 + 14;
  const boxX = 10;
  const boxY = height - boxHeight - 10;
  const footerFont = Math.max(7, Math.round(fontSize * 0.55));
  const timestampSec = Math.floor(Date.now() / 1000);

  // Per-line <text>. paint-order=stroke gives the text a black halo so
  // it stays legible against any background colour the photo might have.
  const textBlock = lines.map((line, i) => {
    const x = boxX + pad;
    const y = boxY + pad + (i + 1) * lineHeight;
    return (
      `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSize}" ` +
      `font-weight="bold" fill="white" stroke="black" stroke-width="1" ` +
      `paint-order="stroke">${escapeSvg(line)}</text>`
    );
  }).join('');

  const footerY = boxY + boxHeight - 6;
  const svg =
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="rgba(0,0,0,0.6)"/>` +
      textBlock +
      `<text x="${boxX + pad}" y="${footerY}" font-family="monospace" font-size="${footerFont}" ` +
        `fill="rgba(255,255,255,0.45)">PT Sopiak Satria Saga | ${timestampSec} | Verified</text>` +
    `</svg>`;

  return Buffer.from(svg);
}

/**
 * Apply the watermark to `inputPath` in place.
 *
 * Returns the same `inputPath` (the file is overwritten with the
 * watermarked version). In strict mode, ANY failure throws. In lenient
 * mode (or NODE_ENV !== production with no override), failures return
 * the original path so the upload can proceed un-watermarked.
 */
async function applyWatermark(inputPath, info) {
  // Each of these is an "abort" condition. They are checked in order
  // of cheapest first.
  if (!sharp) {
    return handleFailure('sharp module not installed', new Error('sharp missing'), inputPath);
  }
  if (!info) {
    return handleFailure('no watermark info provided', new Error('info is empty'), inputPath);
  }
  if (!fs.existsSync(inputPath)) {
    return handleFailure('input file does not exist', new Error(inputPath), inputPath);
  }

  const lines = info.lines || buildWatermarkLines(info);
  if (!lines.length) {
    return handleFailure('no lines to draw', new Error('buildWatermarkLines returned []'), inputPath);
  }

  try {
    const meta = await sharp(inputPath).metadata();
    const width = meta.width || 640;
    const height = meta.height || 480;

    const overlaySvg = renderOverlaySvg(width, height, lines);

    // Sharp can't safely write back to the file it's reading from in
    // one pipeline, so we stage to <name>_wm<ext> and atomically replace.
    const outPath = inputPath.replace(/(\.[^.]+)$/, '_wm$1');
    await sharp(inputPath)
      .composite([{ input: overlaySvg, top: 0, left: 0 }])
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);

    fs.copyFileSync(outPath, inputPath);
    try { fs.unlinkSync(outPath); } catch { /* best-effort cleanup */ }

    logger.info(`[Watermark] ✅ applied to ${path.basename(inputPath)}`);
    return inputPath;
  } catch (err) {
    return handleFailure('rendering failed', err, inputPath);
  }
}

module.exports = { applyWatermark, buildWatermarkLines };
