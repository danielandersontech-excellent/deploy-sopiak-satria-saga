#!/usr/bin/env node
/**
 * Check Next.js 14 App Router boundary violations:
 *  - Files using React hooks (useState/useEffect/etc) must have 'use client' OR be in client tree
 *  - Files importing from 'react' hooks-style without 'use client' will fail build
 *  - Server components can't use browser APIs (window, document, localStorage)
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(REPO, 'web-admin-next'),
  path.join(REPO, 'website'),
];

const HOOK_RX = /\b(useState|useEffect|useRef|useCallback|useMemo|useReducer|useContext|useLayoutEffect|useTransition|useDeferredValue|useId|useImperativeHandle|useDebugValue|useSyncExternalStore|useInsertionEffect|useFormStatus|useFormState|useOptimistic|useRouter|usePathname|useSearchParams|useParams)\s*\(/;
const BROWSER_RX = /\b(window|document|localStorage|sessionStorage|navigator|location)\s*\./;
const EVENT_HANDLER_RX = /\bon[A-Z][a-zA-Z]+\s*=/; // onClick, onChange, etc.

function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '.next' || f === 'dist') continue;
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(p)) out.push(p);
  }
  return out;
}

const issues = [];
for (const root of ROOTS) {
  const files = walk(path.join(root, 'app'))
    .concat(walk(path.join(root, 'components')))
    .concat(walk(path.join(root, 'hooks')))
    .concat(walk(path.join(root, 'stores')));

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const firstNonComment = src.replace(/^\s*(?:\/\*[\s\S]*?\*\/|\/\/.*\n)*/, '').trimStart();
    const hasUseClient = /^['"]use client['"]\s*;?/.test(firstNonComment);
    const hasUseServer = /^['"]use server['"]\s*;?/.test(firstNonComment);
    const usesHook = HOOK_RX.test(src);
    const usesBrowser = BROWSER_RX.test(src);
    const usesEventHandler = EVENT_HANDLER_RX.test(src);
    const rel = path.relative(path.dirname(root), f);

    if (!hasUseClient && (usesHook || usesEventHandler)) {
      // Allow exceptions: layout.tsx and page.tsx CAN be server components,
      // but if they use hooks they must be client.
      issues.push({ file: rel, level: 'ERROR',
        msg: `Uses ${usesHook ? 'React hooks' : 'event handlers'} but no 'use client' directive` });
    }
    if (!hasUseClient && usesBrowser) {
      // Browser globals may be guarded by typeof check — sample check
      const guarded = /typeof\s+window\s*!==\s*['"]undefined['"]/.test(src) ||
                       /typeof\s+document\s*!==\s*['"]undefined['"]/.test(src);
      if (!guarded) {
        issues.push({ file: rel, level: 'WARN',
          msg: `Uses browser globals without 'use client' or typeof guard` });
      }
    }
  }
}

if (issues.length === 0) {
  console.log('✓ No Next.js client/server boundary issues detected');
  process.exit(0);
} else {
  console.log(`Found ${issues.length} potential issues:\n`);
  for (const i of issues) {
    console.log(`  [${i.level}] ${i.file}`);
    console.log(`         ${i.msg}`);
  }
  process.exit(issues.filter(i => i.level === 'ERROR').length > 0 ? 1 : 0);
}
