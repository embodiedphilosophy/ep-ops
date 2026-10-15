// Programs: a course, certificate or Sādhana School season made of several sessions. On the sheet a program
// is simply the Schedule + Event Details rows that share one Series value; nothing new is needed by the
// website, reminders, Zoom/Circle or tasks, which keep reading each session row as before.
// Two dashboard-only Event Details columns hold the program's name and each session's module title. The
// website reads Public Title and Summary, so saving a module fills those:
//   Public Title = "Program name: Module title" (or just the program name while the module has no title)
//   Summary      = the module's description
// The website's events widget shows one card per series (the next session), so it always shows the next
// module's title and description.
export const PROGRAM_COLS = ['Program Name', 'Module Title'];
export const CADENCES = [
  { value: 'weekly', label: 'Every week', days: 7 },
  { value: 'biweekly', label: 'Every two weeks', days: 14 },
  { value: 'daily', label: 'Every day', days: 1 },
  { value: 'monthly', label: 'Every month (same date)', months: 1 },
];
// Fields set once for the whole program (applied to every session)
export const SHARED = ['Program Name', 'Teachers & Hosts', 'Teacher/Host Emails', 'Course Host', 'Time', 'Website', 'Registration URL', 'Price Label', 'Host Label', 'Enrolled Tag'];

const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function addMonths(d, n) {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}
// The dates of `count` sessions from `start`
export function sessionDates(start, count, every) {
  const c = CADENCES.find(x => x.value === every) || CADENCES[0];
  return Array.from({ length: count }, (_, i) => c.months ? addMonths(start, i * c.months) : addDays(start, i * c.days));
}
// One date after the last, keeping the program's rhythm (the gap between its last two sessions; a week if unknown)
export function nextDate(dates) {
  const d = [...dates].sort();
  if (!d.length) return '';
  if (d.length < 2) return addDays(d[0], 7);
  const gap = Math.round((Date.parse(d.at(-1)) - Date.parse(d.at(-2))) / 864e5);
  return gap >= 28 && gap <= 31 ? addMonths(d.at(-1), 1) : addDays(d.at(-1), gap > 0 ? gap : 7);
}
export const publicTitle = (name, module) => {
  const n = String(name || '').trim(), m = String(module || '').trim();
  return n && m ? `${n}: ${m}` : n || m;
};
export const seriesSlug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
export const sessionName = (name, k) => `${String(name).trim()} — Session ${k}`;
