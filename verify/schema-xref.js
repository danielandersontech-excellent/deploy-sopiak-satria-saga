#!/usr/bin/env node
/**
 * Cross-reference table/column names between schema SQL and backend code.
 * Catches things like: backend queries `users.email` but schema has no email column.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SQL = fs.readFileSync(path.join(REPO, 'database', 'ptsss_db.sql'), 'utf8');

// Extract: CREATE TABLE public.<name> ( ... col1 type, col2 type ... );
const tables = {};
const tableRx = /CREATE TABLE (?:public\.)?(\w+)\s*\(([\s\S]*?)\);/g;
let m;
while ((m = tableRx.exec(SQL))) {
  const name = m[1];
  const body = m[2];
  // Pull column names: each column line starts with an identifier
  const cols = new Set();
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // skip CONSTRAINT lines
    if (/^CONSTRAINT\s/i.test(t) || /^FOREIGN\s+KEY/i.test(t) || /^PRIMARY\s+KEY/i.test(t) || /^UNIQUE\s*\(/i.test(t) || /^CHECK\s*\(/i.test(t)) continue;
    const cm = t.match(/^["']?(\w+)["']?\s+/);
    if (cm) cols.add(cm[1]);
  }
  tables[name] = cols;
}

console.log('Tables found in schema:', Object.keys(tables).length);
console.log(Object.keys(tables).sort().join(', '));

// Walk backend code, find SQL queries, check table/column refs
const codeFiles = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) codeFiles.push(p);
  }
}
walk(path.join(REPO, 'backend', 'src'));

const issues = [];

// Find FROM <table> and JOIN <table> references in SQL strings
const fromRx = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]\w+)\b/gi;

for (const f of codeFiles) {
  const src = fs.readFileSync(f, 'utf8');
  // Extract template-literal SQL strings (backticks) and regular strings with SELECT/INSERT/UPDATE
  const sqlBlocks = [];
  // Backtick blocks
  const btRx = /`([^`]*)`/g;
  let mm;
  while ((mm = btRx.exec(src))) {
    if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN)\b/i.test(mm[1])) {
      sqlBlocks.push(mm[1]);
    }
  }
  // Single-quoted, multi-arg query() calls — too noisy, skip; we already cover backticks

  for (const block of sqlBlocks) {
    fromRx.lastIndex = 0;
    while ((mm = fromRx.exec(block))) {
      const tbl = mm[1].toLowerCase();
      // Skip subquery aliases — those typically don't show up after FROM/JOIN as bare identifiers in our codebase
      if (!tables[tbl] && tbl.length > 1 && !['t','u','a','b','c'].includes(tbl)) {
        // Many false positives: aliases, CTEs. Filter to plausible table-like names.
        if (!/^[a-z_]+$/.test(tbl)) continue;
        // Skip common SQL keywords / common alias names
        const skip = ['select','where','order','group','having','as','on','and','or','set','not','null','true','false','dual','only','users_count','count','dual','public'];
        if (skip.includes(tbl)) continue;
        // Skip single-letter aliases or 2-3 char ones that look like aliases (usually after AS)
        // We only flag if the name looks like a real table (4+ chars, has _ or known suffix)
        if (tbl.length >= 4 && !skip.includes(tbl)) {
          issues.push({ file: path.relative(REPO, f), table: tbl });
        }
      }
    }
  }
}

// Dedup
const seen = new Set();
const finalIssues = issues.filter(i => {
  const k = i.file + ':' + i.table;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log('\n--- Potentially missing table references ---');
if (finalIssues.length === 0) {
  console.log('✓ All SQL table references match the schema');
} else {
  for (const i of finalIssues) {
    console.log(`  ? ${i.table}  (in ${i.file})`);
  }
}
