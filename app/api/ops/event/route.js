import { NextResponse } from 'next/server';
import { refreshSite } from '@/lib/ops/refresh';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { getRow, updateRow, nextId, ensureColumns, TABLES, ConflictError } from '@/lib/ops/store';
import { loadCalendar } from '@/lib/calendar';
import { readRange, toObjects } from '@/lib/google';
import { moveEventTasks, closeEventTasks } from '@/lib/ops/eventtasks';
import { zoomMode } from '@/lib/zoomplan';
import { FIELDS, check } from '@/lib/ops/eventfields';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
const ID = /^E\d{3,}$/;

async function editor() {
  const user = await currentUser();
  if (!user) return [null, NextResponse.json({ error: 'Please sign in again' }, { status: 401 })];
  if (!canEditEvents(user)) return [null, NextResponse.json({ error: 'Only Jacob, Irene and Floss can edit events' }, { status: 403 })];
  return [user];
}

// GET ?id=E028 → the event's editable values, straight from Schedule and Event Details
export async function GET(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!ID.test(id)) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
  const [schedule, details] = await Promise.all([getRow('schedule', id), getRow('details', id)]);
  if (!schedule) return NextResponse.json({ error: `${id} isn't on the Schedule tab` }, { status: 404 });
  const values = {}, locked = [...schedule.locked, ...(details?.locked || [])];
  for (const f of FIELDS) values[f.key] = (f.table === 'schedule' ? schedule.fields : details?.fields || {})[f.key] ?? '';
  return NextResponse.json({ id, values, locked });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const keyOf = (date, track) => `${date}-${String(track).toLowerCase()}`;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// POST { action: 'add', date, track, name, time?, teachers?, past?, video?, summary? }   a new event on the Schedule tab (past: already over, Status Done)
//      { action: 'move', id, date }                             a new date; its open tasks move with it
//      { action: 'cancel' | 'restore', id }                     Status Cancelled (hidden everywhere) / back
//      { id, changes: { field: value }, before: { field: value as shown } }   edit details
export async function POST(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const body = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (body.action === 'add') return await addEvent(body, who);
    if (body.action === 'move') return await moveEvent(body, who);
    if (body.action === 'cancel' || body.action === 'restore') return await setCancelled(body, who);
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, conflict: e.current }, { status: 409 });
    console.error('Event action failed', body.action, e.message);
    return fail(/^Sheets|^Google|^Motion/.test(e.message) ? 'Could not save. Try again shortly.' : e.message, 502);
  }
  const { id, changes = {}, before = {} } = body;
  if (!ID.test(String(id))) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
  const byTable = { schedule: {}, details: {} }, errors = {};
  for (const [key, raw] of Object.entries(changes)) {
    const f = FIELDS.find(x => x.key === key);
    if (!f) { errors[key] = 'Not an editable field'; continue; }
    const r = check(f, raw);
    if (r.error) errors[key] = r.error; else byTable[f.table][key] = r.value;
  }
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
  const pick = keys => Object.fromEntries(keys.filter(k => k in before).map(k => [k, before[k]]));
  try {
    const fresh = FIELDS.filter(f => f.ensure && f.key in byTable[f.table]);
    if (fresh.length) await ensureColumns(TABLES.details.title, fresh.map(f => f.key), { headerRow: TABLES.details.headerRow });
    const written = [
      ...(await updateRow('schedule', id, byTable.schedule, { before: pick(Object.keys(byTable.schedule)), who })),
      // Older events may not have an Event Details row yet: add it
      ...(await updateRow('details', id, byTable.details, { before: pick(Object.keys(byTable.details)), who, create: true })),
    ];
    if (written.length) refreshSite();
    return NextResponse.json({ ok: true, written });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, conflict: e.current }, { status: 409 });
    console.error('Event save failed', id, e.message);
    return NextResponse.json({ error: /^Sheets|^Google/.test(e.message) ? 'Could not save to the sheet. Try again shortly.' : e.message }, { status: 502 });
  }
}


