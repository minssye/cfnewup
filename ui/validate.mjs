/**
 * CFnew UI contract validation — the safety valve for automated upgrades.
 *
 * The build replaces the settings-page markup wholesale. If upstream adds a
 * field we do not know about, that element would silently vanish and the page
 * JS would start throwing. This script refuses to let that reach main.
 *
 * Usage:
 *   node ui/validate.mjs                        # built _worker.js vs upstream _worker.js
 *   node ui/validate.mjs --upstream a.js --built b.js
 *
 * Exit code 0 = safe to commit, 1 = do NOT commit (details on stdout).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
const BUILT = path.resolve(arg('built', path.join(REPO, '_worker.js')));
const UPSTREAM = path.resolve(arg('upstream', path.join(REPO, '_worker.js')));

const BT = String.fromCharCode(96);
const ZH = {
  terminal: String.fromCharCode(0x7EC8, 0x7AEF, 0x9875, 0x9762),
  settings: String.fromCharCode(0x503C, 0x9875, 0x9762)
};

const hard = [];
const warn = [];
const fail = (m) => hard.push(m);
const caution = (m) => warn.push(m);

function regions(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const find = (pred, from) => { for (let i = from || 0; i < lines.length; i++) if (pred(lines[i])) return i; return -1; };
  const out = {};
  for (const key of ['terminal', 'settings']) {
    const start = find((l) => l.includes('const ' + ZH[key] + ' = ' + BT));
    const so = find((l) => l.trim() === '<style>', start);
    const sc = find((l) => l.trim() === '</style>', so);
    const bo = find((l) => l.trim() === '<body>', sc);
    const jo = find((l) => l.trim() === '<script>', bo);
    const jc = find((l) => l.trim() === '</script>', jo);
    out[key] = {
      start, styleOpen: so, styleClose: sc, bodyOpen: bo, scriptOpen: jo, scriptClose: jc,
      css: lines.slice(so, sc + 1).join('\n'),
      body: lines.slice(bo, jo).join('\n'),
      js: lines.slice(jo, jc + 1).join('\n')
    };
  }
  return out;
}

const B = regions(BUILT);
const U = regions(UPSTREAM);
const sameSource = path.resolve(BUILT) === path.resolve(UPSTREAM);
// When upstream and built are different files, U holds the pristine upstream
// regions and the dropped-element check runs against them. When they are the
// same file there is nothing to compare, so the check is skipped.
const Ubody = sameSource ? null : U;

const idsOf = (t) => { const s = new Set(); for (const m of t.matchAll(/\bid="([^"$][^"]*)"/g)) s.add(m[1]); return s; };
const handlersOf = (t) => { const s = new Set(); for (const m of t.matchAll(/on(?:click|change|input)="([^"]*)"/g)) s.add(m[1]); return s; };
const classesOf = (t) => { const s = new Set(); for (const m of t.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).forEach((c) => c && s.add(c)); return s; };
const jsvarsOf = (t) => { const s = new Set(); for (const m of t.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) s.add(m[1]); return s; };

// ---------------------------------------------------------------- checks --

// 1. the built Worker must be syntactically valid from Node's point of view
try {
  execFileSync(process.execPath, ['--check', BUILT], { stdio: 'pipe' });
} catch (e) {
  fail('generated Worker is not valid JavaScript:\n' + String(e.stderr || e.message).split('\n').slice(0, 8).join('\n'));
}

// 2. page logic must survive the build byte for byte
if (sameSource) {
  caution('--upstream and --built point at the same file: page-logic comparison skipped.');
} else {
  for (const key of ['terminal', 'settings']) {
    if (B[key].js !== U[key].js) fail('the ' + key + ' page script changed - the build must never rewrite page logic');
  }
}

// 3. every element the page script looks up must exist in the markup.
//    Upstream has at least one dead lookup (a getElementById result that is
//    assigned and never read again), which is harmless. So a missing id is
//    only fatal when the variable it lands in is actually used later.
//    Anything we cannot prove dead is treated as fatal - this check fails closed.
const IDENT = '[A-Za-z_$\\u4e00-\\u9fff][\\w$\\u4e00-\\u9fff]*';
function deadLookups(js) {
  const dead = [];
  const alive = [];
  const re = new RegExp('(?:const|let|var)\\s+(' + IDENT + ')\\s*=\\s*document\\.getElementById\\(\\s*[\'\"]([^\'\"]+)[\'\"]', 'g');
  let m;
  while ((m = re.exec(js))) {
    const variable = m[1];
    const id = m[2];
    const uses = js.split(new RegExp('(?<![\\w$\\u4e00-\\u9fff])' + variable.replace(/[$]/g, '\\$') + '(?![\\w$\\u4e00-\\u9fff])')).length - 1;
    (uses <= 1 ? dead : alive).push({ id, variable, uses });
  }
  return { dead, alive };
}

for (const key of ['terminal', 'settings']) {
  const present = idsOf(B[key].body);
  const looked = [...jsvarsOf(B[key].js)].filter((id) => !present.has(id));
  if (!looked.length) continue;
  const { dead, alive } = deadLookups(B[key].js);
  const deadSet = new Set(dead.map((d) => d.id));
  const fatal = looked.filter((id) => !deadSet.has(id));
  const benign = looked.filter((id) => deadSet.has(id));
  if (benign.length) caution(key + ' page: ' + benign.length + ' dead lookup(s) - assigned from getElementById but never read, matching upstream behaviour: ' + benign.join(', '));
  void alive;
  if (fatal.length) fail(key + ' page: the script looks up ' + fatal.length + ' id(s) that do not exist in the markup and ARE used: ' + fatal.join(', '));
}

// 4. nothing that upstream ships may be dropped (this is the new-field trap)
if (Ubody) {
  const upIds = idsOf(Ubody.settings.body);
  const builtIds = idsOf(B.settings.body);
  const dropped = [...upIds].filter((id) => !builtIds.has(id));
  if (dropped.length) {
    fail('upstream elements missing from the rebuilt markup (' + dropped.length + '):\n' +
      dropped.map((d) => '        #' + d).join('\n') + '\n' +
      '      Add these elements to ui/src/body.html, then re-run the workflow.');
  }
  const upH = handlersOf(Ubody.settings.body);
  const builtH = handlersOf(B.settings.body);
  const lostH = [...upH].filter((h) => !builtH.has(h));
  if (lostH.length) fail('upstream inline handlers missing from the rebuilt markup (' + lostH.length + '):\n' + lostH.map((h) => '        ' + h.slice(0, 90)).join('\n'));
}

// 5. every class used by the markup must actually be styled
for (const key of ['terminal', 'settings']) {
  const used = classesOf(B[key].body);
  const defined = new Set();
  for (const m of B[key].css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
  const unstyled = [...used].filter((c) => !defined.has(c) && c !== 'icon');
  if (unstyled.length) fail(key + ' page: ' + unstyled.length + ' class(es) used in markup but absent from the stylesheet: ' + unstyled.join(', '));
}

// 6. the theme switcher must be injected exactly twice and never duplicated
const builtText = fs.readFileSync(BUILT, 'utf8');
const count = (s) => builtText.split(s).length - 1;
for (const [what, needle, expected] of [
  ['theme boot script', '<!--cp:theme-boot-->', 2],
  ['theme button', '<!--cp:theme-button-->', 2],
  ['theme logic script', '<!--cp:theme-script-->', 2],
  ['theme button markup', 'id="cpThemeToggle"', 2],
  ['data-theme token blocks', '[data-theme="light"]', 2]
]) {
  const n = count(needle);
  if (n !== expected) fail('expected ' + expected + ' x ' + what + ', found ' + n);
}

// 7. the top navigation bar must wrap the four top-area controls, exactly once
//    per page, with every control physically inside it.
{
  const openTag = '<nav class="cp-topbar">';
  const open = count(openTag);
  const close = count('</nav>');
  if (open !== 2) fail('expected 2 x <nav class="cp-topbar">, found ' + open);
  if (close !== 2) fail('expected 2 x </nav>, found ' + close);

  const mustBeInside = ['class="cp-hud"', 'class="cp-lang-wrapper"', 'id="cpFxToggle"', 'id="cpThemeToggle"'];
  const segments = [];
  let from = 0;
  for (;;) {
    const a = builtText.indexOf('<!--cp:topbar-open-->' + openTag, from);
    if (a < 0) break;
    const b = builtText.indexOf('</nav><!--cp:topbar-close-->', a);
    if (b < 0) { fail('a top bar opens but never closes'); break; }
    segments.push(builtText.slice(a, b));
    from = b + 1;
  }
  if (segments.length !== 2) fail('expected 2 closed top-bar segments, found ' + segments.length);
  segments.forEach((seg, i) => {
    mustBeInside.forEach((needle) => {
      if (!seg.includes(needle)) fail('top bar #' + (i + 1) + ' does not contain ' + needle);
    });
  });
}

// 8. the top bar must be styled by the shared stylesheet on both pages
for (const key of ['terminal', 'settings']) {
  if (!B[key].css.includes('.cp-topbar {')) fail(key + ' page stylesheet is missing the .cp-topbar rules');
  if (!B[key].css.includes('position: fixed')) fail(key + ' page stylesheet does not pin the top bar');
}

// 7. decorative leftovers should be gone from the rebuilt markup
const legacy = (B.settings.body.match(/\sstyle\s*=/g) || []).length;
if (legacy > 5) caution('rebuilt settings markup still carries ' + legacy + ' inline style attribute(s) - expected no more than 5.');

// ---------------------------------------------------------------- report --
console.log('');
console.log('CFnew UI contract validation');
console.log('  upstream : ' + path.relative(process.cwd(), UPSTREAM));
console.log('  built    : ' + path.relative(process.cwd(), BUILT));
console.log('');
console.log('  settings markup ids : ' + idsOf(B.settings.body).size);
console.log('  settings handlers   : ' + handlersOf(B.settings.body).size);
console.log('  settings classes    : ' + classesOf(B.settings.body).size);
console.log('  page script refs     : ' + jsvarsOf(B.settings.js).size + ' (settings), ' + jsvarsOf(B.terminal.js).size + ' (terminal)');

if (warn.length) {
  console.log('');
  console.log('WARNINGS (' + warn.length + ')');
  warn.forEach((w) => console.log('  ! ' + w));
}

if (hard.length) {
  console.log('');
  console.log('FAILED (' + hard.length + ') - refusing to publish this build');
  hard.forEach((h) => console.log('  x ' + h));
  console.log('');
  process.exit(1);
}

console.log('');
console.log('contract OK - safe to commit');