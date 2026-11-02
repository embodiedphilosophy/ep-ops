// Editing the mentee year from Ops → Mentee year: project steps and mentee tasks (Mentee Schedule tab) and each month's
// theme and focus (Mentee Months tab). What is saved here is what mentees see on their page (ep-website reads the same tabs).
// Every write goes through lib/ops/store.js. checkItem/checkMonth/newId are pure (scripts/ops-test/mentee-year-edit.mjs).
import { readPlain, updatePlain, addPlain, addPlainRows, createTab, ensureColumns } from './store';
import { TABS } from '../mentee/content';
import { SCHEDULE_HEAD, MONTHS_HEAD, SEASON, seedRows, seedMonths, slug } from '../mentee/year';
import data from '../../data/mentee-year.json';
import { ROWS_TAB, ROWS_HEAD } from '../mentee/monthlist';


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

// ---- the month list (lib/mentee/monthlist.js): words, dates and links of its rows, the reflection date, the books ----
const ROW_KEY = /^(immersion-\d+|note-(immersion|book)-\d+|buddy|one-to-one|reflection)$/;
const okDay = v => !v || (DAY.test(v) && !isNaN(Date.parse(v)));

// { month, row, title, line, date, end, link } → { values } or { errors }
export function checkRow(b) {
  const errors = {}, month = String(b.month || ''), row = String(b.row || '');
  if (!data.months.some(m => m.id === month)) errors.month = 'Unknown month';
  if (!ROW_KEY.test(row)) errors.row = 'This row can’t be changed here';
  const values = { month, row, title: one(b.title, 140), line: String(b.line ?? '').trim().slice(0, 600), date: String(b.date || '').trim(), end: String(b.end || '').trim(), link: String(b.link || '').trim(), sat_link: String(b.sat_link || '').trim(), sun_link: String(b.sun_link || '').trim() };
  if (!okDay(values.date)) errors.date = 'Pick a date';
  if (!okDay(values.end)) errors.end = 'Pick a date';
  if (values.date && values.end && values.end < values.date) errors.end = 'After the first date';
  for (const k of ['link', 'sat_link', 'sun_link']) if (values[k] && !/^https:\/\/\S+$/.test(values[k])) errors[k] = 'A full link starting with https://';
  return Object.keys(errors).length ? { errors } : { values };
}

async function plainTab(title, head, who) {
  try { const tb = await readPlain(title); await ensureColumns(title, head.filter(h => !tb.head.some(x => x.toLowerCase() === h))); return tb; }
  catch (e) {
    if (!/\(400\)|: 400|Unable to parse range|not found/i.test(e.message)) throw e;
    await createTab(title, head, [], { who });
    return readPlain(title);
  }
}

// Upsert one Mentee Month Rows row. hide/show switch it off or on the mentees' page; everything else keeps what it had unless given.
export async function saveRow({ values, hide = false, show = false, who }) {
  const tb = await plainTab(ROWS_TAB, ROWS_HEAD, who), now = new Date().toISOString();
  const hit = tb.rows.find(r => r.values.month === values.month && r.values.row === values.row);
  const changes = hide ? { publish: 'FALSE' } : show ? { publish: 'TRUE' } : { title: values.title, line: values.line, date: values.date, end: values.end, link: values.link, ...(values.row.startsWith('immersion-') ? { sat_link: values.sat_link, sun_link: values.sun_link } : {}) };
  if (hit) await updatePlain(ROWS_TAB, hit.row, { ...changes, updated_by: who, updated_at: now }, { before: { month: values.month, row: values.row }, who });
  else await addPlain(ROWS_TAB, { month: values.month, row: values.row, publish: hide ? 'FALSE' : 'TRUE', ...changes, updated_by: who, updated_at: now }, { who });
}

