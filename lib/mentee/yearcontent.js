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

// data with the saved rows laid over it. A row for a path that isn't there (or isn't editable) is ignored; a blank value leaves the original.
export function applyOverrides(data, rows) {
  const out = structuredClone(data);
  for (const r of rows || []) {
    const path = String(r.path || '').trim(), value = String(r.value ?? '');
    if (!isEditablePath(path) || !value.trim() || pathValue(out, path) === undefined) continue;
    const keys = path.split('.'), last = keys.pop();
    let cur = out; for (const k of keys) cur = cur[k];
    cur[last] = value.trim();
  }
  return out;
}
