import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { readRows, updateRows, nextIds, ensureColumns, TABLES, ConflictError } from '@/lib/ops/store';
import { readRange, toObjects } from '@/lib/google';
import { loadCalendar } from '@/lib/calendar';
import { FIELDS, check } from '@/lib/ops/eventfields';
import { PROGRAM_COLS, CADENCES, sessionDates, publicTitle, seriesSlug, sessionName } from '@/lib/ops/programs';
import { groupKey } from '@/lib/ops/templates/facts';
import { refreshSite } from '@/lib/ops/refresh';
import { todayET } from '@/lib/events';

// This Week at EP → the Master Schedule. Everything the Sunday post shows about an event is saved where it lives
// (Schedule + Event Details on EP-Programming-Calendar), so the website, newsletter and next week's post all get
// the fix. An event that repeats (same Series, else same track and name) can be fixed for its later sessions too.
export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^E\d{3,}$/;
const THIS_WEEK = 'This Week';
const fail = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
const field = key => FIELDS.find(f => f.key === key);
const clean = v => String(v ?? '').trim();

async function editor() {
  const user = await currentUser();
  if (!user) return [null, fail('Please sign in again', 401)];
  if (!canEditEvents(user)) return [null, fail('Only Jacob, Irene and Floss can change the schedule', 403)];
  return [user];
}
const tracksOf = async () => toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:T50"))
  .filter(r => r.track).map(r => ({ track: String(r.track).toUpperCase(), name: r.public_title || r.program || '', time: r.time || '' }));

// GET ?what=tracks → the tracks an added event can go on
export async function GET(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  if (new URL(req.url).searchParams.get('what') !== 'tracks') return fail('Unknown request');
  try { return NextResponse.json({ tracks: await tracksOf() }); }
  catch (e) { console.error('Tracks read failed', e.message); return fail('Couldn’t read the tracks', 502); }
}

// POST { action: 'save', id: 'E123', scope: 'one' | 'later', changes: { title, program_name, module, time, line, label, this_week }, before: { same keys, as shown } }
//      { action: 'add', kind: 'one-off' | 'recurring' | 'course', name, track, date, time?, teachers?, label?, line?, every?, until?, modules?: [title] }
export async function POST(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const body = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (body.action === 'save') return await save(body, who);
    if (body.action === 'add') return await add(body, who);
    return fail('Unknown action');
  } catch (e) {
    if (e instanceof ConflictError) return fail('Someone else changed this event since you opened the page. Rebuild from schedule and try again.', 409);
    console.error('This Week save failed', body.action, e.message);
    return fail(/^Sheets|^Google/.test(e.message) ? 'Could not save to the schedule. Try again shortly.' : e.message, 502);
  }
}

// What the page showed, from the calendar, so the conflict check compares like with like
const shown = e => ({ title: e.title, program_name: e.program_name, module: e.module_title, time: e.time, line: e.note, label: e.parent_program || e.host_label || '', this_week: e.this_week || '' });

async function save({ id, scope = 'one', changes = {}, before = {} }, who) {
  if (!ID.test(String(id))) return fail('Unknown event');
  const cal = await loadCalendar({ fresh: true });
  const ev = cal.find(e => e.sched_id === id);
  if (!ev) return fail(`${id} isn’t on the Master Schedule`, 404);
  // Conflict check against the values the page showed
  const now = shown(ev);
  const moved = Object.keys(changes).filter(k => k in before && clean(before[k]) !== clean(now[k]));
  if (moved.length) return fail('Someone else changed this event since you opened the page. Rebuild from schedule and try again.', 409);
  // The sessions this save reaches: just this one, or this and the later ones of the same series / repeating name
  const rows = scope === 'later' ? cal.filter(e => e.sched_id && groupKey(e) === groupKey(ev) && e.date >= ev.date) : [ev];
  const program = !!ev.program_name;
  const det = Object.fromEntries(rows.map(e => [e.sched_id, {}])), sched = Object.fromEntries(rows.map(e => [e.sched_id, {}]));
  const errors = {};
  const text = (k, v, max) => { const s = clean(v).replace(/\s*\n\s*/g, ' '); if (s.length > max) errors[k] = `Keep it under ${max} characters`; return s; };

  if ('program_name' in changes && program) {
    const v = text('program_name', changes.program_name, 100);
    if (!v) errors.program_name = 'The program needs a title';
    // The program's title is one for the whole program (as in Programming), so it goes on every session of the series
    for (const e of cal.filter(x => x.sched_id && x.series && x.series === ev.series)) Object.assign(det[e.sched_id] ||= {}, { 'Program Name': v, 'Public Title': publicTitle(v, e.sched_id === id && 'module' in changes ? clean(changes.module) : e.module_title) });
  }
  if ('module' in changes && program) {
    const m = text('module', changes.module, 120), name = 'program_name' in changes ? clean(changes.program_name) : ev.program_name;
    Object.assign(det[id], { 'Module Title': m, 'Public Title': publicTitle(name, m) });
  }
  if ('title' in changes && !program) {
    const v = text('title', changes.title, 120);
    if (!v) errors.title = 'Give it a title';
    for (const e of rows) det[e.sched_id]['Public Title'] = v;
  }
  if ('time' in changes) {
    const raw = clean(changes.time), r = check(field('Time'), raw && !/ET$/i.test(raw) ? `${raw} ET` : raw);
    if (r.error) errors.time = r.error; else for (const e of rows) sched[e.sched_id].Time = r.value;
  }
  if ('line' in changes) { const v = text('line', changes.line, 160); for (const e of rows) det[e.sched_id]['Public Note'] = v; }
  if ('label' in changes) { const v = text('label', changes.label, 60); for (const e of rows) det[e.sched_id][program ? 'Parent Program' : 'Host Label'] = v; }
  if ('this_week' in changes) {
    const v = clean(changes.this_week).toLowerCase();
    if (!['', 'show', 'hide'].includes(v)) errors.this_week = 'Pick when it shows';
    for (const e of rows) det[e.sched_id][THIS_WEEK] = v;
  }
  if (Object.keys(errors).length) return fail('Some fields need fixing', 400, { errors });

  const detRows = Object.entries(det).filter(([, c]) => Object.keys(c).length).map(([id, changes]) => ({ id, changes }));
  const schedRows = Object.entries(sched).filter(([, c]) => Object.keys(c).length).map(([id, changes]) => ({ id, changes }));
  const cols = [...new Set(detRows.flatMap(r => Object.keys(r.changes)))].filter(c => [...PROGRAM_COLS, THIS_WEEK].includes(c));
  if (cols.length) await ensureColumns(TABLES.details.title, cols, { headerRow: TABLES.details.headerRow });
  const written = [
    ...(schedRows.length ? await updateRows('schedule', schedRows, { who }) : []),
    // Older events may not have an Event Details row yet: add it
    ...(detRows.length ? await updateRows('details', detRows, { who, create: true }) : []),
  ];
  if (written.length) refreshSite();
  const n = rows.length;
  return NextResponse.json({ ok: true, written: written.length,
    message: !written.length ? 'Nothing to save.' : n > 1 ? `Saved to the schedule for this session and the ${n - 1} after it.` : 'Saved to the schedule.' });
}

