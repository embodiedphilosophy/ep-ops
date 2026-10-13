import { readRange, toObjects } from './google';
import { calendarConfigured, loadCalendar, PROFILES_TAB } from './calendar';

// Course pages written by teachers in onboarding (/teach). They live in the
// EP-Programming-Calendar sheet: Course Pages (one row per offering) and Teachers (one row per teacher).
// A page is public once its status is "published". Read-only here; the ops app writes them.
const tab = async name => {
  if (!calendarConfigured()) return [];
  try { return toObjects(await readRange(process.env.CALENDAR_SHEET_ID, `'${name}'!A1:Z2000`)); } catch { return []; }
};
const offeringKey = ev => ev.series || ev.id;

export async function getCoursePage(slug) {
  const page = (await tab('Course Pages')).find(p => p.slug === slug && String(p.status).toLowerCase() === 'published');
  if (!page) return null;
  const evs = (await loadCalendar()).filter(e => offeringKey(e) === page.offering).sort((a, b) => a.date.localeCompare(b.date));
  if (!evs.length) return null;
  const f = evs[0], last = evs[evs.length - 1];
  const emails = String(page.teacher_emails || '').split(/[\s,]+/).map(s => s.toLowerCase()).filter(Boolean);
  const teachers = (await tab(PROFILES_TAB)).filter(p => emails.includes(String(p.email).toLowerCase()))
    .map(p => ({ name: p.name, role: p.role, bio: p.bio, photo: p.photo_url }));
  return {
    page, teachers: teachers.length ? teachers : [{ name: f.teachers }],
    offering: { program: f.program, host: f.host, time: f.time, price: f.price, start: f.date, end: last.end_date || last.date,
      registration_url: f.registration_url, sessions: evs.map(e => ({ id: e.id, date: e.date, time: e.time })) },
  };
}

export async function publishedCourseSlugs() {
  return (await tab('Course Pages')).filter(p => p.slug && String(p.status).toLowerCase() === 'published').map(p => p.slug);
}

// Approved teacher profiles (status = approved), by name: their bio/photo replace the Teachers tab's
export async function approvedProfiles() {
  return (await tab(PROFILES_TAB)).filter(r => r.name && String(r.status).toLowerCase() === 'approved');
}
