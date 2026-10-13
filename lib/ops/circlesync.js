import { loadCalendar } from '../calendar';
import { readRange, toObjects } from '../google';
import { circleConfigured, listEvents, listSpaces, createEvent, updateEvent } from '../circle';
import { whereOf } from './eventfields';
import { zoomLinkOf, todayET } from '../events';
import { to24h, TZ } from '../when';
import { addDays } from '../zoomplan';
import { updateRow, ensureColumns, TABLES } from './store';

// Circle event sync: every upcoming session whose "Where it happens" is Circle gets a Circle event
// (Circle's built-in live stream) in its course's events space, kept in step with the sheet.
//   - Which space: the Circle Groups tab, column circle_event_space_id, on the row whose offering is the
//     session's Series, its event ID (E047 or 2026-10-11-event), or its track code (e.g. SSWW).
//   - One Circle event per day: a multi-day row (Navarātri) gets one per day.
//   - An event already in that space on the same day (made by hand) is adopted, not duplicated.
//   - Event Details keeps the link(s) in "Circle Event" (one per day, in date order) and, in "Circle Sync",
//     a fingerprint of the name and summary it last sent. Time and length always follow the sheet; the name
//     and description are only sent when the sheet's title or summary changes, so names typed in Circle survive.
//   - Nothing in Circle is ever deleted: cancelled sessions, and sessions moved off Circle, are flagged for a person.
//   - A pasted Zoom Link always wins: such a row gets no Circle event.
// Live writes need CIRCLE_EVENT_SYNC=live as well as being asked for; everything else is a dry run.
export const COL = 'Circle Event';
export const STATE = 'Circle Sync';
export const SPACE_COL = 'circle_event_space_id';
export const liveAllowed = () => String(process.env.CIRCLE_EVENT_SYNC || '').toLowerCase() === 'live';

const lower = s => String(s || '').trim().toLowerCase();
export const linksOf = v => String(v || '').split(/\s+/).filter(u => /^https:\/\//.test(u));
const hash = s => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); };

// Minutes Eastern time is ahead of UTC at instant ms (e.g. -240 in summer)
function etOffset(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000);
}
// "2026-10-21", "9am ET" → "2026-10-21T13:00:00.000Z"
export function etToUtc(date, time) {
  const [h, m] = to24h(time).split(':').map(Number), [Y, M, D] = date.split('-').map(Number);
  const wall = Date.UTC(Y, M - 1, D, h, m);
  let t = wall - etOffset(wall) * 60000;
  t = wall - etOffset(t) * 60000; // right side of a clock change
  return new Date(t).toISOString();
}
export const etDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

export const needsCircle = ev => whereOf(ev.zoom, ev.track) === 'circle' && !zoomLinkOf(ev);
export const daysOf = ev => { const out = [], end = ev.end_date && ev.end_date > ev.date ? ev.end_date : ev.date; for (let d = ev.date; d <= end; d = addDays(d, 1)) out.push(d); return out; };

