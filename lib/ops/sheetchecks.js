// Things on the Master Schedule that are probably mistakes, found by reading it (nothing is changed).
// Shown to editors at the top of Programming. Only upcoming sessions are checked.
import { todayET, emailsOf } from '../events';

const names = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function sheetChecks(cal, today = todayET()) {
  const up = cal.filter(e => (e.end_date || e.date) >= today && !/cancel/i.test(e.status));
  const out = [];
  const add = (kind, text, e) => out.push({ kind, text, key: e ? (e.series && e.track !== 'MM' ? `P-${e.series}` : e.id) : '' });
  // Two rows for the same session
  const seen = new Map();
  for (const e of up) {
    const k = `${e.date}|${e.track}|${(e.series || e.title).toLowerCase()}`;
    if (seen.has(k)) add('Duplicate', `${short(e.date)} ${e.track}: “${e.title}” is on the Schedule twice (${seen.get(k)} and ${e.sched_id || 'no ID'})`, e);
    else seen.set(k, e.sched_id || 'no ID');
  }
  // A series used on more than one track
  const tracks = {};
  for (const e of up) if (e.series) (tracks[e.series] ||= new Set()).add(e.track);
  for (const [s, t] of Object.entries(tracks)) if (t.size > 1) add('Series', `The series “${s}” is used on ${[...t].join(' and ')}: one program should have one track`, up.find(e => e.series === s));
  // A series with only one session (often a typo in the name)
  const count = {};
  for (const e of cal) if (e.series) count[e.series] = (count[e.series] || 0) + 1;
  for (const e of up) if (e.series && count[e.series] === 1 && e.track !== 'MM' && !/meditation/.test(e.series)) add('Series', `${short(e.date)}: “${e.series}” has only this one session. A typo in the series name?`, e);
  // Reminder emails with no teacher named, or the other way round, in the next 8 weeks
  const soon = new Date(Date.parse(today) + 56 * 864e5).toISOString().slice(0, 10);
  for (const e of up.filter(e => e.date <= soon && e.track !== 'LAUNCH')) {
    if (emailsOf(e).length && !names(e.teachers).length) add('People', `${short(e.date)} “${e.title}”: reminder emails are set but no teacher is named`, e);
    if (names(e.teachers).length > emailsOf(e).length && emailsOf(e).length) add('People', `${short(e.date)} “${e.title}”: ${names(e.teachers).length} teachers but only ${emailsOf(e).length} reminder email${emailsOf(e).length === 1 ? '' : 's'}`, e);
  }
  // On the website with no public title (it shows the internal event name)
  for (const e of up.filter(e => e.website && !e.public_title && e.title === e.internal_title?.replace(/\s*\(.*\)\s*$/, '').trim() && /[—–]|wk \d|\[|TBD/i.test(e.title))) {
    add('Website', `${short(e.date)}: on the website as “${e.title}”, the internal name. Add a public title.`, e);
  }
  return out;
}
