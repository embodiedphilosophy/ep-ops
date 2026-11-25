// Facts for the program cards, read from the Master Schedule and teacher onboarding. Missing facts are named, never guessed or typed.
import { loadCalendar } from '../../calendar';
import { loadProfiles } from '../../teach';
import { addDays } from '../tasks';

const TEXTH = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
// "12:00pm" / "12pm ET" / "11:00" → minutes after midnight, or null
export function minutesOf(t) {
  const m = String(t || '').match(TEXTH); if (!m) return null;
  let h = +m[1]; const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return h * 60 + (+m[2] || 0);
}
const clock = mins => `${mins >= 720 ? (mins / 60 | 0) % 12 || 12 : (mins / 60 | 0) || 12}${mins % 60 ? ':' + String(mins % 60).padStart(2, '0') : ''}${mins >= 720 ? 'pm' : 'am'}`;
// ET on a date → London on the same instant ("17:00 London")
export function londonOf(date, time) {
  const m = minutesOf(time); if (m == null || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const guess = new Date(`${date}T${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00Z`);
  // find the UTC instant whose New York clock reads that time
  const ny = d => new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const off = guess - ny(guess);
  const instant = new Date(guess.getTime() + off);
  return `${instant.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} London`;
}
const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const whenOf = (date, time) => `${new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${time ? ` · ${/(am|pm)/i.test(time) ? time : (minutesOf(time) != null ? clock(minutesOf(time)) : time)} ET` : ''}`.replace(/ ET ET$/, ' ET');

const linkOf = e => e.registration_url || e.open_url || e.zoom_registration || '';
const teacherOf = e => String(e.teachers || e.course_host || e.host || '').trim();

export async function findEvent(id) { return (await loadCalendar()).find(e => e.id === id || e.sched_id === id); }

// → { data } or { missing: ['price', 'link'] }
export function eventFacts(e) {
  const need = { title: e.title, date: e.date, time: e.time, price: e.price, link: linkOf(e), teacher: teacherOf(e) };
  const missing = Object.entries(need).filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
  if (missing.length) return { missing };
  return { data: { title: e.title, program: e.program || e.series || '', when: whenOf(e.date, e.time), london: londonOf(e.date, e.time), teacher: teacherOf(e), price: e.price, linkLabel: 'Link in bio' } };
}

// The events of a Mon–Sun week for the Sunday carousel. Listed by default: public events whose track shows in the
// newsletter, leaving out the Sādhana School weekly sessions. Event Details "This Week" overrides that for one row:
// show (always listed) or hide (never). With { all: true } the unlisted ones come too (listed: false, why), so the
// page can offer them; each event also says what it belongs to (its series or repeating name) and how many later
// sessions share it, so an edit can be saved for them too.
const SS_WEEKLY = /s[āa]dhana school.*(weekly|session|wk\s*\d+)|weekly.*s[āa]dhana school/i;
// The sessions an edit can reach: the same Series, else the same track and Event name
export const groupKey = e => e.series ? `s:${e.series}` : `n:${e.track}:${String(e.internal_title).trim().toLowerCase()}`;
const clockOf = (date, time) => (time ? whenOf(date, time).split(' · ')[1] || time : '').replace(/\s*ET$/i, '');
function whyHidden(e, excludeRe) {
  if (e.this_week === 'hide') return 'Set to never show in This Week at EP';
  if (e.this_week === 'show') return '';
  if (e.newsletter !== 'show') return `${e.track} sessions are left out by default`;
  if (!/public|free/i.test(e.audience || 'public')) return `For ${e.audience} only`;
  if (excludeRe.test([e.program, e.series, e.internal_title].join(' '))) return 'Sādhana School weekly sessions are internal';
  return '';
}
export async function weekEventList(monday, { excludeRe = SS_WEEKLY, all = false } = {}) {
  const end = addDays(monday, 6), cal = await loadCalendar();
  const later = {};
  for (const e of cal) if (e.date > monday) (later[groupKey(e)] ||= []).push(e.date);
  return cal
    .filter(e => e.date >= monday && e.date <= end && !/cancel/i.test(e.status))
    .map(e => ({ e, why: whyHidden(e, excludeRe) }))
    .filter(x => all || !x.why)
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || String(a.e.time).localeCompare(String(b.e.time)))
    .map(({ e, why }) => ({ id: e.id, sched_id: e.sched_id, title: e.title, date: e.date, day: dayLabel(e.date), time: clockOf(e.date, e.time) ? `${clockOf(e.date, e.time)} ET` : '', london: londonOf(e.date, e.time),
      program: e.parent_program || e.host || e.program || e.track, line: e.note || e.summary || '', missing: ['title', 'date', 'time'].filter(k => !String(e[k] || '').trim()),
      listed: !why, why, track: e.track, series: e.series, program_name: e.program_name, module_title: e.module_title, this_week: e.this_week || '',
      time_raw: e.time, note: e.note, label: e.parent_program || e.host_label || '', later: (later[groupKey(e)] || []).filter(d => d > e.date).length,
      kind: e.program_name ? 'program' : (later[groupKey(e)] || []).some(d => d > e.date) ? 'repeat' : 'one-off' }));
}

export async function teacherFacts(email) {
  const p = (await loadProfiles()).find(x => String(x.email).toLowerCase() === String(email).toLowerCase());
  if (!p) return { missing: ['teacher'] };
  const missing = [!p.name && 'name', !p.bio && 'bio', !p.photo_url && 'headshot'].filter(Boolean);
  if (missing.length) return { missing };
  return { data: { name: p.name, role: p.role || '', bio: String(p.bio).split(/(?<=[.!?])\s/)[0].slice(0, 220), program: '' }, photo: p.photo_url, status: p.status };
}
export const listTeachers = async () => (await loadProfiles()).filter(p => p.name).map(p => ({ email: p.email, name: p.name, role: p.role || '', has_photo: !!p.photo_url, has_bio: !!p.bio, status: p.status || '' }));
