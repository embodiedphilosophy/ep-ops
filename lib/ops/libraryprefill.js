import { loadPages, loadProfiles, offeringKey } from '../teach';
import { loadCalendar } from '../calendar';
import { todayET, emailsOf } from '../events';

// What teacher onboarding already knows about an offering, to pre-fill the Course Library form.
// Sources: the Course Pages tab (one row per offering, filled in /teach), the Teachers tab (bio, headshot) and
// the programming calendar (sessions, dates). Every value carries its source so the form can show where it came from.
const lower = s => String(s || '').trim().toLowerCase();
const lines = s => String(s || '').split(/\r?\n|•|;/).map(x => x.replace(/^[-–*\s]+/, '').trim()).filter(Boolean);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

export async function onboardingPages() { return loadPages({ fresh: true }); }

// Onboarding rows a person can pick in "Link to onboarding submission"
export async function linkChoices() {
  const pages = await loadPages({ fresh: false });
  return pages.map(p => ({ id: p.offering, title: p.title || p.offering, status: p.status || 'draft', circle_space_id: String(p.circle_space_id || '') }));
}

// A Course Pages row whose Circle space ID is this course's ID links itself
export async function autoLink(circleCourseId, ctx) {
  if (!circleCourseId) return '';
  const hit = (ctx?.pages || await loadPages({ fresh: false })).find(p => String(p.circle_space_id || '').trim() === String(circleCourseId));
  return hit?.offering || '';
}

// Read the three tabs once (the hourly sync pre-fills many offerings from one read)
export async function onboardingContext({ fresh = true } = {}) {
  const [pages, profiles, cal] = await Promise.all([loadPages({ fresh }), loadProfiles({ fresh }), loadCalendar({ fresh: false }).catch(() => [])]);
  return { pages, profiles, cal };
}

export async function prefill(onboardingId, { today = todayET(), ctx } = {}) {
  if (!onboardingId) return null;
  const { pages, profiles, cal } = ctx || await onboardingContext();
  const page = pages.find(p => lower(p.offering) === lower(onboardingId));
  if (!page) return null;
  const evs = cal.filter(e => offeringKey(e) === page.offering).sort((a, b) => a.date.localeCompare(b.date));
  const emails = [...new Set([...String(page.teacher_emails || '').split(/[\s,]+/).map(lower).filter(Boolean), ...evs.flatMap(e => emailsOf(e))])];
  const pageDone = ['submitted', 'published'].includes(lower(page.status));
  const faculty = emails.map(email => {
    const p = profiles.find(x => lower(x.email) === email);
    return { email, name: p?.name || email, done: !!(p && (p.onboarded_on || ['submitted', 'approved'].includes(lower(p.status)))) && pageDone };
  });
  const teachers = faculty.map(f => { const p = profiles.find(x => lower(x.email) === f.email); return { name: p?.name || f.name, role: p?.role || '', bio: p?.bio || '', photo: p?.photo_url || '', email: f.email }; });
  const first = evs[0], last = evs[evs.length - 1];
  const upcoming = evs.find(e => (e.end_date || e.date) >= today);
  const length = !evs.length ? '' : evs.length === 1 ? '1 session' : `${Math.max(1, Math.ceil((daysBetween(first.date, last.end_date || last.date) + 1) / 7))} weeks · ${evs.length} sessions`;
  const where = 'Course Pages tab';
  const values = {
    description: [page.summary, page.audience && `Who it’s for: ${page.audience}`].filter(Boolean).join('\n\n'),
    included: lines(page.explore), teachers,
    sessions: evs.map(e => ({ id: e.id, date: e.date, time: e.time || '', title: e.title, teacher: e.teachers || '' })),
    length, next_date: upcoming?.date || '', next_session: upcoming ? `${upcoming.date} · ${upcoming.title}` : '',
  };
  const sources = {
    description: where, included: where, teachers: 'Teachers tab (bio, headshot)', sessions: 'Programming calendar', length: 'Programming calendar', next_date: 'Programming calendar',
  };
  return { id: page.offering, title: page.title || '', subtitle: page.subtitle || '', status: page.status || '', values, sources, faculty };
}
