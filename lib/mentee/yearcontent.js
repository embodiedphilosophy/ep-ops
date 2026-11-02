// Edits to the words in data/mentee-year.json (the lede, the rhythm, month bullets, the one-to-one how-to, the footer…), kept in a sheet tab so staff can
// change them from the dashboard without a code change. data/mentee-year.json stays the starting text; a row here (path | value) replaces one piece of it.
// A blank value means "back to the original". Steps and each month's theme/focus/reflection date live on the Mentee Schedule / Mentee Months tabs instead.
// Pure (no network): scripts/ops-test/mentee-year.mjs.
export const CONTENT_TAB = 'Mentee Year Content';
export const CONTENT_HEAD = ['path', 'value', 'updated_by', 'updated_at'];
export const MAX_TEXT = 1500;

const PATHS = [
  /^(lede|spacing|footer)$/,
  /^(rhythm|week|months)\.\d+\.(level|note|title|theme|tag|focus)$/,
  /^(rhythm|week|months)\.\d+\.items\.\d+$/,
  /^oneToOne\.note$/,
  /^oneToOne\.(howTo|template)\.\d+$/,
];
export const isEditablePath = p => typeof p === 'string' && PATHS.some(r => r.test(p));

// The text at a path ('months.1.items.0'), or undefined when there is nothing there
export function pathValue(data, path) {
  let cur = data;
  for (const k of String(path).split('.')) { if (cur == null || typeof cur !== 'object' || !(k in cur)) return undefined; cur = cur[k]; }
  return typeof cur === 'string' ? cur : undefined;
}

export const REMOVE = '[remove]';
const MAX_EXTRA = 20; // lines added to a list from Ops: up to this many past the original end
const clean = rows => (rows || []).map(r => ({ path: String(r.path || '').trim(), value: String(r.value ?? '').trim() })).filter(r => isEditablePath(r.path) && r.value);
const parentOf = (data, keys) => { let cur = data; for (const k of keys) { if (cur == null || typeof cur !== 'object' || !(k in cur)) return undefined; cur = cur[k]; } return cur; };

// data with the saved rows laid over it. A row for a path that isn't there (or isn't editable) is ignored; a blank value leaves the original.
// In a list (…items.N, howTo.N, template.N): "[remove]" takes the line out, and N past the end adds a line (in order of N).
export function applyOverrides(data, rows) {
  const out = structuredClone(data), extras = [];
  for (const { path, value } of clean(rows)) {
    const keys = path.split('.'), last = keys.pop(), cur = parentOf(out, keys);
    if (Array.isArray(cur)) {
      const n = Number(last);
      if (n < cur.length) cur[n] = value === REMOVE ? null : value;
      else if (n < cur.length + MAX_EXTRA && value !== REMOVE) extras.push([cur, n, value]);
    } else if (cur && typeof cur[last] === 'string' && value !== REMOVE) cur[last] = value;
  }
  extras.sort((a, b) => a[1] - b[1]).forEach(([arr, , v]) => arr.push(v));
  const prune = o => { if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) if (o[i] === null) o.splice(i, 1); o.forEach(prune); } else if (o && typeof o === 'object') Object.values(o).forEach(prune); };
  prune(out);
  return out;
}

// For the Ops editor: one list as its lines, each with the path it is saved under (the original position, so a removed line never moves
// the others), the text shown, the original text, and whether it was taken out. Added lines come after, then the next free path for "+ Add a line".
export function listView(data, rows, base) {
  const orig = parentOf(data, base.split('.')) || [], saved = Object.fromEntries(clean(rows).filter(r => r.path.startsWith(`${base}.`)).map(r => [r.path, r.value]));
  const lines = orig.map((t, i) => { const path = `${base}.${i}`, v = saved[path]; return { path, text: v && v !== REMOVE ? v : t, original: t, changed: !!v && v !== REMOVE, removed: v === REMOVE }; });
  let n = orig.length;
  for (; n < orig.length + MAX_EXTRA; n++) { const v = saved[`${base}.${n}`]; if (!v) break; if (v !== REMOVE) lines.push({ path: `${base}.${n}`, text: v, original: '', changed: true, removed: false, added: true }); }
  return { lines, next: `${base}.${n}` };
}
// One piece of text (a lede, a title): what is shown and the original
export function textView(data, rows, path) {
  const original = pathValue(data, path) || '', v = (clean(rows).find(r => r.path === path) || {}).value;
  return { path, text: v && v !== REMOVE ? v : original, original, changed: !!v && v !== REMOVE };
}
