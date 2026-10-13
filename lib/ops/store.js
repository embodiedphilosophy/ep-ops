import { readRange, writeCells, appendRows, writeRange, addTab, ensureRows, colLetter } from '../google';
import { socialSheetId } from '../social';

// The one way the dashboard writes to EP-Programming-Calendar. The sheet is the hidden source of truth for
// the website, Zoom, reminders and the dashboard, so every write:
//   - finds columns by their header name, never by position (moving a column can't misplace a value)
//   - refuses columns filled by formulas (e.g. Event Details' Date/Track/Event, which come from Schedule)
//   - refuses a change when the cell was edited by someone else since the editor opened it
//   - is recorded on the Change Log tab (the sheet's own history only shows the website's service account)
const SHEET = () => process.env.CALENDAR_SHEET_ID;
// Plain tables can live in another spreadsheet: 'social' is the EP Social Engine (Make publishes from it).
// Their changes are still logged on the calendar sheet's one Change Log.
const sheetOf = s => s === 'social' ? socialSheetId() : (s || SHEET());
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const find = (head, name) => head.findIndex(h => h.toLowerCase() === String(name).trim().toLowerCase());

// Tabs the dashboard edits: the row holding the headers, and the column that identifies a row
export const TABLES = {
  schedule: { title: 'Schedule', headerRow: 4, key: 'ID' },
  details: { title: 'Event Details', headerRow: 4, key: 'ID' },
};
const LOG = { title: 'Change Log', head: ['when', 'who', 'tab', 'id', 'field', 'from', 'to'] };

// light: for showing only. One read, through the 5-minute cache (which every save expires), without the
// formula check. Saves always do the full fresh read. Google allows ~60 reads a minute.
async function readTable(t, sheet, { light = false } = {}) {
  const range = `'${t.title}'!A${t.headerRow}:AZ3000`;
  const [vals, forms] = light
    ? [await readRange(sheetOf(sheet), range), []]
    : await Promise.all([
      readRange(sheetOf(sheet), range, { fresh: true }),
      readRange(sheetOf(sheet), range, { fresh: true, render: 'FORMULA' }),
    ]);
  const head = (vals[0] || []).map(h => String(h).trim());
  // A column whose header cell is a formula (an ARRAYFORMULA filling the column) is computed
  const computedCols = new Set(head.map((_, i) => i).filter(i => String(forms[0]?.[i] ?? '').startsWith('=')));
  const k = t.key ? find(head, t.key) : -1;
  if (t.key && k < 0) throw new Error(`The ${t.title} tab has no "${t.key}" column`);
  return { head, computedCols, vals: vals.slice(1), forms: forms.slice(1), k };
}

