import { loadCalendar } from './calendar';

// The Master Schedule (EP-Programming-Calendar) is the only calendar the ops app reads.
// "Today" in US Eastern time, as YYYY-MM-DD
export function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
export const zoomLinkOf = e => String(e.zoom_link || e['zoom link'] || '').trim();
export const emailsOf = e => [...new Set(String(e.teacher_host_emails || e['teacher/host emails'] || e.emails || '')
  .split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
// Every Master Schedule row: what the reminders read
export const reminderRows = () => loadCalendar();
