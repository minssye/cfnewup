/**
 * Controlled page-JS patches.
 *
 * The build owns two invariants that used to conflict:
 *   1. page logic must not change by accident, and
 *   2. some bugs genuinely live in page logic and must be fixable.
 *
 * So page-JS edits are not free-form: every change is a declared patch with an
 * exact find/replace plus a marker proving it is already applied. The build
 * applies them, and validate.mjs recomputes the expected JS the same way and
 * compares - so any UNDECLARED change to page logic still fails the build.
 */
import fs from 'node:fs';
import path from 'node:path';

const BACKTICK = String.fromCharCode(96);
const DQ = String.fromCharCode(34);

export function loadPatches(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      p.file = f;
      for (const key of ['name', 'find', 'replace', 'appliedWhen']) {
        if (typeof p[key] !== 'string' || !p[key]) throw new Error(f + ': missing field ' + key);
      }
      for (const key of ['find', 'replace']) {
        if (p[key].includes(BACKTICK)) throw new Error(f + ': field ' + key + ' contains a backtick');
      }
      return p;
    });
}

const countOf = (text, needle) => text.split(needle).length - 1;

export function applyPatches(text, patches, log) {
  const applied = [];
  const skipped = [];
  let out = text;
  for (const p of patches) {
    const hits = countOf(out, p.find);
    if (hits === 1) {
      out = out.replace(p.find, p.replace);
      applied.push(p.name);
      if (log) log('  patch applied                : ' + p.name);
    } else if (hits === 0) {
      if (!out.includes(p.appliedWhen)) {
        throw new Error(
          'patch ' + p.name + ' (' + p.file + ') matched nothing and its result marker is absent.' + '\n' +
          '      Upstream page logic probably changed. Update ui/patches/' + p.file +
          ', or delete the patch if upstream fixed the issue itself.'
        );
      }
      skipped.push(p.name);
      if (log) log('  patch already in place, skipped: ' + p.name);
    } else {
      throw new Error('patch ' + p.name + ' (' + p.file + ') matched ' + hits + ' times; it must be unique');
    }
  }
  return { text: out, applied, skipped };
}
