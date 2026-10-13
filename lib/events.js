import placeholder from '@/data/events.json';
import { readTab } from './sheet';
import { calendarConfigured, loadCalendar } from './calendar';

// Programs: lrl | wisdom | sadhana | seasonal
// Sheet columns (header row, any order):
// id, title, date (YYYY-MM-DD), end_date, time (display text, e.g. "7pm ET"), program,
// price (Free | Pay what you can | By donation | Members | Enrolled | Enroll | $79),
// host, note, registration_url, series, publish (TRUE/FALSE)

// "Today" in US Eastern time, as YYYY-MM-DD
export function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const iso = d => d.toISOString().slice(0, 10);

// Which sheet drives the website's events: "site" (EP Site Events tab, the default) or
// "calendar" (the Master Schedule). Set events_source in Links & Prices. Ops always uses the calendar.
async function useCalendar() {
  if (!calendarConfigured()) return false;
  const links = (await readTab('links')) || [];
  const v = String(links.find(r => r.key === 'events_source')?.value || 'site').trim().toLowerCase();
  return v === 'calendar';
}

// Tidy rows typed by hand: "mm" means Meditation Mondays
function normalize(e) {
  const prog = String(e.program || '').trim().toLowerCase();
  if (prog === 'mm' || /^meditation mondays?$/i.test(String(e.title || '').trim())) {
    return { ...e, program: 'wisdom', series: e.series || 'meditation-mondays' };
  }
  return { ...e, program: prog };
}
const live = e => e.title && e.date && String(e.publish).toUpperCase() !== 'FALSE';

// Private columns: used by the Zoom sync and teacher reminders, never sent to website pages.
// EP Site Events headers: zoom_link, teacher_host_emails  (Master Schedule: "Zoom Link", "Teacher/Host Emails")
export const zoomLinkOf = e => String(e.zoom_link || e['zoom link'] || '').trim();
export const emailsOf = e => [...new Set(String(e.teacher_host_emails || e['teacher/host emails'] || e.emails || '')
  .split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
const PRIVATE = ['zoom_link', 'zoom link', 'teacher_host_emails', 'teacher/host emails', 'emails', 'course_host_emails', 'circle_event', 'circle_sync', 'replay_link'];
const publicOnly = e => Object.fromEntries(Object.entries(e).filter(([k]) => !PRIVATE.includes(k)));

// Expand the Recurring tab (e.g. Meditation Mondays) into dated events for the next 10 weeks
export async function recurringRules() {
  if (await useCalendar()) return []; // weekly series live in the Master Schedule
  return ((await readTab('recurring')) || []).filter(r => r.title && String(r.publish).toUpperCase() !== 'FALSE');
}

const skip = r => new Set(String(r.skip_dates || '').split(',').map(x => x.trim()).filter(Boolean));
async function recurringRows() {
  const rules = await recurringRules();
  const today = todayET();
  const out = [];
  for (const r of rules) {
    const wd = String(r.weekday || '').trim().toLowerCase();
    if (wd === 'daily') {
      for (let i = 0, d = new Date(today + 'T12:00:00Z'); i < 70; i++, d.setUTCDate(d.getUTCDate() + 1)) {
        const date = iso(d);
        if ((r.start_date && date < r.start_date) || (r.end_date && date > r.end_date) || skip(r).has(date)) continue;
        out.push({ ...r, teacher_host_emails: '', _generated: true, id: `${r.series || r.title}-${date}`, date, end_date: '', publish: 'TRUE' });
      }
      continue;
    }
    const dow = DAYS.indexOf(wd);
    if (dow < 0) continue;
    const skip = new Set(String(r.skip_dates || '').split(',').map(x => x.trim()).filter(Boolean));
    const d = new Date(today + 'T12:00:00Z');
    while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
    for (let i = 0; i < 10; i++, d.setUTCDate(d.getUTCDate() + 7)) {
      const date = iso(d);
      if ((r.start_date && date < r.start_date) || (r.end_date && date > r.end_date) || skip.has(date)) continue;
      out.push({ ...r, teacher_host_emails: '', _generated: true, id: `${r.series || r.title}-${date}`, date, end_date: '', publish: 'TRUE' });
    }
  }
  return out;
}

// Website event rows (plus generated weekly sessions). A row typed into the events tab
// for the same series and date replaces the generated one, so you can name that week's teacher.
async function siteRows() {
  const typed = ((await readTab('events')) || placeholder).filter(live).map(normalize);
  const taken = new Set(typed.filter(e => e.series).map(e => `${e.series}|${e.date}`));
  const generated = (await recurringRows()).map(normalize).filter(e => !taken.has(`${e.series}|${e.date}`));
  return [...typed, ...generated];
}

// Every event (website or not), used by the Zoom automation
export async function eventRows() {
  if (await useCalendar()) {
    try { return await loadCalendar(); } catch (e) { console.error('Calendar read failed, using EP Website sheet', e.message); }
  }
  return ((await readTab('events')) || placeholder).filter(live).map(normalize);
}

// Teacher reminders: every event row, plus the dated sessions of Recurring rules
// A Recurring rule's course_host_emails go to the course host(s) for EVERY session of that course;
// nobody else on the rule is emailed. Session teachers are named per session on EP Site Events
// (a row with the same series + date), and only those people get that session's reminders.
export async function reminderRows() {
  if (await useCalendar()) return eventRows();
  const hosts = {};
  for (const r of (await recurringRules())) if (r.series && r.course_host_emails) hosts[r.series] = r.course_host_emails;
  return (await siteRows()).map(e => ({ ...e, teacher_host_emails: e.teacher_host_emails || '', course_host_emails: hosts[e.series] || e.course_host_emails || '' }));
}
export const hostEmailsOf = e => emailsOf({ teacher_host_emails: e.course_host_emails });

export async function loadRows() {
  if (await useCalendar()) {
    try { return (await loadCalendar()).filter(e => e.website).map(publicOnly); } catch (e) { console.error('Calendar read failed, using EP Website sheet', e.message); }
  }
  return (await siteRows()).filter(live).map(publicOnly);
}

// Upcoming and ongoing events, soonest first
export async function getEvents() {
  const today = todayET();
  return (await loadRows())
    .filter(e => (e.end_date || e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Past events, most recent first
export async function getPastEvents() {
  const today = todayET();
  return (await loadRows())
    .filter(e => (e.end_date || e.date) < today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const isFree = e => ['free', 'pay what you can', 'by donation'].includes(String(e.price).toLowerCase());
