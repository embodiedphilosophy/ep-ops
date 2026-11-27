// The Programs index (EP Ops 2, step 4): turns what the old Programming page already reads (readiness rows, the Launches tab,
// the Email Plan, the calendar's Circle columns) into the rows of "Everything EP runs". Nothing here reads or writes anything:
// the page passes the data in, so the rules can be tested on their own.
import { labelOf } from './readiness';
import { evId } from './emailkit';
import { inCircle, circleLinkFor } from './joinurl';

// Where a program sits in the filter chips. The Parent Program column wins (Programming's "part of"); otherwise the track decides.
export const GROUPS = [['all', 'All'], ['sadhana', 'Sādhana School'], ['wisdom', 'Wisdom School'], ['meditation', 'Meditation Pass'], ['sahridaya', 'Sahṛdaya Upāya'], ['campaigns', 'Campaigns']];
const TRACK_GROUP = { SS: 'sadhana', SSWW: 'sadhana', MM: 'meditation', WSML: 'wisdom', WSQ: 'wisdom' };
export function groupOf(row) {
  const text = `${row.parent || ''} ${row.title || ''}`;
  if (/sah[ṛr]daya|mentorship/i.test(text)) return 'sahridaya';
  if (/s[āa]dhana/i.test(row.parent || '')) return 'sadhana';
  if (/meditation pass/i.test(row.parent || '')) return 'meditation';
  if (/wisdom/i.test(row.parent || '')) return 'wisdom';
  return TRACK_GROUP[row.track] || 'other';
}

// The address of a program's page. The key is the readiness key (the series as P-<series>, or the event ID).
export const programHref = (key, tab) => `/ops/programs/${encodeURIComponent(key)}${tab ? `?tab=${tab}` : ''}`;
export const launchHref = id => `/ops/programs?view=launches&id=${encodeURIComponent(id)}`;

const lc = s => String(s || '').toUpperCase();
// Launch column: the launch (if any) that points at one of the program's sessions, with its status and how many of its emails are scheduled
export function launchFor(row, launches, plan) {
  const ids = new Set(row.events.map(e => evId(e)));
  const l = launches.find(x => x.event_id && ids.has(lc(x.event_id)));
  return l ? launchLine(l, plan) : null;
}
export function launchLine(l, plan) {
  const mine = plan.filter(p => p.launch_id === l.id);
  const sched = mine.filter(p => ['Scheduled', 'Sent'].includes(p.status)).length;
  return { id: l.id, name: l.name, status: l.status || 'Planning', emails: mine.length, scheduled: sched,
    text: `${l.status || 'Planning'}${mine.length ? ` · ${sched} of ${mine.length} email${mine.length === 1 ? '' : 's'}` : ''}` };
}

// Circle column, from the calendar alone (the Circle panel in the program asks Circle itself): how many of the sessions taught in
// Circle already have their Circle event
export function circleOf(row) {
  const mine = row.events.filter(e => inCircle(e));
  if (!mine.length) return { text: '—', state: 'none' };
  const done = mine.filter(e => circleLinkFor(e)).length;
  if (done === mine.length) return { text: 'In Circle', state: 'ok' };
  return { text: done ? `${done} of ${mine.length} in Circle` : 'Not in Circle yet', state: 'soon' };
}

// The word and colour of the Ready? pill: the same words the old Programming list used (labelOf), as a soft pill
export function readyOf(row) {
  const cls = { red: 'risk', amber: 'soon', green: 'ok', grey: 'none' }[row.status] || 'none';
  const next = row.nextCheck ? `Missing ${row.nextCheck.label}${row.nextCheck.detail ? ` (${row.nextCheck.detail})` : ''}` : '';
  return { word: labelOf(row), cls, next };
}

// Needs attention = something late, or due within the week (red or amber, the old list's own rule); everything else by month
export const needsAttention = r => (r.status === 'red' || r.status === 'amber') && r.phase !== 'ended';
// A row that has started sits in the current month; a row still to come sits in its first month
export const monthOf = (r, today) => (r.phase === 'upcoming' ? r.date : today).slice(0, 7);
export function sections(rows, today) {
  const attention = rows.filter(needsAttention);
  const rest = rows.filter(r => !needsAttention(r)).sort((a, b) => monthOf(a, today).localeCompare(monthOf(b, today)) || a.date.localeCompare(b.date));
  const months = [...new Set(rest.map(r => monthOf(r, today)))].map(m => ({ month: m, rows: rest.filter(r => monthOf(r, today) === m) }));
  return { attention, months };
}

// Campaigns: launches that don't belong to a program in the list (a launch tied to a session shows on that program's row instead)
export function campaignRows(launches, plan, programRows, today) {
  const taken = new Set(programRows.flatMap(r => r.events.map(e => evId(e))));
  return launches.filter(l => !(l.event_id && taken.has(lc(l.event_id))) && l.status !== 'Done').map(l => {
    const dates = [...Object.values(l.dates || {}), ...(l.steps || []).map(s => s.date)].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))).sort();
    const line = launchLine(l, plan), date = dates[0] || '';
    return { campaign: true, key: l.id, title: l.name, kind: l.kind || 'Campaign', date, end_date: dates[dates.length - 1] || date, launch: line, status: l.status === 'Live' ? 'green' : 'grey',
      phase: date && date > today ? 'upcoming' : 'running', events: [], teachers: '', checks: [], href: launchHref(l.id) };
  }).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
}

// "Is it ready?": the program's checks, one line per kind of check with the worst state across its sessions.
// Ready (all done), At risk (one is late), Soon (not yet due). Same checks and due dates the old drawer listed.
export function readyChecks(checks, today) {
  const by = new Map();
  for (const c of checks) by.set(c.label, [...(by.get(c.label) || []), c]);
  return [...by.entries()].map(([label, cs]) => {
    const open = cs.filter(c => !c.ready), late = open.some(c => c.due < today);
    return { label, detail: open.length ? (cs.length > 1 ? `${open.length} of ${cs.length} sessions` : open[0].detail || '') : '', rank: open.length ? (late ? 0 : 1) : 2,
      word: !open.length ? 'Ready' : late ? 'At risk' : 'Soon', cls: !open.length ? 'ok' : late ? 'risk' : 'soon' };
  }).sort((a, b) => a.rank - b.rank);
}

// Course Library items that belong to a program: the listing's ID is the program's series or event ID, or its title is the program's name or one of its public titles
export function libraryFor(row, events, offerings) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const ids = new Set([row.program, row.key, ...events.flatMap(e => [e.id, e.sched_id])].filter(Boolean).map(x => String(x).toLowerCase()));
  const titles = new Set([row.title, row.program_name, ...events.flatMap(e => [e.public_title, e.program_name])].map(norm).filter(Boolean));
  return offerings.filter(o => ids.has(String(o.offering_id).toLowerCase()) || titles.has(norm(o.title)));
}
