/**
 * CFnew UI build — portable, dependency-free, idempotent.
 *
 * Reads the Worker source, swaps in the redesigned stylesheets and settings
 * markup, injects the theme skin switcher, and writes the result back.
 *
 * Usage:
 *   node ui/build.mjs                       # repo/_worker.js in place
 *   node ui/build.mjs --input x.js --output y.js
 *
 * Design notes:
 *  - No absolute paths; everything resolves relative to this file.
 *  - Regions are located by marker text, never by line number, so upstream
 *    line shifts are harmless.
 *  - Every injected block is wrapped in <!--cp:name--> ... <!--/cp:name-->, so
 *    re-running strips the previous injection first: the build is idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const REPO = path.dirname(HERE);

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const INPUT = path.resolve(arg('input', path.join(REPO, '_worker.js')));
const OUTPUT = path.resolve(arg('output', INPUT));

const read = (p) => fs.readFileSync(p, 'utf8');
const readSrc = (f) => read(path.join(SRC, f));
const trim = (s) => s.replace(/\r\n/g, '\n').trim();

// ---------------------------------------------------------------- inputs --
const tokens = trim(readSrc('tokens.css'));
const terminalCss = trim(readSrc('terminal.css'));
const settingsCss = [
  trim(readSrc('settings-head.css')),
  trim(readSrc('settings-mid.css')),
  trim(readSrc('settings-normalize.css')),
  trim(readSrc('settings-tail.css')),
  trim(readSrc('settings-addendum.css'))
].join('\n\n');
const bodyHtml = trim(readSrc('body.html'));
const themeSharedCss = trim(readSrc('theme-shared.css'));
const themeButton = trim(readSrc('theme-button.html'));
const themeBoot = trim(readSrc('theme-boot.html'));
const themeJs = trim(readSrc('theme.js'));

const BACKTICK = String.fromCharCode(96);

// ------------------------------------------------------------ preflight ---
// The Worker builds its pages with JavaScript template literals. Anything we
// inject is spliced into that literal, so a stray backtick would break the
// file and an unintended ${...} would be evaluated server-side at request
// time. body.html is exempt: its ${...} are the page's own template holes.
const escapingChecks = [
  ['tokens.css', tokens], ['terminal.css', terminalCss],
  ['settings css', settingsCss], ['theme-shared.css', themeSharedCss],
  ['theme-button.html', themeButton], ['theme-boot.html', themeBoot],
  ['theme.js', themeJs]
];
for (const [name, text] of escapingChecks) {
  if (text.includes(BACKTICK)) throw new Error(name + ' contains a backtick; it would terminate the Worker template literal');
  if (text.includes('${')) throw new Error(name + ' contains ${...}; it would be evaluated server-side. Use plain concatenation instead.');
}
if (bodyHtml.includes(BACKTICK)) throw new Error('body.html contains a backtick');

// ------------------------------------------------------------- read input -
const raw = read(INPUT);
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let text = raw.replace(/\r\n/g, '\n');

const MARKERS = ['theme-boot', 'theme-button', 'theme-script'];
const hadPrevious = MARKERS.some((m) => text.includes('<!--cp:' + m + '-->'));
if (hadPrevious) {
  console.log('note: input already carries UI injections - stripping them first (idempotent rebuild)');
  for (const m of MARKERS) {
    const re = new RegExp('\\n?[ \\t]*<!--cp:' + m + '-->[\\s\\S]*?<!--/cp:' + m + '-->', 'g');
    text = text.replace(re, '');
  }
}

const lines = text.split('\n');
const ZH = {
  terminal: String.fromCharCode(0x7EC8, 0x7AEF, 0x9875, 0x9762),
  settings: String.fromCharCode(0x503C, 0x9875, 0x9762)
};

function findLine(pred, from) {
  for (let i = from || 0; i < lines.length; i++) if (pred(lines[i])) return i;
  return -1;
}
function must(idx, what) {
  if (idx < 0) throw new Error('could not locate ' + what + ' in ' + INPUT + ' - upstream layout may have changed');
  return idx;
}

const termStart = must(findLine((l) => l.includes('const ' + ZH.terminal + ' = ' + BACKTICK)), 'the terminal page');
const termStyleOpen = must(findLine((l) => l.trim() === '<style>', termStart), 'terminal <style>');
const termStyleClose = must(findLine((l) => l.trim() === '</style>', termStyleOpen), 'terminal </style>');

const setStart = must(findLine((l) => l.includes('const ' + ZH.settings + ' = ' + BACKTICK), termStyleClose), 'the settings page');
const setStyleOpen = must(findLine((l) => l.trim() === '<style>', setStart), 'settings <style>');
const setStyleClose = must(findLine((l) => l.trim() === '</style>', setStyleOpen), 'settings </style>');
const setBodyOpen = must(findLine((l) => l.trim() === '<body>', setStyleClose), 'settings <body>');
const setScriptOpen = must(findLine((l) => l.trim() === '<script>', setBodyOpen), 'settings <script>');

console.log('terminal page  L' + (termStart + 1) + '   <style> L' + (termStyleOpen + 1) + '..' + (termStyleClose + 1));
console.log('settings page  L' + (setStart + 1) + '   <style> L' + (setStyleOpen + 1) + '..' + (setStyleClose + 1) + '   <body> L' + (setBodyOpen + 1));

// ---------------------------------------------------------------- splice --
const nl = (s) => s.split('\n');
const styleBlock = (pageCss) =>
  ['<style>'].concat(nl(tokens)).concat(['']).concat(nl(themeSharedCss)).concat(['']).concat(nl(pageCss)).concat(['</style>']);

const out = [];
out.push(...lines.slice(0, termStyleOpen));
out.push(...styleBlock(terminalCss));
out.push(...lines.slice(termStyleClose + 1, setStyleOpen));
out.push(...styleBlock(settingsCss));
out.push(...lines.slice(setStyleClose + 1, setBodyOpen));
out.push(...nl(bodyHtml));
out.push(...lines.slice(setScriptOpen));
let result = out.join('\n');

// ------------------------------------------------------------- inject UI --
function wrap(name, payload) {
  return '<!--cp:' + name + '-->\n' + payload + '\n<!--/cp:' + name + '-->';
}

// 1. anti-flash boot script, first thing inside <head>
let bootCount = 0;
result = result.replace(/^([ \t]*<head>[ \t]*)$/gm, (m) => {
  bootCount++;
  return m + '\n' + wrap('theme-boot', themeBoot);
});

// 2. the switcher button, right after the FX toggle
let buttonCount = 0;
{
  const anchor = 'id="cpFxToggle"';
  let from = 0;
  for (;;) {
    const at = result.indexOf(anchor, from);
    if (at < 0) break;
    const close = result.indexOf('</button>', at);
    if (close < 0) throw new Error('no closing </button> after cpFxToggle');
    const insertAt = close + '</button>'.length;
    const block = '\n' + wrap('theme-button', themeButton);
    result = result.slice(0, insertAt) + block + result.slice(insertAt);
    buttonCount++;
    from = insertAt + block.length;
  }
}

// 3. the switcher logic, just before </body>
let scriptCount = 0;
result = result.replace(/^([ \t]*<\/body>[ \t]*)$/gm, (m) => {
  scriptCount++;
  return wrap('theme-script', themeJs) + '\n' + m;
});

if (bootCount !== 2 || buttonCount !== 2 || scriptCount !== 2) {
  throw new Error('expected to inject into exactly 2 pages, got boot=' + bootCount + ' button=' + buttonCount + ' script=' + scriptCount);
}
console.log('injected: boot x' + bootCount + ', button x' + buttonCount + ', script x' + scriptCount);

// ---------------------------------------------------------------- write ---
const finalText = eol === '\r\n' ? result.replace(/\n/g, '\r\n') : result;
fs.writeFileSync(OUTPUT, finalText);
const rel = path.relative(process.cwd(), OUTPUT) || OUTPUT;
console.log('wrote ' + rel + '  (' + finalText.split(eol).length + ' lines, ' + finalText.length + ' bytes)');