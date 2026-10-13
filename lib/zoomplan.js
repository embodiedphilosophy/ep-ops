// How the sheet's `zoom` column turns into Zoom meetings.
//
//   zoom = (blank)   No automation. Paste a hand-made link into zoom_link if there is one
//                    (Meditation Mondays: one hand-made meeting, drop-ins register per session).
//   zoom = one-off   One meeting for this row only. A row with an end_date (a multi-day course)
//                    still gets ONE link that works every day from date to end_date.
//   zoom = series    ONE meeting shared by every row (and Recurring rule) with the same `series`
//                    name. An 8-week course = 8 rows with the same series = one link.
//
// A zoom_link on any row of a series is used for the whole series, and nothing is created.
// TRUE (the old setting) counts as one-off.
import { to24h, TZ } from './when';
import { zoomLinkOf } from './events';
import { createMeeting, updateMeeting, getMeeting, deleteOccurrence, findTagged, tagFor } from './zoom';

export const zoomMode = v => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'series') return 'series';
  if (['one-off', 'one off', 'oneoff', 'true', 'yes'].includes(s)) return 'one-off';
  return '';
};
// Series whose meeting is made by hand and must never be created by the sync
export const MANUAL_SERIES = new Set(['meditation-mondays']);

export const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const normDate = s => { const m = String(s || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Which Zoom meeting a calendar row belongs to (the tag key), or '' if the sync doesn't make one
export function meetingKey(e) {
  const mode = zoomMode(e.zoom);
  if (mode === 'series') return e.series ? String(e.series).trim() : '';
  if (mode === 'one-off') return e.id;
  return '';
}

// Every session date of a Recurring rule (weekday or "Daily", start to end, minus skip_dates)
export function ruleDates(r) {
  const start = normDate(r.start_date);
  if (!start) return [];
  const end = normDate(r.end_date) || addDays(start, 7 * 12);
  const wd = String(r.weekday || '').trim().toLowerCase();
  const skip = new Set(String(r.skip_dates || '').split(',').map(x => normDate(x)).filter(Boolean));
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ok = wd === 'daily' || DAYS[new Date(d + 'T12:00:00Z').getUTCDay()] === wd;
    if (ok && !skip.has(d)) out.push(d);
  }
  return out;
}

const etDate = iso => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const etStart = iso => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(' ', 'T');
const cleanSeriesTitle = t => String(t || '').replace(/\s*\((session|week|wk)\s*\d+\)\s*$/i, '').replace(/\s*[—–-]\s*(session|week|wk)\s*\d+\s*$/i, '').trim();

// Build the list of meetings the sheet asks for: one per one-off row, one per series.
// rows: calendar rows (EP Site Events or Master Schedule); rules: Recurring tab rules.
export function planMeetings(rows, rules, today) {
  const plans = new Map(); const skipped = [];
  const add = (key, item) => {
    const p = plans.get(key) || { key, dates: new Set(), titles: [], times: new Set(), durations: [], link: '', registration: '', kind: item.kind };
    item.dates.forEach(d => p.dates.add(d));
    if (item.title) p.titles.push(item.title);
    if (item.time) p.times.add(item.time);
    if (item.duration) p.durations.push(Number(item.duration));
    if (item.link) p.link = item.link;
    if (item.registration) p.registration = item.registration;
    plans.set(key, p);
  };
  for (const e of rows) {
    const mode = zoomMode(e.zoom); if (!mode) continue;
    const key = meetingKey(e);
    if (!key) { skipped.push({ id: e.id, reason: 'zoom = series needs a series name' }); continue; }
    const end = e.end_date && e.end_date > e.date ? e.end_date : e.date;
    const dates = []; for (let d = e.date; d <= end; d = addDays(d, 1)) dates.push(d);
    add(key, { kind: mode, dates, title: mode === 'series' ? cleanSeriesTitle(e.title) : e.title, time: e.time, duration: e.duration_minutes, link: zoomLinkOf(e), registration: String(e.zoom_registration || '').trim().toLowerCase() });
  }
  for (const r of rules) {
    if (!zoomMode(r.zoom)) continue;
    const key = String(r.series || '').trim() || slug(r.title);
    add(key, { kind: 'series', dates: ruleDates(r), title: r.title, time: r.time, duration: r.duration_minutes, link: zoomLinkOf(r), registration: String(r.zoom_registration || '').trim().toLowerCase() });
  }
  const out = [];
  for (const p of plans.values()) {
    const upcoming = [...p.dates].filter(d => d >= today).sort();
    if (MANUAL_SERIES.has(p.key)) { skipped.push({ id: p.key, reason: 'made by hand (Meditation Mondays); set zoom to blank' }); continue; }
    if (p.link) { skipped.push({ id: p.key, reason: 'zoom_link given' }); continue; }
    if (!upcoming.length) continue;
    out.push({ ...p, dates: upcoming, title: p.titles[0] || p.key, time: [...p.times][0] || '', duration: p.durations[0] || 90,
      warning: p.times.size > 1 ? `sessions have different times (${[...p.times].join(', ')}); Zoom uses ${[...p.times][0]}` : '' });
  }
  return { plans: out, skipped };
}

const SETTINGS = { approval_type: 0, registrants_confirmation_email: true, registrants_email_notification: true, waiting_room: false, join_before_host: false, auto_recording: 'cloud' };

// Make sure ONE Zoom meeting exists for a plan, with exactly its session dates.
// One date → a regular meeting. Several → a recurring meeting (one link) whose sessions are those dates.
// Registration: one-offs keep it (free website sign-ups); series default to none (the link just works),
// or set zoom_registration on a Recurring rule to "all" (register once) or "each" (per session).
export async function ensureMeeting(plan, upcomingList) {
  const { key, title, dates, time, duration, kind, registration } = plan;
  const start_time = `${dates[0]}T${to24h(time)}`;
  const reg = kind === 'one-off' ? { approval_type: 0 }
    : registration === 'each' ? { approval_type: 0, registration_type: 2 }
    : ['all', 'once'].includes(registration) ? { approval_type: 0, registration_type: 1 }
    : { approval_type: 2 };
  const base = { topic: title, timezone: TZ, duration, agenda: `${title}\n${tagFor(key)}`, settings: { ...SETTINGS, ...reg } };
  const weekly_days = [...new Set(dates.map(d => new Date(d + 'T12:00:00Z').getUTCDay() + 1))].sort().join(',');
  const body = dates.length === 1 ? { ...base, type: 2, start_time }
    : { ...base, type: 8, start_time, recurrence: { type: 2, repeat_interval: 1, weekly_days, end_date_time: `${addDays(dates[dates.length - 1], 1)}T12:00:00Z` } };

  let found = await findTagged(key, upcomingList);
  let action = 'ok';
  // A meeting the site made earlier under an older tag, same title: adopt it rather than make a duplicate
  if (!found && upcomingList) {
    for (const c of upcomingList.filter(m => m.topic === title)) {
      const full = await getMeeting(c.id);
      if (/\[ep:[^\]]+\]/.test(full.agenda || '')) { found = full; await updateMeeting(full.id, body); action = 'adopted'; break; }
    }
  }
  if (!found) { found = await createMeeting(body); action = 'created'; }
  else {
    const m = await getMeeting(found.id);
    const live = (m.occurrences || []).filter(o => o.status !== 'deleted');
    const have = new Set(live.map(o => etDate(o.start_time)));
    const first = live[0]?.start_time || m.start_time;
    const changed = m.topic !== title || Number(m.duration) !== Number(duration) || (first && etStart(first) !== start_time.slice(0, 16))
      || (m.type === 8) !== (dates.length > 1) || dates.some(d => dates.length > 1 && !have.has(d));
    if (changed) { await updateMeeting(found.id, body); action = 'updated'; }
  }
  // Recurring: delete any generated session that isn't one of the sheet's dates (skipped weeks etc.)
  if (dates.length > 1) {
    const m = await getMeeting(found.id);
    const want = new Set(dates);
    for (const o of (m.occurrences || []).filter(o => o.status !== 'deleted' && !want.has(etDate(o.start_time)))) {
      await deleteOccurrence(found.id, o.occurrence_id);
    }
  }
  return { id: key, action, meeting: found.id, sessions: dates.length, ...(plan.warning ? { warning: plan.warning } : {}) };
}
