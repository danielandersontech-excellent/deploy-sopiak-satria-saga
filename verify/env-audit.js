#!/usr/bin/env node
/**
 * Audit env vars referenced in code vs declared in docker-compose / .env.example.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '.next' || f === 'dist') continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const ENV_RX = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const NEXT_PUBLIC_RX = /NEXT_PUBLIC_[A-Z0-9_]+/g;

const refs = {
  backend: new Set(),
  webAdmin: new Set(),
  website: new Set(),
};

for (const f of walk(path.join(ROOT, 'backend/src'))) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  ENV_RX.lastIndex = 0;
  while ((m = ENV_RX.exec(src))) refs.backend.add(m[1]);
}
for (const f of walk(path.join(ROOT, 'web-admin-next'))) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  ENV_RX.lastIndex = 0;
  while ((m = ENV_RX.exec(src))) refs.webAdmin.add(m[1]);
}
for (const f of walk(path.join(ROOT, 'website'))) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  ENV_RX.lastIndex = 0;
  while ((m = ENV_RX.exec(src))) refs.website.add(m[1]);
}

// Read docker-compose.yml — find ${VAR} usages
const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
const composeVars = new Set();
const composeRx = /\$\{([A-Z_][A-Z0-9_]*)/g;
let m;
while ((m = composeRx.exec(compose))) composeVars.add(m[1]);

console.log('=== ENV VAR AUDIT ===\n');
console.log('[Backend code references env vars:]');
[...refs.backend].sort().forEach(v => console.log('  -', v));
console.log('\n[Web-admin code references env vars:]');
[...refs.webAdmin].sort().forEach(v => console.log('  -', v));
console.log('\n[Website code references env vars:]');
[...refs.website].sort().forEach(v => console.log('  -', v));
console.log('\n[docker-compose.yml uses env vars:]');
[...composeVars].sort().forEach(v => console.log('  -', v));

// Coverage check: backend env vars must be passed via compose
const composeEnvBackend = compose.match(/backend:[\s\S]*?(?=\n  [a-z]|\nvolumes:)/);
const beEnvSection = composeEnvBackend ? composeEnvBackend[0] : '';

console.log('\n[Backend env vars NOT set in compose backend.environment:]');
const missing = [];
for (const v of refs.backend) {
  if (v === 'NODE_ENV' || v === 'PORT') continue; // built-ins
  // Look for `V:` or `V =` in beEnvSection
  if (!new RegExp(`(^|\\n)\\s+${v}:`, 'm').test(beEnvSection)) {
    missing.push(v);
  }
}
if (missing.length === 0) console.log('  ✓ All covered');
else missing.sort().forEach(v => console.log('  ✗', v));

// Required-secret check (compose uses ${X:?...} syntax)
console.log('\n[Required secrets (must be set in Coolify before deploy):]');
const required = compose.match(/\$\{([A-Z_]+):\?[^}]+\}/g) || [];
[...new Set(required.map(r => r.match(/\{([A-Z_]+)/)[1]))].sort().forEach(v => console.log('  •', v));