// The reflection's due date lives on Mentee Months (reflection_due), its words on Mentee Month Rows
export async function saveReflection({ month, due, title, line, who }) {
  if (!okDay(due)) throw new Error('Pick a due date');
  let tb;
  try { tb = await readPlain(TABS.months); }
  catch (e) {
    if (!/\(400\)|: 400|Unable to parse range|not found/i.test(e.message)) throw e;
    await createTab(TABS.months, MONTHS_HEAD, seedMonths(), { who });
    tb = await readPlain(TABS.months);
  }
  const hit = tb.rows.find(r => r.values.month === month);
  if (hit) await updatePlain(TABS.months, hit.row, { reflection_due: due || '' }, { before: { month }, who });
  else await addPlain(TABS.months, { ...(seedMonths().find(m => m.month === month) || { month }), reflection_due: due || '', publish: 'TRUE' }, { who });
  await saveRow({ values: { month, row: 'reflection', title: one(title, 140), line: String(line ?? '').trim().slice(0, 600), date: '', end: '', link: '' }, who });
}

// A book on the reading list (Mentee Books): change one (found by the title and start date it had), add one to a month, or take it off the list
export const BOOK_HEAD = ['month', 'starts', 'theme', 'kind', 'title', 'author', 'audio', 'note', 'search', 'asin', 'publish'];
export function checkBook(b) {
  const errors = {}, values = { title: one(b.title, 160), author: one(b.author, 120), note: one(b.note, 300), kind: b.kind === 'suggested' ? 'suggested' : 'required', starts: String(b.starts || '').trim() };
  if (!values.title) errors.title = 'The book’s title';
  if (!DAY.test(values.starts) || isNaN(Date.parse(values.starts))) errors.starts = 'The date the month’s reading starts';
  return Object.keys(errors).length ? { errors } : { values };
}
export async function saveBook({ month, original = null, values = {}, hide = false, who }) {
  const tb = await plainTab(TABS.books, BOOK_HEAD, who);
  if (original) {
    const hit = tb.rows.find(r => r.values.title === original.title && r.values.starts === original.starts);
    if (!hit) throw new Error('That book isn’t on the reading list any more. Reload the page.');
    await updatePlain(TABS.books, hit.row, hide ? { publish: 'FALSE' } : values, { before: { title: original.title, starts: original.starts }, who });
    return;
  }
  // a new book joins its month: the same month number and theme as the month's other books, else the next number
  const same = tb.rows.find(r => String(r.values.starts || '').slice(0, 7) === values.starts.slice(0, 7));
  const n = same ? same.values.month : String(Math.max(0, ...tb.rows.map(r => Number(r.values.month) || 0)) + 1);
  const theme = same ? same.values.theme : ((data.months.find(m => m.id === month) || {}).theme || '');
  await addPlain(TABS.books, { month: n, theme, publish: 'TRUE', ...values }, { who });
}

// The order of a month's list (the same order on the mentee page in Circle and on /school/mentee-year): a Mentee Month Rows row, row = _order
export function checkOrder(b) {
  const month = String(b.month || ''), keys = (Array.isArray(b.keys) ? b.keys : []).map(k => String(k).trim()).filter(Boolean);
  if (!data.months.some(m => m.id === month)) return { errors: { month: 'Unknown month' } };
  if (!keys.length || keys.length > 40 || keys.some(k => !/^[a-z0-9-]{1,80}$/.test(k))) return { errors: { keys: 'That order can’t be saved' } };
  return { values: { month, keys: [...new Set(keys)] } };
}
export async function saveOrder({ values, who }) {
  const tb = await plainTab(ROWS_TAB, ROWS_HEAD, who), now = new Date().toISOString(), line = values.keys.join(',');
  const hit = tb.rows.find(r => r.values.month === values.month && r.values.row === '_order');
  if (hit) await updatePlain(ROWS_TAB, hit.row, { line, updated_by: who, updated_at: now }, { before: { month: values.month, row: '_order' }, who });
  else await addPlain(ROWS_TAB, { month: values.month, row: '_order', line, publish: 'TRUE', updated_by: who, updated_at: now }, { who });
}
