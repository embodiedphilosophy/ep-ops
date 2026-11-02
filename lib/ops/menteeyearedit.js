// Editing the mentee year from Ops → Mentee year: project steps and mentee tasks (Mentee Schedule tab) and each month's
// theme and focus (Mentee Months tab). What is saved here is what mentees see on their page (ep-website reads the same tabs).
// Every write goes through lib/ops/store.js. checkItem/checkMonth/newId are pure (scripts/ops-test/mentee-year-edit.mjs).
import { readPlain, updatePlain, addPlain, addPlainRows, createTab, ensureColumns } from './store';
import { TABS } from '../mentee/content';
import { SCHEDULE_HEAD, MONTHS_HEAD, SEASON, seedRows, seedMonths, slug } from '../mentee/year';
import data from '../../data/mentee-year.json';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FIRST = data.months[0].id, LAST = data.months[data.months.length - 1].id;
const one = (v, max) => String(v ?? '').replace(/\s*\n\s*/g, ' ').trim().slice(0, max);

// → { values } or { errors: { field: message } }. kind: 'step' | 'task'
export function checkItem(kind, b) {
  const errors = {}, values = {};
  const date = String(b.date || '').trim();
  if (!DAY.test(date) || isNaN(Date.parse(date))) errors.date = 'Pick a date';
  else if (date.slice(0, 7) < FIRST || date.slice(0, 7) > LAST) errors.date = `Inside the year, ${FIRST.slice(0, 4)}–${LAST.slice(0, 4)} (October to July)`;
  values.date = date;
  values.title = one(b.title, 140);
  if (!values.title) errors.title = 'Give it a title';
  values.detail = String(b.detail ?? '').trim().slice(0, 1200);
  if (kind === 'step') {
    values.project = ['talk', 'offering', 'both'].includes(b.project) ? b.project : '';
    if (!values.project) errors.project = 'Which project?';
    values.evidence = one(b.evidence, 200);
  } else {
    const link = String(b.link || '').trim();
    if (link && !/^https:\/\/\S+$/.test(link)) errors.link = 'A full link starting with https://';
    values.link = link;
  }
  return Object.keys(errors).length ? { errors } : { values };
}

export function checkMonth(b) {
  const month = String(b.month || '');
  if (!data.months.some(m => m.id === month)) return { errors: { month: 'Unknown month' } };
  return { values: { month, theme: one(b.theme, 160), focus: String(b.focus ?? '').trim().slice(0, 600) } };
}

// A new row's id: t-2026-11-read-the-prepare-lesson (tasks) or s-… (steps), never one already used
export function newId(kind, date, title, used) {
  const base = `${kind === 'task' ? 't' : 's'}-${date.slice(0, 7)}-${slug(title) || 'item'}`;
  let id = base; for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

// The Schedule tab, made (or filled with the seeded steps and review checks) before the first edit, so editing one step never
// leaves the others behind. Returns the fresh table.
async function schedule(who) {
  let tb;
  try { tb = await readPlain(TABS.schedule); }
  catch (e) {
    if (!/\(400\)|: 400|Unable to parse range|not found/i.test(e.message)) throw e;
    await createTab(TABS.schedule, SCHEDULE_HEAD, seedRows(), { who });
    return readPlain(TABS.schedule);
  }
  await ensureColumns(TABS.schedule, SCHEDULE_HEAD.filter(h => !tb.head.some(x => x.toLowerCase() === h)));
  const kinds = new Set(tb.rows.map(r => r.values.step_id && (r.values.kind || 'step')).filter(Boolean));
  const missing = seedRows().filter(r => !kinds.has(r.kind));
  if (missing.length) await addPlainRows(TABS.schedule, missing, { who, label: `${missing.length} seeded steps and review checks` });
  return readPlain(TABS.schedule);
}

const pick = (v, keys) => Object.fromEntries(keys.map(k => [k, String(v[k] ?? '')]));

/**
 * Save one step or task. { kind, id? (omit to add), values (checked), before? (the fields as the editor showed them), hide?, show? }
 * A row whose shown fields changed in the sheet meanwhile is refused (ConflictError from the store).
 */
export async function saveItem({ kind, id, values = {}, before = null, hide = false, show = false, who }) {
  const tb = await schedule(who);
  if (!id) {
    const used = new Set(tb.rows.map(r => r.values.step_id));
    const sameDay = tb.rows.filter(r => (r.values.kind || 'step') === kind && r.values.date === values.date).length;
    const row = { step_id: newId(kind, values.date, values.title, used), season: SEASON, month: values.date.slice(0, 7), kind, review: '', order: String(100 + sameDay), publish: 'TRUE', project: kind === 'task' ? '' : values.project, ...values };
    await addPlain(TABS.schedule, row, { who });
    return { id: row.step_id };
  }
  const hit = tb.rows.find(r => r.values.step_id === id);
  if (!hit || (hit.values.kind || 'step') !== kind) throw new Error('That item isn’t in the schedule any more. Reload the page.');
  const changes = hide ? { publish: 'FALSE' } : show ? { publish: 'TRUE' } : { ...values, month: values.date.slice(0, 7) };
  const check = { step_id: id, ...(before ? pick(before, Object.keys(values)) : {}) };
  await updatePlain(TABS.schedule, hit.row, changes, { before: check, who });
  return { id };
}

// One month's theme and focus (a missing Months tab is made from the seed first)
export async function saveMonth({ values, who }) {
  let tb;
  try { tb = await readPlain(TABS.months); }
  catch (e) {
    if (!/\(400\)|: 400|Unable to parse range|not found/i.test(e.message)) throw e;
    await createTab(TABS.months, MONTHS_HEAD, seedMonths(), { who });
    tb = await readPlain(TABS.months);
  }
  const hit = tb.rows.find(r => r.values.month === values.month);
  if (hit) await updatePlain(TABS.months, hit.row, { theme: values.theme, focus: values.focus }, { before: { month: values.month }, who });
  else {
    const seed = seedMonths().find(m => m.month === values.month) || {};
    await addPlain(TABS.months, { ...seed, ...values, publish: 'TRUE' }, { who });
  }
}
