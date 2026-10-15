import { loadCalendar } from '../calendar';
import { todayET, emailsOf } from '../events';
import { addDays, names, eventIdFromTag } from './tasks';
import { checksFor, checkStatus, checkContext } from './checks';

// Event readiness: the event's own checks read from the calendar sheet (lib/ops/checks.js), plus its open
// Motion tasks. The worse of the two sets the dot. Same rule for both:
//   red    something is past due, or the event is under 7 days away with something still open
//   amber  something is due within the next 7 days
//   green  everything due so far is done
//   grey   nothing is due yet (usually more than ~4 weeks out, before the daily job makes its tasks)
export const WEEKS = 8;
const RANK = { red: 0, amber: 1, green: 2, grey: 3 };
const WEEKLY = new Set(['MM']); // weekly sessions: one row per month, so they don't flood the list

export function statusOf(ev, tasks, today = todayET()) {
  const open = tasks.filter(t => !t.completed);
  const soon = addDays(today, 7);
  if (open.some(t => t.due && t.due < today) || (ev.date >= today && ev.date < soon && open.some(t => !t.due || t.due <= ev.date))) return 'red';
  if (open.some(t => t.due && t.due <= soon)) return 'amber';
  return tasks.length ? 'green' : 'grey';
}

const mineOnly = user => ev => {
  const email = String(user.email || '').trim().toLowerCase();
  return (email && emailsOf(ev).includes(email)) || names(ev.teachers).includes(user.name) || names(ev.course_host).includes(user.name);
};

// One row per recent or upcoming event (weekly series grouped by month), worst status first, then by date.
// Teachers see only their own events.
export async function readinessRows(user, allTasks, { weeks = WEEKS, teacherView = false } = {}) {
  // From a week back (follow-up tasks: slides, replay) to `weeks` ahead
  const today = todayET(), from = addDays(today, -7), until = addDays(today, weeks * 7);
  const full = await loadCalendar();
  const cal = full.filter(ev => (ev.end_date || ev.date) >= from && ev.date <= until)
    .filter(ev => !/cancel/i.test(ev.status))
    .filter(teacherView ? mineOnly(user) : () => true);
  const ctx = await checkContext(full).catch(() => null);
  const byEvent = {};
  for (const t of allTasks) { const id = eventIdFromTag(t.description); if (id) (byEvent[id] ||= []).push(t); }

  // Programs: sessions sharing a Series (a course, certificate or season) make one row, with every session
  // of the program in the window under it. Weekly drop-in tracks (MM) stay grouped by month.
  const seriesCount = {};
  for (const ev of full) if (ev.series && !WEEKLY.has(ev.track)) seriesCount[ev.series] = (seriesCount[ev.series] || 0) + 1;
  const programOf = ev => !WEEKLY.has(ev.track) && ev.series && seriesCount[ev.series] > 1 ? ev.series : '';
  const rows = new Map();
  for (const ev of cal) {
    const key = WEEKLY.has(ev.track) ? `${ev.track}-${ev.date.slice(0, 7)}` : programOf(ev) ? `P-${programOf(ev)}` : ev.id;
    if (!rows.has(key)) rows.set(key, { key, events: [], tasks: [] });
    const r = rows.get(key);
    r.events.push(ev); r.tasks.push(...(byEvent[ev.id] || []));
  }
  return [...rows.values()].map(r => {
    const ev = r.events[0];
    const program = programOf(ev);
    const weekly = !program && (r.events.length > 1 || WEEKLY.has(ev.track));
    const month = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    // Checks per session (a monthly group of weekly sessions lists each session's missing items)
    // A session that has already happened can't fix what was due before it (posts, links, titles), so those
    // drop off; what comes after it (the replay) still counts.
    const moot = (c, e) => e.date < today && c.due <= e.date && !c.ready;
    const checks = ctx ? r.events.flatMap(e => checksFor(e, ctx).filter(c => !moot(c, e)).map(c => ({ ...c, event: e }))) : [];
    const status = r.events.flatMap(e => [statusOf(e, byEvent[e.id] || [], today), ...(ctx ? [checkStatus(e, checks.filter(c => c.event === e), today)] : [])])
      .sort((a, b) => RANK[a] - RANK[b])[0];
    const open = r.tasks.filter(t => !t.completed).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    const missing = checks.filter(c => !c.ready).sort((a, b) => a.due.localeCompare(b.due));
    const last = r.events[r.events.length - 1];
    const end = last.end_date || last.date;
    // Where the row is in its life: not started, running (first session past, more to come), or over
    const phase = ev.date > today ? 'upcoming' : end >= today ? 'running' : 'ended';
    const allSessions = program ? full.filter(e => e.series === program).length : r.events.length;
    const programName = program ? (r.events.find(e => e.program_name)?.program_name || ev.title.split(':')[0].trim()) : '';
    const late = open.filter(t => t.due && t.due < today).length;
    return {
      key: r.key, status, phase, late, date: ev.date, end_date: end, track: ev.track, program, allSessions,
      title: program ? programName : weekly ? `${ev.title}: ${month} (${r.events.length} session${r.events.length === 1 ? '' : 's'})` : ev.title,
      teachers: [...new Set(r.events.flatMap(e => names(e.teachers)))].join(', '),
      course_host: [...new Set(r.events.flatMap(e => names(e.course_host)))].join(', '),
      events: r.events, tasks: r.tasks,
      done: r.tasks.length - open.length, total: r.tasks.length,
      next: open[0] || null,
      checks, ready: checks.length - missing.length, nextCheck: missing[0] || null,
    };
  }).sort((a, b) => (a.phase === 'ended') - (b.phase === 'ended') || RANK[a.status] - RANK[b.status] || a.date.localeCompare(b.date));
}

// The word shown with the dot. Upcoming rows say how ready they are; a row whose first session has passed
// says where it is in its run, so "At risk" only ever means something not yet started.
export function labelOf(r) {
  if (r.phase === 'running') return r.status === 'red' ? 'Running, behind' : 'Running';
  if (r.phase === 'ended') return r.status === 'red' ? 'Follow-up late' : 'Wrapping up';
  return { red: 'At risk', amber: 'Due soon', green: 'On track', grey: 'Nothing due yet' }[r.status];
}
// For Today's count: upcoming work that is at risk (not things already over)
export const atRisk = r => r.status === 'red' && r.phase !== 'ended';
