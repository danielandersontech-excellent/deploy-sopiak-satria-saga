/**
 * Generate PWA icons from logo-ptsss.png
 * Run: node scripts/generate-icons.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT = path.join(__dirname, '..', 'public', 'logo-ptsss.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  if (!fs.existsSync(INPUT)) {
    console.warn('[generate-icons] logo-ptsss.png not found, skipping');
    return;
  }
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const size of SIZES) {
    await sharp(INPUT)
      .resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
      .png()
      .toFile(path.join(OUTPUT_DIR, `icon-${size}x${size}.png`));
    console.log(`  + icon-${size}x${size}.png`);
  }

  // Maskable icon with safe zone padding
  await sharp(INPUT)
    .resize(410, 410, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png()
    .toFile(path.join(OUTPUT_DIR, 'icon-maskable-512x512.png'));
  console.log('  + icon-maskable-512x512.png');

  // Favicon
  await sharp(INPUT)
    .resize(32, 32)
    .png()
    .toFile(path.join(OUTPUT_DIR, '..', 'favicon.ico'));
  console.log('  + favicon.ico');

  console.log('[generate-icons] Done!');
}

generate().catch((err) => {
  console.error('[generate-icons] Error:', err.message);
  process.exit(0); // Don't fail the build
});