// An event that wasn't on the schedule: a one-off (one row), a recurring event (the same title every time) or a
// course (one module title per session). Recurring events and courses are programs: the rows share a Series and
// show in Programming, so a fix to one can reach the rest. All of them are marked to show in This Week at EP.
async function add({ kind = 'one-off', name, track, date, time = '', teachers = '', label = '', line = '', every = 'weekly', until = '', modules = [] }, who) {
  const tracks = (await tracksOf()).map(t => t.track), T = clean(track).toUpperCase(), title = clean(name);
  if (!['one-off', 'recurring', 'course'].includes(kind)) return fail('Is it a one-off, a recurring event or a course?');
  if (!title || title.length > 100) return fail('Give it a title (up to 100 characters)');
  if (!tracks.includes(T)) return fail(`Pick a track (${tracks.join(', ')})`);
  if (!DATE.test(String(date)) || isNaN(Date.parse(date))) return fail('Pick the date');
  if (date < todayET()) return fail('The date needs to be today or later');
  const tm = check(field('Time'), clean(time) && !/ET$/i.test(clean(time)) ? `${clean(time)} ET` : clean(time)); if (tm.error) return fail(tm.error);
  const people = check(field('Teachers & Hosts'), teachers).value;
  const lbl = clean(label).slice(0, 60), note = clean(line).replace(/\s*\n\s*/g, ' ').slice(0, 160);

  let dates = [date], mods = [];
  if (kind === 'course') {
    mods = (Array.isArray(modules) ? modules : String(modules).split('\n')).map(clean).filter(Boolean);
    if (!mods.length) return fail('Write the module titles, one per line');
    if (mods.length > 60) return fail('Up to 60 modules');
    if (mods.some(m => m.length > 120)) return fail('Keep each module title under 120 characters');
  }
  if (kind !== 'one-off') {
    if (!CADENCES.some(c => c.value === every)) return fail('Pick how often it meets');
    if (kind === 'recurring') {
      if (!DATE.test(String(until)) || until <= date) return fail('Pick the date of the last session (after the first)');
      dates = sessionDates(date, 61, every).filter(d => d <= until);
      if (dates.length > 60) return fail('Up to 60 sessions at a time. Pick an earlier last date.');
    } else dates = sessionDates(date, mods.length, every);
  }

  // A new series name (never merging into another program)
  let series = '';
  if (kind !== 'one-off') {
    const used = new Set((await readRows('details')).map(r => clean(r.fields.Series)));
    const base = seriesSlug(`${title}-${date.slice(0, 7)}`) || 'program';
    series = base; for (let i = 2; used.has(series); i++) series = `${base}-${i}`;
  }
  const ids = await nextIds('schedule', dates.length);
  await ensureColumns(TABLES.details.title, kind === 'one-off' ? [THIS_WEEK] : [...PROGRAM_COLS, THIS_WEEK], { headerRow: TABLES.details.headerRow });
  await updateRows('schedule', ids.map((id, i) => ({ id, changes: {
    Date: dates[i], Track: T, Event: kind === 'one-off' ? title : sessionName(title, i + 1), 'Teachers & Hosts': people, Time: tm.value, Status: 'Not started',
  } })), { who, create: true, dates: ['Date'] });
  await updateRows('details', ids.map((id, i) => ({ id, changes: {
    'Public Title': kind === 'course' ? publicTitle(title, mods[i]) : title, [THIS_WEEK]: 'show',
    ...(note ? { 'Public Note': note } : {}),
    ...(kind === 'one-off' ? (lbl ? { 'Host Label': lbl } : {}) : { Series: series, 'Program Name': title, ...(lbl ? { 'Parent Program': lbl } : {}) }),
    ...(kind === 'course' ? { 'Module Title': mods[i] } : {}),
  } })), { who, create: true });
  refreshSite();
  const span = dates.length > 1 ? `${dates.length} sessions, ${dates[0]} to ${dates.at(-1)}` : `on ${dates[0]}`;
  return NextResponse.json({ ok: true, ids, series, message: `Added to the Master Schedule: ${title}, ${span}. It shows in This Week at EP from now on; finish its details (link, price, teachers’ emails) in Programming.` });
}