// The next free ID on a keyed tab: E182 after E181
export async function nextId(table, prefix = 'E') {
  const t = TABLES[table], tb = await readTable(t);
  const max = Math.max(0, ...tb.vals.map(r => Number(String(r[tb.k] ?? '').replace(prefix, '')) || 0));
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// One row as { header: value }, plus which headers can't be edited. null when the ID isn't on the tab.
export async function getRow(table, id) {
  const t = TABLES[table], tb = await readTable(t);
  const i = tb.vals.findIndex(r => same(r[tb.k], id));
  if (i < 0) return null;
  const fields = Object.fromEntries(tb.head.filter(Boolean).map(h => [h, String(tb.vals[i][find(tb.head, h)] ?? '')]));
  const locked = tb.head.filter((h, c) => h && (tb.computedCols.has(c) || String(tb.forms[i]?.[c] ?? '').startsWith('=')));
  return { fields, locked, row: t.headerRow + 1 + i };
}

export class ConflictError extends Error {
  constructor(fields, current) { super(`Changed by someone else since you opened it: ${fields.join(', ')}`); this.fields = fields; this.current = current; }
}

// Change some cells of the row whose key column equals `id`.
//   changes: { header: newValue }   before: { header: value the editor was showing } (conflict check)
//   create: add the row (with its ID) when it isn't there yet
//   dates: fields written as real dates (the Schedule's Date column holds dates, not text)
// Returns the list of { field, from, to } actually written.
export async function updateRow(table, id, changes, { before = {}, who = '', create = false, dates = [] } = {}) {
  const t = TABLES[table], tb = await readTable(t);
  let i = tb.vals.findIndex(r => same(r[tb.k], id));
  if (i < 0 && !create) throw new Error(`${id} isn't on the ${t.title} tab`);
  const cur = i < 0 ? [] : tb.vals[i];
  const writes = [], conflicts = [];
  for (const [field, value] of Object.entries(changes)) {
    const c = find(tb.head, field);
    if (c < 0) throw new Error(`The ${t.title} tab has no "${field}" column`);
    if (tb.computedCols.has(c) || (i >= 0 && String(tb.forms[i]?.[c] ?? '').startsWith('='))) throw new Error(`"${field}" is filled in automatically and can't be edited here`);
    const from = String(cur[c] ?? '');
    if (field in before && !same(before[field], from)) { conflicts.push(field); continue; }
    if (!same(from, value)) writes.push({ field, c, from, to: String(value ?? '').trim() });
  }
  if (conflicts.length) throw new ConflictError(conflicts, Object.fromEntries(conflicts.map(f => [f, String(cur[find(tb.head, f)] ?? '')])));
  if (!writes.length) return [];

  if (i < 0) {
    // New row under the last one, with its ID and the given fields
    const asDate = w => dates.includes(w.field);
    const line = tb.head.map((h, c) => c === tb.k ? id : (writes.find(w => w.c === c && !asDate(w))?.to ?? ''));
    const row = t.headerRow + 1 + tb.vals.length;
    await writeRange(SHEET(), `'${t.title}'!A${row}:${colLetter(tb.head.length - 1)}${row}`, [line.map((v, c) => tb.computedCols.has(c) ? null : v)]);
    const dw = writes.filter(asDate);
    if (dw.length) await writeCells(SHEET(), dw.map(w => ({ range: `'${t.title}'!${colLetter(w.c)}${row}`, value: w.to })), { typed: true });
  } else {
    const row = t.headerRow + 1 + i, plain = writes.filter(w => !dates.includes(w.field)), dw = writes.filter(w => dates.includes(w.field));
    if (plain.length) await writeCells(SHEET(), plain.map(w => ({ range: `'${t.title}'!${colLetter(w.c)}${row}`, value: w.to })));
    if (dw.length) await writeCells(SHEET(), dw.map(w => ({ range: `'${t.title}'!${colLetter(w.c)}${row}`, value: w.to })), { typed: true });
  }
  await logChanges(writes.map(w => [new Date().toISOString(), who, t.title, id, w.field, w.from, w.to]));
  return writes.map(({ field, from, to }) => ({ field, from, to }));
}

// Best effort: a failed log line never undoes a saved change, but it is reported in the server log
async function logChanges(lines) {
  if (!lines.length) return;
  const append = () => appendRows(SHEET(), `'${LOG.title}'!A1`, lines);
  try { await append(); }
  catch {
    try { await addTab(SHEET(), LOG.title); await writeRange(SHEET(), `'${LOG.title}'!A1:G1`, [LOG.head]); await append(); }
    catch (e) { console.error('Change Log write failed', e.message); }
  }
}

// ---------- plain tables (headers in row 1, no ID column): the website content tabs ----------
// Rows are addressed by sheet row number, and every save re-checks the WHOLE row against what the editor
// showed, so a row inserted, sorted or edited in the meantime is never overwritten by mistake.
const tabLabel = (title, sheet) => sheet === 'social' ? `Social: ${title}` : title;

export async function readPlain(title, { sheet, light = false } = {}) {
  const tb = await readTable({ title, headerRow: 1, key: null }, sheet, { light });
  return {
    head: tb.head,
    locked: tb.head.filter((h, c) => tb.computedCols.has(c)),
    rows: tb.vals.map((r, i) => ({ row: i + 2, values: Object.fromEntries(tb.head.map((h, c) => [h, String(r[c] ?? '')])) }))
      .filter(r => Object.values(r.values).some(v => v.trim())),
  };
}

export async function updatePlain(title, row, changes, { before = {}, who = '', sheet } = {}) {
  const tb = await readTable({ title, headerRow: 1, key: null }, sheet);
  const cur = tb.vals[row - 2] || [];
  const conflicts = tb.head.filter((h, c) => h && h in before && !same(before[h], cur[c]));
  if (conflicts.length) throw new ConflictError(conflicts, Object.fromEntries(tb.head.map((h, c) => [h, String(cur[c] ?? '')])));
  const writes = [];
  for (const [field, value] of Object.entries(changes)) {
    const c = find(tb.head, field);
    if (c < 0) throw new Error(`The ${title} tab has no "${field}" column`);
    if (tb.computedCols.has(c) || String(tb.forms[row - 2]?.[c] ?? '').startsWith('=')) throw new Error(`"${field}" is filled in automatically and can't be edited here`);
    if (!same(cur[c], value)) writes.push({ field, c, from: String(cur[c] ?? ''), to: String(value ?? '').trim() });
  }
  if (!writes.length) return [];
  await writeCells(sheetOf(sheet), writes.map(w => ({ range: `'${title}'!${colLetter(w.c)}${row}`, value: w.to })));
  const label = String(cur[0] ?? '').slice(0, 60) || `row ${row}`;
  await logChanges(writes.map(w => [new Date().toISOString(), who, tabLabel(title, sheet), label, w.field, w.from, w.to]));
  return writes.map(({ field, from, to }) => ({ field, from, to }));
}

// A new row under the last one (only the given columns are filled)
export async function addPlain(title, values, { who = '', sheet } = {}) {
  const tb = await readTable({ title, headerRow: 1, key: null }, sheet);
  const row = tb.vals.length + 2;
  const line = tb.head.map((h, c) => tb.computedCols.has(c) ? null : String(values[h] ?? '').trim());
  await ensureRows(sheetOf(sheet), title, row);
  await writeRange(sheetOf(sheet), `'${title}'!A${row}:${colLetter(tb.head.length - 1)}${row}`, [line]);
  await logChanges(Object.entries(values).filter(([, v]) => String(v ?? '').trim()).map(([f, v]) => [new Date().toISOString(), who, tabLabel(title, sheet), `new row ${row}`, f, '', String(v).trim()]));
  return row;
}

// A header the dashboard needs but the tab doesn't have yet (e.g. done_when on Task Templates): put it in
// the first empty header cell after the last header (row 1, or headerRow for Schedule / Event Details)
export async function ensureColumns(title, names, { headerRow = 1 } = {}) {
  const r = headerRow;
  const head = ((await readRange(SHEET(), `'${title}'!A${r}:AZ${r}`, { fresh: true }))[0] || []).map(h => String(h).trim());
  const missing = names.filter(n => find(head, n) < 0);
  if (!missing.length) return [];
  let c = head.length;
  await writeCells(SHEET(), missing.map(n => ({ range: `'${title}'!${colLetter(c++)}${r}`, value: n })));
  await logChanges(missing.map(n => [new Date().toISOString(), 'dashboard', title, `header row ${r}`, n, '', 'new column']));
  return missing;
}

// Make a missing tab with its header row
export async function createTab(title, head) {
  await addTab(SHEET(), title);
  await writeRange(SHEET(), `'${title}'!A1:${colLetter(head.length - 1)}1`, [head]);
}
