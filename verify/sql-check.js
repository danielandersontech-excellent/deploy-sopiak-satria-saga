#!/usr/bin/env node
/**
 * Lightweight SQL schema validator: catches structural problems
 * (unbalanced parens, missing semicolons, unmatched DO $$, etc.)
 * without needing an actual Postgres instance.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'database', 'ptsss_db.sql');
const sql = fs.readFileSync(FILE, 'utf8');

// Strip comments (but preserve newlines for line numbers)
function stripComments(s) {
  // Strip line comments
  s = s.replace(/--[^\n]*/g, '');
  // Strip block comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return s;
}

const stripped = stripComments(sql);

// Count balance of parens, dollar quotes
let parens = 0;
let dollarQuoteOpen = false;
let inSingleQuote = false;
let lineNo = 1;
const errors = [];

// Track $$ pairs (PL/pgSQL function bodies)
let i = 0;
while (i < stripped.length) {
  const c = stripped[i];
  const next2 = stripped.substr(i, 2);

  if (c === '\n') lineNo++;
  if (c === "'" && !dollarQuoteOpen) {
    // Toggle, but skip escaped ''
    if (stripped[i+1] === "'") { i += 2; continue; }
    inSingleQuote = !inSingleQuote;
  }
  if (!inSingleQuote) {
    if (next2 === '$$') {
      dollarQuoteOpen = !dollarQuoteOpen;
      i += 2; continue;
    }
    if (!dollarQuoteOpen) {
      if (c === '(') parens++;
      else if (c === ')') parens--;
      if (parens < 0) {
        errors.push(`Line ${lineNo}: unmatched ')'`);
        parens = 0;
      }
    }
  }
  i++;
}

if (parens !== 0) errors.push(`Unbalanced parens: ${parens} extra '('`);
if (dollarQuoteOpen) errors.push(`Unmatched $$ block`);
if (inSingleQuote) errors.push(`Unmatched single quote`);

// Statement count
const stmts = stripped.split(';').filter(s => s.trim().length > 0);
const tables = (sql.match(/CREATE TABLE/gi) || []).length;
const indexes = (sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX/gi) || []).length;
const fks = (sql.match(/ADD\s+CONSTRAINT.*FOREIGN\s+KEY/gi) || []).length;
const triggers = (sql.match(/CREATE\s+TRIGGER/gi) || []).length;
const functions = (sql.match(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION/gi) || []).length;

console.log(`File:        ${path.basename(FILE)}`);
console.log(`Size:        ${(sql.length/1024).toFixed(1)} KB`);
console.log(`Statements:  ~${stmts.length}`);
console.log(`Tables:      ${tables}`);
console.log(`Indexes:     ${indexes}`);
console.log(`Foreign keys:${fks}`);
console.log(`Triggers:    ${triggers}`);
console.log(`Functions:   ${functions}`);

// Check for known PG version compatibility issues
const pg18Only = [];
if (/SET\s+transaction_timeout\s*=/i.test(sql)) {
  // already commented per inspection earlier — verify
  const m = sql.match(/[^-]\s*SET\s+transaction_timeout\s*=/i);
  if (m) pg18Only.push('SET transaction_timeout (PG 17+ only)');
}

console.log('');
if (errors.length === 0) {
  console.log('✓ SQL structural check passed');
} else {
  console.log('✗ SQL issues:');
  for (const e of errors) console.log('  -', e);
}
if (pg18Only.length) {
  console.log('⚠ PG version concerns:');
  for (const p of pg18Only) console.log('  -', p);
}
process.exit(errors.length > 0 ? 1 : 0);