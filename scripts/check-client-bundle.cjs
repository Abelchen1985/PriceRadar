/**
 * Client bundle boundary check.
 *
 * The browser bundle is built from src/ by Vite. Anything a client file imports
 * as a VALUE gets bundled -- including, transitively, modules that only make
 * sense on the server. One of those reads process.env at import time, so the
 * moment it was pulled in the bundle threw "process is not defined" before
 * React could mount and the site served a blank page. Nothing in the build
 * caught it: esbuild does not type-check, and the server-side test suite passed
 * happily because it runs in Node.
 *
 * This enforces the boundary. Type-only imports are fine -- they are erased.
 *
 * Run with: npm run check:client
 */

const fs = require('fs');
const path = require('path');

// Modules that must never be reachable from the browser bundle.
const SERVER_ONLY = [
  'services/observationStore',
  'services/offerStore',
  'services/structuredDataVerifier',
  'scripts/selftest'
];

// Note: src/services/offers.ts is deliberately NOT on this list. It is the pure
// model -- types, validity rules, formatting -- with no filesystem or env
// access, so the browser may import it. offerStore.ts is the persistence layer
// and must stay server-side.

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders = [];

for (const file of walk(SRC)) {
  // The server-only modules themselves are allowed to import each other.
  if (SERVER_ONLY.some(m => file.replace(/\\/g, '/').includes(m))) continue;

  const source = fs.readFileSync(file, 'utf8');
  const importRe = /^\s*import\s+(type\s+)?([\s\S]*?)from\s+['"]([^'"]+)['"]/gm;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2]);
    const spec = m[3];
    if (isTypeOnly) continue;
    if (SERVER_ONLY.some(mod => spec.includes(mod.split('/').pop()) && /selftest|observationStore|offerStore|structuredDataVerifier/.test(spec))) {
      offenders.push({
        file: path.relative(path.join(__dirname, '..'), file),
        spec,
        line: source.slice(0, m.index).split('\n').length
      });
    }
  }
}

if (offenders.length > 0) {
  console.error('FAIL: client code value-imports server-only module(s).');
  console.error('These get bundled into the browser and can crash the page at load.\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  imports "${o.spec}"`);
  }
  console.error('\nUse `import type { ... }` if you only need the types, or call the');
  console.error('equivalent API endpoint instead of importing the implementation.');
  process.exit(1);
}

console.log('PASS  no client file value-imports a server-only module');
console.log('      guarded: ' + SERVER_ONLY.join(', '));