async function addEvent({ date, track, name, time = '', teachers = '', past = false, video = '', summary = '' }, who) {
  const tracks = toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:A50")).map(r => String(r.track).toUpperCase()).filter(Boolean);
  const T = String(track || '').toUpperCase();
  if (!DATE.test(String(date)) || isNaN(Date.parse(date))) return fail('Pick a date');
  if (!tracks.includes(T)) return fail(`Pick a track (${tracks.join(', ')})`);
  const title = String(name || '').trim();
  if (!title || title.length > 120) return fail('Give it a name (up to 120 characters)');
  const t = FIELDS.find(f => f.key === 'Time'), tm = check(t, time);
  if (tm.error) return fail(tm.error);
  // A past event (Events → Past) is already over: it goes in as Done, with its replay
  let extra = {};
  if (past) {
    if (date >= todayET()) return fail('A past event needs a date before today');
    const v = check(FIELDS.find(f => f.key === 'Vimeo Video ID'), video);
    if (v.error) return fail(v.error);
    const sm = check(FIELDS.find(f => f.key === 'Summary'), summary);
    if (sm.error) return fail(sm.error);
    extra = Object.fromEntries(Object.entries({ 'Vimeo Video ID': v.value, Summary: sm.value }).filter(([, x]) => x));
  }
  const id = await nextId('schedule');
  await updateRow('schedule', id, { Date: date, Track: T, Event: title, 'Teachers & Hosts': check(FIELDS.find(f => f.key === 'Teachers & Hosts'), teachers).value, Time: tm.value, Status: past ? 'Done' : 'Not started' },
    { who, create: true, dates: ['Date'] });
  if (Object.keys(extra).length) await updateRow('details', id, extra, { who, create: true });
  refreshSite();
  return NextResponse.json({ ok: true, id, key: keyOf(date, T) });
}

async function moveEvent({ id, date }, who) {
  if (!ID.test(String(id))) return fail('Unknown event');
  if (!DATE.test(String(date)) || isNaN(Date.parse(date))) return fail('Pick the new date');
  const ev = (await loadCalendar({ fresh: true, includeCancelled: true })).find(e => e.sched_id === id);
  if (!ev) return fail(`${id} isn't on the Master Schedule`, 404);
  if (ev.date === date) return fail('That’s already its date');
  const row = await getRow('schedule', id);
  await updateRow('schedule', id, { Date: date }, { before: { Date: row.fields.Date }, who, dates: ['Date'] });
  let moved = 0, note = '';
  try { moved = await moveEventTasks(ev.id, keyOf(date, ev.track), ev.date, date); }
  catch (e) { note = ' Its tasks couldn’t be moved in Motion; the daily sync will make new ones.'; console.error('Task move failed', e.message); }
  if (zoomMode(ev.zoom) === 'one-off') note += ' The Zoom sync makes a meeting for the new date; delete the old one in Zoom.';
  refreshSite();
  return NextResponse.json({ ok: true, key: keyOf(date, ev.track), message: `Moved to ${date}.${moved ? ` ${moved} open task${moved === 1 ? '' : 's'} moved with it.` : ''}${note}` });
}

async function setCancelled({ id, action }, who) {
  if (!ID.test(String(id))) return fail('Unknown event');
  const ev = (await loadCalendar({ fresh: true, includeCancelled: true })).find(e => e.sched_id === id);
  if (!ev) return fail(`${id} isn't on the Master Schedule`, 404);
  const row = await getRow('schedule', id);
  const status = action === 'cancel' ? 'Cancelled' : 'Not started';
  await updateRow('schedule', id, { Status: status }, { before: { Status: row.fields.Status }, who });
  let closed = 0;
  if (action === 'cancel') { try { closed = await closeEventTasks(ev.id); } catch (e) { console.error('Closing tasks failed', e.message); } }
  refreshSite();
  return NextResponse.json({ ok: true, message: action === 'cancel'
    ? `Cancelled. It’s off the website, reminders and the newsletter.${closed ? ` ${closed} open task${closed === 1 ? '' : 's'} closed.` : ''}`
    : 'Restored. The daily sync makes its tasks again.' });
}
