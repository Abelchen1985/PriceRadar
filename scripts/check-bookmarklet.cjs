/**
 * Bookmarklet integrity check.
 *
 * The capture bookmarklet is JavaScript, written inside a TypeScript string,
 * concatenated by a script on a served HTML page, then URI-encoded into a
 * javascript: URL. Four layers of quoting, and a mistake in any of them ships a
 * bookmarklet that silently does nothing when clicked -- there is no build step
 * or type checker watching that path.
 *
 * This reconstructs the bookmarklet exactly as a browser would and asserts it
 * parses and still does what it is supposed to. It caught a collapsed quote in
 * the original selector.
 *
 * Run with: npm run check:bookmarklet
 */

const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');

const start = serverSrc.indexOf("'<!doctype html><html><head><meta charset=\"utf-8\">'");
const end = serverSrc.indexOf("'</script></body></html>'", start);
if (start < 0 || end < 0) {
  console.error('FAIL: could not locate the capture-setup page in server.ts');
  process.exit(1);
}

const appUrl = '';
const pageJs = serverSrc
  .slice(start, end)
  .split('\n')
  .map(line => line.trim().replace(/,$/, ''))
  .filter(line => line.startsWith("'") && line.endsWith("'"))
  .map(line => eval(line))
  .join('\n');

const scriptBody = pageJs.slice(pageJs.indexOf('var BASE='));

let built = null;
const documentStub = {
  getElementById: (id) =>
    id === 't'
      ? { value: 'TEST-TOKEN', addEventListener: () => {} }
      : {
          set href(v) { built = v; },
          get href() { return built; },
          set className(_v) {}
        }
};
const locationStub = { origin: 'https://example.invalid' };

new Function('document', 'location', scriptBody + '\n; build();')(documentStub, locationStub);

if (!built || !built.startsWith('javascript:')) {
  console.error('FAIL: the setup page produced no bookmarklet URL');
  process.exit(1);
}

const source = decodeURIComponent(built.slice('javascript:'.length));

try {
  new Function(source);
} catch (err) {
  console.error('FAIL: bookmarklet does not parse -- ' + err.message);
  console.error(source.slice(0, 500));
  process.exit(1);
}

const checks = [
  ['is syntactically valid', true],
  ['posts to /api/capture', source.includes('/api/capture')],
  ['sends the capture token header', source.includes('X-Capture-Token') && source.includes('TEST-TOKEN')],
  ['reads ld+json script tags', source.includes('ld+json') && source.includes('getElementsByTagName')],
  ['strips the URL query string', source.includes('location.origin+location.pathname')],
  ['sends no cookies, storage or page text', !/document\.cookie|innerText|localStorage|sessionStorage/.test(source)],
  ['reports a page with no product data', source.includes('No product data on this page')]
];

let failures = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (!ok) failures++;
}

console.log(failures === 0 ? '\nBookmarklet OK' : '\n' + failures + ' problem(s)');
process.exit(failures === 0 ? 0 : 1);
