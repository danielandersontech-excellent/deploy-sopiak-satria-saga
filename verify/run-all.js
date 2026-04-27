#!/usr/bin/env node
/**
 * Run all static analyzers in sequence.
 * Exit code 0 = repo verified clean, ready to push.
 * Exit code != 0 = something failed, fix before deploy.
 *
 * Usage: node verify/run-all.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const HERE = __dirname;
const checks = [
  { name: 'Import & module resolution',  script: 'analyze.js'         },
  { name: 'Next.js client/server boundaries', script: 'check-boundaries.js' },
  { name: 'SQL schema structural check', script: 'sql-check.js'       },
  { name: 'Schema vs code cross-ref',    script: 'schema-xref.js'     },
  { name: 'Env var audit',               script: 'env-audit.js'       },
];

let failed = 0;
const results = [];

for (const c of checks) {
  process.stdout.write(`\n━━━ [${c.name}] ━━━\n`);
  const r = spawnSync(process.execPath, [path.join(HERE, c.script)], {
    stdio: 'inherit',
  });
  const ok = r.status === 0;
  results.push({ name: c.name, ok, code: r.status });
  if (!ok) failed++;
}

console.log('\n\n══════════════════════════════════════════');
console.log('  SUMMARY');
console.log('══════════════════════════════════════════');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}${r.ok ? '' : '  (exit '+r.code+')'}`);
}
console.log('');
if (failed === 0) {
  console.log('✅ ALL CHECKS PASSED — repo siap deploy ke Coolify.');
  process.exit(0);
} else {
  console.log(`❌ ${failed} check(s) gagal. Fix dulu sebelum deploy.`);
  process.exit(1);
}
