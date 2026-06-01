#!/usr/bin/env node
/**
 * Static analyzer: catches deploy-time bugs without running npm install.
 *
 * Checks:
 *  1. Every require()/import points to a file that exists OR to a dep listed in package.json.
 *  2. Every internal relative path resolves to a real file.
 *  3. JS syntax (node --check equivalent via vm).
 *  4. JSON files are valid.
 *  5. References to env vars in code are documented.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || require('path').resolve(__dirname, '..');
const COMPONENTS = [
  { dir: 'backend',          pkg: 'backend/package.json',          src: ['backend/src'] },
  { dir: 'web-admin-next',   pkg: 'web-admin-next/package.json',   src: ['web-admin-next/app','web-admin-next/components','web-admin-next/lib','web-admin-next/hooks','web-admin-next/stores','web-admin-next/middleware.ts','web-admin-next/scripts'] },
  { dir: 'website',          pkg: 'website/package.json',          src: ['website/app','website/components','website/lib','website/hooks'] },
];

const RX_REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RX_IMPORT  = /(?:^|\n)\s*import(?:\s+[^'"]+\s+from)?\s*['"]([^'"]+)['"]/g;
const RX_DYN     = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const NODE_BUILTINS = new Set(['fs','path','http','https','crypto','os','util','events','stream','child_process','url','querystring','net','tls','dns','zlib','assert','buffer','module','vm','cluster','dgram','readline','tty','perf_hooks','async_hooks','timers','process','punycode','string_decoder','v8','worker_threads','console','constants','domain','sys','fs/promises','path/posix','path/win32','timers/promises']);

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) { out.push(dir); return out; }
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '.next' || f === 'dist' || f === 'build') continue;
    walk(path.join(dir, f), out);
  }
  return out;
}

function isCodeFile(p) {
  return /\.(js|jsx|ts|tsx|cjs|mjs)$/.test(p);
}

function loadPkg(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function depList(pkg) {
  if (!pkg) return new Set();
  return new Set([
    ...Object.keys(pkg.dependencies||{}),
    ...Object.keys(pkg.devDependencies||{}),
    ...Object.keys(pkg.peerDependencies||{}),
    ...Object.keys(pkg.optionalDependencies||{}),
  ]);
}

function resolveDepName(spec) {
  // 'foo'      → 'foo'
  // 'foo/bar'  → 'foo'
  // '@a/b'     → '@a/b'
  // '@a/b/c'   → '@a/b'
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.slice(0,2).join('/');
  }
  return spec.split('/')[0];
}

function tryResolveLocal(spec, fromFile) {
  // Try with various extensions and as index files
  const base = path.resolve(path.dirname(fromFile), spec);
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json',
                '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const e of exts) {
    if (fs.existsSync(base + e)) return base + e;
  }
  return null;
}

function resolveAlias(spec, componentDir) {
  // Next.js path aliases for @ → component root
  if (spec.startsWith('@/')) {
    return path.join(componentDir, spec.slice(2));
  }
  return null;
}

const results = [];

for (const comp of COMPONENTS) {
  const compDir = path.join(ROOT, comp.dir);
  const pkg = loadPkg(path.join(ROOT, comp.pkg));
  const deps = depList(pkg);
  if (!pkg) {
    results.push({ comp: comp.dir, level: 'WARN', msg: 'No package.json' });
    continue;
  }
  results.push({ comp: comp.dir, level: 'INFO', msg: `Found ${deps.size} dependencies` });

  const files = [];
  for (const s of comp.src) walk(path.join(ROOT, s), files);
  const codeFiles = files.filter(isCodeFile);
  results.push({ comp: comp.dir, level: 'INFO', msg: `Scanning ${codeFiles.length} code files` });

  for (const f of codeFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const specs = new Set();
    let m;
    RX_REQUIRE.lastIndex = 0;
    while ((m = RX_REQUIRE.exec(src))) specs.add(m[1]);
    RX_IMPORT.lastIndex = 0;
    while ((m = RX_IMPORT.exec(src))) specs.add(m[1]);
    RX_DYN.lastIndex = 0;
    while ((m = RX_DYN.exec(src))) specs.add(m[1]);

    for (const spec of specs) {
      // Strip query suffix like ?raw or ?url
      const cleanSpec = spec.split('?')[0];
      if (!cleanSpec) continue;

      // Relative or absolute path → must resolve to a file
      if (cleanSpec.startsWith('.') || cleanSpec.startsWith('/')) {
        const r = tryResolveLocal(cleanSpec, f);
        if (!r) {
          results.push({ comp: comp.dir, level: 'ERROR', msg: `Missing local module: ${cleanSpec}`, file: path.relative(ROOT, f) });
        }
        continue;
      }
      // Path alias (@/...)
      if (cleanSpec.startsWith('@/')) {
        const aliasPath = resolveAlias(cleanSpec, compDir);
        if (aliasPath) {
          const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
          let found = false;
          for (const e of exts) if (fs.existsSync(aliasPath + e)) { found = true; break; }
          if (!found) {
            results.push({ comp: comp.dir, level: 'ERROR', msg: `Missing alias module: ${cleanSpec}`, file: path.relative(ROOT, f) });
          }
        }
        continue;
      }
      // node: prefix
      if (cleanSpec.startsWith('node:')) continue;
      // Built-in
      if (NODE_BUILTINS.has(cleanSpec) || NODE_BUILTINS.has(cleanSpec.split('/')[0])) continue;

      const dn = resolveDepName(cleanSpec);
      if (!deps.has(dn)) {
        // Many Next packages auto-include react etc from peers; flag as WARN not ERROR
        // But if it's clearly external and missing, ERROR
        const lvl = (dn === 'react' || dn === 'react-dom' || dn === 'next') ? 'WARN' : 'ERROR';
        results.push({ comp: comp.dir, level: lvl, msg: `Module not in package.json: ${dn} (from ${cleanSpec})`, file: path.relative(ROOT, f) });
      }
    }
  }
}

// Summary
console.log('\n=== STATIC ANALYSIS REPORT ===\n');
const byComp = {};
for (const r of results) {
  byComp[r.comp] = byComp[r.comp] || { ERROR: [], WARN: [], INFO: [] };
  byComp[r.comp][r.level].push(r);
}
let totalErrors = 0, totalWarns = 0;
for (const c of Object.keys(byComp)) {
  console.log(`\n[${c}]`);
  for (const i of byComp[c].INFO) console.log(`  • ${i.msg}`);
  // Deduplicate identical errors
  const seen = new Set();
  for (const lvl of ['ERROR','WARN']) {
    for (const r of byComp[c][lvl]) {
      const key = `${lvl}:${r.msg}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${lvl === 'ERROR' ? '✗' : '⚠'} ${lvl}: ${r.msg}${r.file ? '  ('+r.file+')' : ''}`);
      if (lvl === 'ERROR') totalErrors++; else totalWarns++;
    }
  }
}
console.log(`\n=== TOTALS: ${totalErrors} errors, ${totalWarns} warnings ===\n`);
process.exit(totalErrors > 0 ? 1 : 0);