// What the sheet says each day's event should be called, and its description
export function wanted(ev, cal) {
  const days = daysOf(ev);
  const series = ev.series ? cal.filter(e => e.series === ev.series && !/cancel/i.test(e.status)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const n = series.findIndex(e => e.id === ev.id) + 1;
  const names = days.map((d, i) => days.length > 1 ? `${ev.title} · Day ${i + 1}` : series.length > 1 && n ? `${ev.title} · Session ${n}` : ev.title);
  const body = ev.summary || `${ev.host || ev.program || 'Embodied Philosophy'}${ev.teachers ? ` with ${ev.teachers}` : ''}. Live in Circle.`;
  return { days, names, body, fp: hash(`${names.join('|')}#${ev.summary || ''}`) };
}

async function spaceMap() {
  const rows = toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Circle Groups'!A1:Z300", { fresh: true }).catch(() => []));
  return Object.fromEntries(rows.filter(r => r.offering && String(r[SPACE_COL] || '').trim()).map(r => [lower(r.offering), String(r[SPACE_COL]).trim()]));
}
export const spaceKeys = ev => [ev.series, ev.sched_id, ev.id, ev.track].filter(Boolean);

// The plan: per sheet row, what would be created / adopted / updated, plus flags for a person.
// map / cal: stand-ins for the Circle Groups mapping and the calendar (a dry run of a proposed mapping)
export async function planCircle({ today = todayET(), map: mapIn, cal: calIn } = {}) {
  if (!circleConfigured()) throw new Error('CIRCLE_API_TOKEN is not set');
  const [cal, map, events, spaces] = await Promise.all([calIn || loadCalendar({ fresh: true, includeCancelled: true }), mapIn || spaceMap(), listEvents(), listSpaces()]);
  const spaceName = Object.fromEntries(spaces.map(s => [String(s.id), s.name]));
  const byUrl = Object.fromEntries(events.map(e => [e.url, e]));
  const claimed = new Set(cal.flatMap(e => linksOf(e.circle_event)).map(u => byUrl[u]?.id).filter(Boolean));
  const rows = [], flags = [];
  const flag = (ev, why) => flags.push({ id: ev.sched_id || ev.id, date: ev.date, title: ev.title, why });

  for (const ev of cal) {
    if ((ev.end_date || ev.date) < today) continue;
    const links = linksOf(ev.circle_event);
    if (/cancel/i.test(ev.status)) { if (links.length) flag(ev, `Cancelled, but its Circle event is still there: cancel or delete it in Circle by hand (${links.join(' ')})`); continue; }
    if (!needsCircle(ev)) { if (links.length) flag(ev, `No longer in Circle (${zoomLinkOf(ev) ? 'a Zoom link was pasted' : 'Where it happens changed'}), but its Circle event is still there: remove it in Circle by hand if it isn't needed`); continue; }
    if (!ev.sched_id) { flag(ev, 'No event ID on the Schedule tab, so its Circle link can’t be stored'); continue; }
    const key = spaceKeys(ev).find(k => map[lower(k)]);
    const spaceId = key && map[lower(key)];
    if (!spaceId) { flag(ev, `No Circle space chosen: add ${SPACE_COL} on the Circle Groups tab for "${ev.series || ev.sched_id}" or "${ev.track}"`); continue; }
    if (!ev.time) { flag(ev, 'No time on the sheet (or the track default), so no Circle event yet'); continue; }
    const minutes = Number(ev.duration_minutes);
    if (!minutes) { flag(ev, 'No length on the sheet (or the track default), so no Circle event yet'); continue; }

    const w = wanted(ev, cal);
    const pushText = ev.circle_sync && ev.circle_sync !== w.fp; // the sheet's title or summary changed since the last sync
    const row = { ev, id: ev.sched_id, date: ev.date, title: ev.title, space: spaceName[spaceId] || spaceId, spaceId, fp: w.fp, steps: [] };
    // This row's own events, matched to its days by date; one left over (the session moved) takes a day with none
    const mine = links.map(u => byUrl[u]).filter(Boolean);
    const lost = links.filter(u => !byUrl[u]);
    if (lost.length) flag(ev, `Its Circle event (${lost.join(' ')}) isn’t in Circle any more. Clear "${COL}" on the sheet to make a new one`);
    if (lost.length && !mine.length) continue;
    const pick = {}, used = new Set();
    for (const day of w.days) { const e = mine.find(x => etDay(x.starts_at) === day && !used.has(x.id)); if (e) { pick[day] = e; used.add(e.id); } }
    for (const day of w.days) if (!pick[day]) { const e = mine.find(x => !used.has(x.id)); if (e) { pick[day] = e; used.add(e.id); } }
    for (const e of mine) if (!used.has(e.id)) flag(ev, `Has more Circle events than days; “${e.name}” (${e.url}) isn’t needed: remove it in Circle by hand`);
    w.days.forEach((day, i) => {
      const want = { name: w.names[i], starts_at: etToUtc(day, ev.time), duration_in_seconds: minutes * 60 };
      let e = pick[day], adopted = false;
      if (!e) {
        e = events.find(x => String(x.space?.id) === String(spaceId) && etDay(x.starts_at) === day && !claimed.has(x.id));
        if (e) { claimed.add(e.id); adopted = true; }
      }
      if (!e) { row.steps.push({ day, action: 'create', fields: { ...want, body: w.body } }); return; }
      const changes = {};
      if (Date.parse(e.starts_at) !== Date.parse(want.starts_at)) changes.starts_at = want.starts_at;
      if (Number(e.duration_in_seconds) !== want.duration_in_seconds) changes.duration_in_seconds = want.duration_in_seconds;
      if (pushText && !adopted && e.name !== want.name) changes.name = want.name;
      if (pushText && !adopted && ev.summary && e.body !== ev.summary) changes.body = ev.summary;
      if (String(e.space?.id) !== String(spaceId)) flag(ev, `${day}: its Circle event is in “${e.space?.name}”, not “${row.space}”. Move it in Circle by hand if that’s wrong`);
      const from = { name: e.name, starts_at: e.starts_at, duration_in_seconds: e.duration_in_seconds };
      row.steps.push({ day, action: Object.keys(changes).length ? (adopted ? 'adopt+update' : 'update') : adopted ? 'adopt' : 'ok', circle_id: e.id, url: e.url, name: e.name, changes, from });
    });
    row.links = row.steps.map(s => s.url || '');
    rows.push(row);
  }
  // Upcoming events in the spaces we manage that no sheet row claims
  const managed = new Set(Object.values(map).map(String));
  const extra = events.filter(e => managed.has(String(e.space?.id)) && etDay(e.starts_at) >= today && !claimed.has(e.id))
    .map(e => ({ date: etDay(e.starts_at), space: e.space?.name, name: e.name, url: e.url, why: 'In Circle but not on the sheet as a Circle session' }));
  return { rows, flags, extra };
}

// Plain lines for a person (the dry run, the daily job's report)
export function describe(plan) {
  const t = iso => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
  const lines = [];
  for (const r of plan.rows) for (const s of r.steps) {
    const at = `${r.id} ${s.day} · ${r.space}`;
    if (s.action === 'create') lines.push(`CREATE ${at}: “${s.fields.name}”, ${t(s.fields.starts_at)}, ${s.fields.duration_in_seconds / 60} min`);
    else if (s.action !== 'ok') {
      const ch = Object.entries(s.changes).map(([k, v]) => k === 'starts_at' ? `time ${t(s.from.starts_at)} → ${t(v)}` : k === 'duration_in_seconds' ? `length ${s.from.duration_in_seconds / 60} → ${v / 60} min` : k === 'name' ? `name “${s.from.name}” → “${v}”` : 'description from the Summary');
      lines.push(`${s.action.toUpperCase()} ${at}: “${s.name}”${ch.length ? ` (${ch.join(', ')})` : ' (already matches; link saved to the sheet)'}`);
    }
  }
  return {
    changes: lines,
    unchanged: plan.rows.reduce((n, r) => n + r.steps.filter(s => s.action === 'ok').length, 0),
    flags: plan.flags.map(f => `${f.id} ${f.date} ${f.title}: ${f.why}`),
    not_on_sheet: plan.extra.map(e => `${e.date} · ${e.space}: “${e.name}” ${e.url}`),
  };
}

// dry: list only. Live: create/update in Circle, then store links + fingerprint on Event Details.
export async function runCircleSync({ dry = true, limit = 25, map, cal } = {}) {
  if (!dry && (map || cal)) throw new Error('A stand-in mapping is for dry runs only');
  const plan = await planCircle({ map, cal });
  const out = { mode: dry ? 'dry run: nothing was changed in Circle or the sheet' : 'live', ...describe(plan), done: [], errors: [] };
  if (dry) return out;
  if (!liveAllowed()) throw new Error('Live Circle sync is switched off (set CIRCLE_EVENT_SYNC=live in Vercel to allow it)');
  await ensureColumns(TABLES.details.title, [COL, STATE], { headerRow: TABLES.details.headerRow });
  let creates = 0;
  for (const r of plan.rows) {
    const links = [...r.links];
    let touched = r.steps.some(s => s.action !== 'ok') || links.filter(Boolean).join('\n') !== linksOf(r.ev.circle_event).join('\n') || r.ev.circle_sync !== r.fp;
    if (!touched) continue;
    try {
      for (const [i, s] of r.steps.entries()) {
        if (s.action === 'create') {
          if (creates >= limit) { out.errors.push(`Stopped after ${limit} new events; the rest follow on the next run`); touched = false; break; }
          const e = await createEvent(r.spaceId, s.fields); creates++;
          if (!e?.url) throw new Error('Circle made the event but sent back no link');
          links[i] = e.url; out.done.push(`created ${r.id} ${s.day}: ${e.url}`);
        } else if (Object.keys(s.changes || {}).length) {
          await updateEvent(s.circle_id, s.changes); out.done.push(`updated ${r.id} ${s.day}: ${Object.keys(s.changes).join(', ')}`);
        }
      }
      // A partly made multi-day row stores what exists so far (blank days are made next time)
      if (links.some(Boolean)) await updateRow('details', r.id, { [COL]: links.filter(Boolean).join('\n'), [STATE]: links.every(Boolean) ? r.fp : r.ev.circle_sync }, { who: 'Circle sync' });
    } catch (e) { out.errors.push(`${r.id}: ${e.message}`); }
    if (!touched) break;
  }
  return out;
}
