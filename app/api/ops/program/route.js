import { NextResponse } from 'next/server';
import { refreshSite } from '@/lib/ops/refresh';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { readRows, updateRows, nextIds, ensureColumns, TABLES, ConflictError } from '@/lib/ops/store';
import { readRange, toObjects } from '@/lib/google';
import { FIELDS, check } from '@/lib/ops/eventfields';
import { PROGRAM_COLS, CADENCES, SHARED, sessionDates, nextDate, publicTitle, seriesSlug, sessionName } from '@/lib/ops/programs';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^E\d{3,}$/;
const fail = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
const field = key => FIELDS.find(f => f.key === key);
// Where each editable value lives
const TABLE_OF = { 'Teachers & Hosts': 'schedule', Time: 'schedule', 'Program Name': 'details', 'Module Title': 'details' };
const tableOf = key => TABLE_OF[key] || field(key)?.table || 'details';

async function editor() {
  const user = await currentUser();
  if (!user) return [null, fail('Please sign in again', 401)];
  if (!canEditEvents(user)) return [null, fail('Only Jacob, Irene and Floss can edit programs', 403)];
  return [user];
}

// A program's sessions straight from Schedule + Event Details (fresh), soonest first
async function sessionsOf(series) {
  const [sched, det] = await Promise.all([readRows('schedule'), readRows('details')]);
  const D = Object.fromEntries(det.map(r => [r.id, r.fields]));
  return sched
    .filter(r => String(D[r.id]?.Series || '').trim() === series)
    .map(r => {
      const d = D[r.id] || {}, s = r.fields;
      return {
        id: r.id, date: normDate(s.Date), track: String(s.Track || '').toUpperCase(), event: s.Event || '', status: s.Status || '',
        values: Object.fromEntries([...SHARED, 'Module Title', 'Summary', 'Public Title'].map(k => [k, String((tableOf(k) === 'schedule' ? s : d)[k] ?? '')])),
      };
    })
    .filter(x => !/cancel/i.test(x.status))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function normDate(v) {
  const s = String(v || '').trim();
  if (DATE.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s;
}
// The values every session shares (blank where sessions differ)
function sharedOf(sessions) {
  return Object.fromEntries(SHARED.map(k => {
    const vals = [...new Set(sessions.map(s => s.values[k].trim()))];
    return [k, vals.length === 1 ? vals[0] : ''];
  }));
}
const guessName = sessions => sharedOf(sessions)['Program Name']
  || sessions.map(s => s.values['Public Title']).find(Boolean)?.split(':')[0].trim()
  || sessions[0]?.event.replace(/\s*[—-]\s*(session|week|wk)\b.*$/i, '').trim() || '';

// GET ?series=slug → the program's sessions and shared values, for the Modules editor
export async function GET(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const series = new URL(req.url).searchParams.get('series') || '';
  if (!series) return fail('Which program?');
  const sessions = await sessionsOf(series);
  if (!sessions.length) return fail('No sessions with that series on the Schedule', 404);
  return NextResponse.json({ series, name: guessName(sessions), shared: sharedOf(sessions), sessions });
}

// POST { action: 'create', name, track, start, count, every, time?, teachers?, emails?, course_host?, website?, series? }
//      { action: 'modules', series, name, modules: [{ id, module, summary, teachers? }], before: { id: { module, summary, teachers } } }
//      { action: 'shared', series, changes: { field: value }, before: { field: value } }
//      { action: 'add-session', series, date? }
export async function POST(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const body = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (body.action === 'create') return await create(body, who);
    if (body.action === 'modules') return await saveModules(body, who);
    if (body.action === 'shared') return await saveShared(body, who);
    if (body.action === 'add-session') return await addSession(body, who);
    return fail('Unknown action');
  } catch (e) {
    if (e instanceof ConflictError) return fail(`Someone else changed this program since you opened it (${e.fields.join(', ')}). Reload and try again.`, 409);
    console.error('Program action failed', body.action, e.message);
    return fail(/^Sheets|^Google/.test(e.message) ? 'Could not save to the sheet. Try again shortly.' : e.message, 502);
  }
}

const ensureProgramCols = () => ensureColumns(TABLES.details.title, PROGRAM_COLS, { headerRow: TABLES.details.headerRow });
const done = (written, extra = {}) => { if (written.length) refreshSite(); return NextResponse.json({ ok: true, written: written.length, ...extra }); };

async function create({ name, track, start, count, every = 'weekly', time = '', teachers = '', emails = '', course_host = '', website = false, series = '' }, who) {
  const tracks = toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:A50")).map(r => String(r.track).toUpperCase()).filter(Boolean);
  const T = String(track || '').toUpperCase();
  const title = String(name || '').trim();
  const n = Number(count);
  if (!title || title.length > 100) return fail('Give the program a name (up to 100 characters)');
  if (!tracks.includes(T)) return fail(`Pick a track (${tracks.join(', ')})`);
  if (!DATE.test(String(start)) || isNaN(Date.parse(start))) return fail('Pick the date of the first session');
  if (start < todayET()) return fail('The first session needs a date from today on');
  if (!Number.isInteger(n) || n < 1 || n > 60) return fail('Number of sessions: 1 to 60');
  if (!CADENCES.some(c => c.value === every)) return fail('Pick how often it meets');
  const slug = seriesSlug(series || `${title}-${start.slice(0, 7)}`);
  if (!slug) return fail('Give the program a series name');
  const values = {};
  for (const [k, raw] of [['Time', time], ['Teachers & Hosts', teachers], ['Teacher/Host Emails', emails], ['Course Host', course_host]]) {
    const r = check(field(k), raw);
    if (r.error) return fail(`${field(k).label}: ${r.error}`);
    values[k] = r.value;
  }
  // A series name already used would merge two programs
  const used = (await readRows('details')).some(r => String(r.fields.Series || '').trim() === slug);
  if (used) return fail(`The series name “${slug}” is already used by another program. Choose another.`);

  await ensureProgramCols();
  const dates = sessionDates(start, n, every);
  const ids = await nextIds('schedule', n);
  const written = [
    ...(await updateRows('schedule', ids.map((id, i) => ({ id, changes: {
      Date: dates[i], Track: T, Event: sessionName(title, i + 1), 'Teachers & Hosts': values['Teachers & Hosts'], Time: values.Time, Status: 'Not started',
    } })), { who, create: true, dates: ['Date'] })),
    ...(await updateRows('details', ids.map(id => ({ id, changes: {
      Series: slug, 'Program Name': title, 'Public Title': title, 'Teacher/Host Emails': values['Teacher/Host Emails'],
      'Course Host': values['Course Host'], Website: website ? 'TRUE' : 'FALSE',
    } })), { who, create: true })),
  ];
  return done(written, { series: slug, key: `P-${slug}`, message: `Added ${n} session${n === 1 ? '' : 's'}, ${dates[0]} to ${dates.at(-1)}. Add each module’s title and description next.` });
}

async function saveModules({ series, name = '', modules = [], before = {} }, who) {
  if (!series) return fail('Which program?');
  const sessions = await sessionsOf(series);
  const byId = Object.fromEntries(sessions.map(s => [s.id, s]));
  const program = String(name || '').trim() || guessName(sessions);
  if (!program) return fail('Give the program a name first');
  const errors = {}, sched = [], det = [];
  for (const m of modules) {
    const s = byId[m.id];
    if (!ID.test(String(m.id)) || !s) { errors[m.id] = 'Not a session of this program'; continue; }
    const mod = String(m.module ?? '').trim(), sum = check(field('Summary'), m.summary);
    if (mod.length > 120) { errors[m.id] = 'Module title: keep it under 120 characters'; continue; }
    if (sum.error) { errors[m.id] = sum.error; continue; }
    const b = before[m.id] || {};
    const changes = {}, was = {};
    if (mod !== s.values['Module Title'].trim() || !s.values['Program Name']) {
      Object.assign(changes, { 'Module Title': mod, 'Public Title': publicTitle(program, mod) });
      if (!s.values['Program Name']) changes['Program Name'] = program;
      if ('module' in b) was['Module Title'] = b.module;
    }
    if (sum.value !== s.values.Summary.trim()) { changes.Summary = sum.value; if ('summary' in b) was.Summary = b.summary; }
    if (Object.keys(changes).length) det.push({ id: m.id, changes, before: was });
    if (m.teachers !== undefined) {
      const t = check(field('Teachers & Hosts'), m.teachers);
      if (t.value !== s.values['Teachers & Hosts'].trim()) sched.push({ id: m.id, changes: { 'Teachers & Hosts': t.value }, before: 'teachers' in b ? { 'Teachers & Hosts': b.teachers } : {} });
    }
  }
  if (Object.keys(errors).length) return fail('Some sessions need fixing', 400, { errors });
  if (det.length) await ensureProgramCols();
  const written = [...(det.length ? await updateRows('details', det, { who }) : []), ...(sched.length ? await updateRows('schedule', sched, { who }) : [])];
  return done(written, { message: written.length ? 'Saved. The website’s events list updates within a minute.' : 'Nothing to save.' });
}

async function saveShared({ series, changes = {}, before = {} }, who) {
  if (!series) return fail('Which program?');
  const sessions = await sessionsOf(series);
  if (!sessions.length) return fail('No sessions with that series on the Schedule', 404);
  const clean = {}, errors = {};
  for (const [k, raw] of Object.entries(changes)) {
    if (!SHARED.includes(k)) { errors[k] = 'Not a program-wide field'; continue; }
    if (k === 'Program Name') { const v = String(raw || '').trim(); if (!v || v.length > 100) errors[k] = 'A name up to 100 characters'; else clean[k] = v; continue; }
    const r = check(field(k), raw);
    if (r.error) errors[k] = r.error; else clean[k] = r.value;
  }
  if (Object.keys(errors).length) return fail('Some fields need fixing', 400, { errors });
  // Conflict check: what the editor showed as shared must still be what every session has
  const now = sharedOf(sessions);
  const moved = Object.keys(clean).filter(k => k in before && String(before[k] ?? '').trim() !== now[k]);
  if (moved.length) return fail(`Someone else changed ${moved.join(', ')} since you opened it. Reload and try again.`, 409);
  const sched = [], det = [];
  for (const s of sessions) {
    const sc = {}, dc = {};
    for (const [k, v] of Object.entries(clean)) (tableOf(k) === 'schedule' ? sc : dc)[k] = v;
    // A new program name renames every session's public title
    if ('Program Name' in clean) dc['Public Title'] = publicTitle(clean['Program Name'], s.values['Module Title']);
    if (Object.keys(sc).length) sched.push({ id: s.id, changes: sc });
    if (Object.keys(dc).length) det.push({ id: s.id, changes: dc });
  }
  if ('Program Name' in clean) await ensureProgramCols();
  const written = [...(sched.length ? await updateRows('schedule', sched, { who }) : []), ...(det.length ? await updateRows('details', det, { who, create: true }) : [])];
  return done(written, { message: written.length ? `Saved for all ${sessions.length} sessions.` : 'Nothing to save.' });
}

async function addSession({ series, date = '' }, who) {
  if (!series) return fail('Which program?');
  const sessions = await sessionsOf(series);
  if (!sessions.length) return fail('No sessions with that series on the Schedule', 404);
  const when = date || nextDate(sessions.map(s => s.date));
  if (!DATE.test(when) || isNaN(Date.parse(when))) return fail('Pick a date');
  if (sessions.some(s => s.date === when)) return fail('There is already a session on that date');
  const last = sessions.at(-1), name = guessName(sessions), shared = sharedOf(sessions);
  const [id] = await nextIds('schedule', 1);
  await ensureProgramCols();
  const written = [
    ...(await updateRows('schedule', [{ id, changes: { Date: when, Track: last.track, Event: sessionName(name, sessions.length + 1),
      'Teachers & Hosts': shared['Teachers & Hosts'], Time: shared.Time, Status: 'Not started' } }], { who, create: true, dates: ['Date'] })),
    ...(await updateRows('details', [{ id, changes: { Series: series, 'Program Name': name, 'Public Title': name,
      ...Object.fromEntries(SHARED.filter(k => tableOf(k) === 'details' && k !== 'Program Name' && shared[k]).map(k => [k, shared[k]])) } }], { who, create: true })),
  ];
  return done(written, { id, date: when, message: `Added a session on ${when}.` });
}
