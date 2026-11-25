// The onboarding words as saved: the "Onboarding Copy" tab (key, text, updated_by, updated_at) over the defaults in
// teachcopy-defaults.js. Edited in Ops → Faculty → Onboarding; every save goes through store.js (Change Log).
import { readPlain, addPlain, updatePlain, createTab } from './ops/store';
import { COPY, DEFAULTS } from './teachcopy-defaults';

export const COPY_TAB = 'Onboarding Copy';
const COLS = ['key', 'text', 'updated_by', 'updated_at'];

// → { key: text } with every key present (the saved text, or the default)
export async function loadCopy({ light = true } = {}) {
  const rows = await readPlain(COPY_TAB, { light }).then(t => t.rows).catch(() => []);
  const saved = Object.fromEntries(rows.filter(r => DEFAULTS[r.values.key] !== undefined && String(r.values.text).trim()).map(r => [r.values.key, r.values.text]));
  return { ...DEFAULTS, ...saved };
}

// Save one key; a blank text (or the default itself) brings the default back
export async function saveCopy(key, text, who) {
  if (!COPY.some(c => c[0] === key)) throw new Error('Not a part of onboarding that can be edited');
  const v = String(text ?? '').replace(/\r/g, '').trim().slice(0, 2000);
  let t = await readPlain(COPY_TAB).catch(() => null);
  if (!t) { await createTab(COPY_TAB, COLS, [], { who }); t = await readPlain(COPY_TAB); }
  const row = t.rows.find(r => r.values.key === key), keep = v && v !== DEFAULTS[key] ? v : '';
  const values = { text: keep, updated_by: who, updated_at: new Date().toISOString() };
  if (row) await updatePlain(COPY_TAB, row.row, values, { who });
  else if (keep) await addPlain(COPY_TAB, { key, ...values }, { who });
  return keep || DEFAULTS[key];
}
