// Saving edits from Ops → Mentee year. Everything goes through lib/ops/store.js (logged on the Change Log tab, conflict-checked against `before`).
//   steps  → the Mentee Schedule tab (the mentee page already reads it; the first edit copies the starting steps in, because a filled tab replaces the data file)
//   months → the Mentee Months tab (theme, focus, reflection due date)
//   other words → the Mentee Year Content tab (path | value)
import data from '@/data/mentee-year.json';
import { readPlain, updatePlain, addPlain, createTab, ConflictError } from './store';
import { SCHEDULE_HEAD, MONTHS_HEAD, seedRows, seedMonths } from '../mentee/year';
import { TABS } from '../mentee/content';
import { CONTENT_TAB, CONTENT_HEAD, MAX_TEXT, isEditablePath, pathValue } from '../mentee/yearcontent';

export class EditError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
export { ConflictError };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, max = MAX_TEXT) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

async function tabOrNull(title) { try { return await readPlain(title); } catch { return null; } }

export async function saveText({ path, value }, who) {
  if (!isEditablePath(path) || pathValue(data, path) === undefined) throw new EditError('That piece of text can’t be edited here.');
  const v = clean(value);
  let tab = await tabOrNull(CONTENT_TAB);
  if (!tab) { await createTab(CONTENT_TAB, CONTENT_HEAD, [], { who }); tab = { rows: [] }; }
  const row = tab.rows.find(r => r.values.path === path), stamp = { updated_by: who, updated_at: new Date().toISOString() };
  if (row) { if (row.values.value !== v) await updatePlain(CONTENT_TAB, row.row, { value: v, ...stamp }, { before: { value: row.values.value }, who }); }
  else if (v) await addPlain(CONTENT_TAB, { path, value: v, ...stamp }, { who });
}

export async function saveStep({ id, changes, before = {} }, who) {
  const c = {};
  for (const f of ['title', 'detail', 'evidence', 'date', 'project']) if (f in (changes || {})) c[f] = clean(changes[f], f === 'title' ? 200 : 700);
  if ('title' in c && !c.title) throw new EditError('A step needs a title.');
  if ('date' in c) { if (!DAY.test(c.date)) throw new EditError('Choose a date for this step.'); c.month = c.date.slice(0, 7); }
  if ('project' in c && !['talk', 'offering', 'both'].includes(c.project)) throw new EditError('Choose which project this step belongs to.');
  let tab = await tabOrNull(TABS.schedule);
  if (!tab) { await createTab(TABS.schedule, SCHEDULE_HEAD, seedRows(), { who }); tab = await readPlain(TABS.schedule); }
  else if (!tab.rows.length) { for (const r of seedRows()) await addPlain(TABS.schedule, r, { who }); tab = await readPlain(TABS.schedule); }
  const row = tab.rows.find(r => r.values.step_id === id);
  if (!row) throw new EditError('That step isn’t in the schedule any more. Reload the page.', 404);
  const bf = {}; for (const f of Object.keys(c)) if (f in before) bf[f] = String(before[f] ?? '');
  await updatePlain(TABS.schedule, row.row, c, { before: bf, who });
}

export async function saveMonth({ id, changes, before = {} }, who) {
  const m = data.months.find(x => x.id === id);
  if (!m) throw new EditError('That month isn’t in the year.', 404);
  const c = {};
  for (const f of ['theme', 'focus', 'reflection_due']) if (f in (changes || {})) c[f] = clean(changes[f], 600);
  if (c.reflection_due && !DAY.test(c.reflection_due)) throw new EditError('Choose a date for the reflection.');
  let tab = await tabOrNull(TABS.months);
  if (!tab) { await createTab(TABS.months, MONTHS_HEAD, seedMonths(), { who }); tab = await readPlain(TABS.months); }
  const row = tab.rows.find(r => r.values.month === id);
  if (!row) { const seed = seedMonths().find(x => x.month === id); await addPlain(TABS.months, { ...seed, ...c }, { who }); return; }
  const bf = {}; for (const f of Object.keys(c)) if (f in before) bf[f] = String(before[f] ?? '');
  await updatePlain(TABS.months, row.row, c, { before: bf, who });
}
