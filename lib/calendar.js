import { googleConfigured, readRange, toObjects } from './google';

// The Master Schedule (EP-Programming-Calendar) is the ONE calendar: website events, Zoom meetings,
// teacher reminders and Motion tasks all read it. Per-row columns override the Track Defaults tab:
// Time, Website, Public Title, Teachers, Course Host, Zoom (blank | one-off | series), Duration,
// Registration URL, Video ID, Summary, Series, Public Note, Host Label, Zoom Link, Teacher/Host Emails.
// A multi-day event keeps its date range in the Event name, e.g. "Navaratri  (Oct 11–Oct 20)".
// Vercel: CALENDAR_SHEET_ID
export const calendarConfigured = () => !!process.env.CALENDAR_SHEET_ID && googleConfigured();
const SHEET = () => process.env.CALENDAR_SHEET_ID;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const HOST = { MM: 'Wisdom School', WSML: 'Wisdom School', WSQ: 'Wisdom School', LRL: 'Living Room Lectures', CHIT: 'CHITHEADS Live', SS: 'Sādhana School', SSWW: 'Sādhana School', EVENT: 'Seasonal immersion' };
const yes = v => String(v || '').trim().toUpperCase() === 'TRUE';

function normDate(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // 8/3/2026
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
// "(Oct 11–Oct 19)" in the event name → end date
function rangeEnd(title, start) {
  const m = String(title).match(/\(([A-Za-z]{3})\s*(\d{1,2})\s*[–-]\s*([A-Za-z]{3})\s*(\d{1,2})\)/);
  if (!m) return '';
  let y = Number(start.slice(0, 4));
  const sm = MONTHS[m[1].toLowerCase()], em = MONTHS[m[3].toLowerCase()];
  if (em < sm) y += 1;
  return `${y}-${String(em).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`;
}
const cleanTitle = t => String(t).replace(/\s*\[PROPOSED\]\s*/i, ' ').replace(/\s*\([A-Za-z]{3}\s*\d{1,2}\s*[–-]\s*[A-Za-z]{3}\s*\d{1,2}\)\s*$/, '').trim();

export async function loadCalendar({ fresh = false } = {}) {
  const [sched, defs] = await Promise.all([
    readRange(SHEET(), "'Master Schedule'!A4:Z1000", { fresh }),
    readRange(SHEET(), "'Track Defaults'!A1:N50", { fresh }),
  ]);
  const D = Object.fromEntries(toObjects(defs).map(d => [d.track, d]));
  const seen = {};
  return toObjects(sched).map(r => {
    const date = normDate(r.date);
    const track = String(r.track || '').toUpperCase();
    if (!date || !track) return null;
    const d = D[track] || {};
    let id = `${date}-${track.toLowerCase()}`;
    seen[id] = (seen[id] || 0) + 1; if (seen[id] > 1) id += `-${seen[id]}`;
    return {
      id, date, end_date: rangeEnd(r.event, date), track,
      title: r.public_title || d.public_title || cleanTitle(r.event), internal_title: r.event,
      time: r.time || d.time || '', program: d.program || '', series: r.series || d.series || '',
      price: d.price_label || r.access || '', host: r.host_label || HOST[track] || '',
      note: r.public_note || d.public_note || '', zoom_registration: r.zoom_registration || d.zoom_registration || '',
      teachers: r.teachers || '', course_host: r.course_host || '',
      zoom: r.zoom ? r.zoom : (d.zoom || ''), duration_minutes: r.duration || d.duration || '',
      zoom_link: r.zoom_link || '', teacher_host_emails: r.teacher_host_emails || r.emails || '',
      registration_url: r.registration_url || '', video_id: r.video_id || '', summary: r.summary || '',
      website: r.website ? yes(r.website) : yes(d.website),
      owner: r.teacher_owner || '', audience: r.audience || '', access: r.access || '', promo_starts: r.promo_starts || '',
      status: r.status || '', notes: r.notes || '', publish: 'TRUE', _row: r._row + 3,
    };
  }).filter(Boolean);
}

export async function loadTeam({ fresh = false } = {}) {
  const rows = toObjects(await readRange(SHEET(), "'Team'!A1:G300", { fresh }));
  return rows.filter(r => r.name && String(r.active).toUpperCase() !== 'FALSE').map(r => ({
    ...r, email: r.email.toLowerCase(),
    roles: String(r.roles || '').split(',').map(s => s.trim()).filter(Boolean),
    director: String(r.type).toLowerCase() === 'director',
  }));
}

export async function loadTemplates({ fresh = false } = {}) {
  return toObjects(await readRange(SHEET(), "'Task Templates'!A1:E500", { fresh })).filter(t => t.track && t.task);
}
