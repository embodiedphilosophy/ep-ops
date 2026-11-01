// The "This week" page for Sahṛdaya Upāya mentees, as one plain object. Pure: every source is passed in, so
// it is easy to test (scripts/member-test/mentee.mjs). lib/mentee/load.js gathers the sources.
import { normEvent, normPost } from '../school/tabs';
import { MILESTONES } from '../member/practice';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const toDate = s => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ms = iso => (iso ? new Date(iso).getTime() : NaN);
const firstOf = (...v) => v.find(x => x !== undefined && x !== null && x !== '');

export const validZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return !!tz; } catch { return false; } };
// The calendar day of an instant in a time zone
export const dayIn = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

// Week 1 is the week (Mon–Sun) holding Session 1, and it stays Week 1 until then
export function weekNumber(startsOn, today) {
  const mon = d => addDays(d, -((toDate(d).getUTCDay() + 6) % 7));
  return Math.max(1, Math.round((toDate(mon(today)) - toDate(mon(startsOn))) / (7 * 864e5)) + 1);
}
export const weekDays = today => { const mon = addDays(today, -((toDate(today).getUTCDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => addDays(mon, i)); };

// The mālā: one bead per practice day; after 108 it starts a new round
export function mala(days) {
  const round = days > 0 ? Math.ceil(days / 108) : 0;
  const filled = days === 0 ? 0 : ((days - 1) % 108) + 1;
  return { days, filled, round, next: MILESTONES.find(m => m > filled) || 108 };
}

// Hours by type, for "Formation hours"
export function hoursByType(f) {
  const by = {};
  for (const c of f.components) by[c.type] = Math.round(((by[c.type] || 0) + c.credited) * 100) / 100;
  return { total: f.total, target: f.target, byType: Object.entries(by).map(([type, hours]) => ({ type, hours })), components: f.components.map(c => ({ id: c.id, name: c.name, target: c.target, credited: c.credited, pending: c.pending || 0 })), entries: f.entries };
}

// Circle events in this season's spaces → the sessions on the page. Sheet items cover what Circle doesn't hold
// (immersions, the one-to-one window); a Wednesday session that Circle already lists is not shown twice.
export function sessionsFrom(rawEvents, spaceIds) {
  const spaces = new Set(spaceIds.filter(Boolean).map(String));
  return rawEvents.map(normEvent).filter(e => spaces.has(e.spaceId) && !Number.isNaN(ms(e.start))).sort((a, b) => ms(a.start) - ms(b.start))
    .map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end || '', url: e.pageUrl || e.url || '', rsvped: e.rsvped }));
}

const sameSession = (item, sessions) => sessions.some(s => item.start ? Math.abs(ms(s.start) - ms(item.start)) < 30 * 60000 : false)
  || (item.kind === 'session' && sessions.some(s => s.start.slice(0, 10) === item.date));

export function buildWeek(x) {
  const { today, tz, now = Date.now(), season, practice, practiceDays, formation, circleDown } = x;
  const days = weekDays(today);
  const sessions = x.sessions || [];
  const upcoming = sessions.filter(s => (ms(s.end) || ms(s.start) + 2 * 3600e3) + 30 * 60000 >= now);

  const sheet = (x.schedule || []).filter(i => !sameSession(i, sessions));
  const grid = practice.grid.at(-1); // this week, Monday first
  const week = days.map((day, i) => {
    const items = [
      ...sessions.filter(s => dayIn(s.start, tz) === day).map(s => ({ title: s.title, start: s.start, url: s.url, circle: true, kind: 'session' })),
      ...sheet.filter(i2 => i2.kind !== 'one' && (i2.start ? dayIn(i2.start, tz) === day : i2.date <= day && (i2.end_date || i2.date) >= day))
        .map(i2 => ({ title: i2.title, start: i2.start || '', allDay: !i2.start, url: i2.url || '', circle: false, kind: i2.kind, label: i2.label || '' })),
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return { day, dot: grid[i]?.state || 'future', items };
  });

  const subs = x.submissions || {};
  const assignments = (x.assignments || []).map(a => {
    const sub = subs[a.id] || null;
    return { ...a, done: x.doneIds.has(a.id) || (a.type === 'handin' && !!sub && sub.status !== 'draft'), submission: sub };
  });
  const oneToOne = (x.schedule || []).find(i => i.kind === 'one' && i.book) || null;

  return {
    ok: true, today, tz,
    greeting: { firstName: x.firstName || '', seasonTitle: season.title.split(' · ').slice(1).join(' · ') || season.title, week: weekNumber(season.starts_on, today), weeks: x.weeks || null, badge: 'Sahṛdaya Upāya' },
    practice: { streak: practice.streak, loggedToday: practice.loggedToday, weekCount: practice.weekCount, nextMilestone: practice.nextMilestone, reached: practice.reached },
    mala: mala(practiceDays),
    nextLive: upcoming[0] || null,
    sessions: upcoming.slice(0, 12),
    due: { done: assignments.filter(a => a.done).length, total: assignments.length, items: assignments },
    oneToOne: oneToOne && { title: oneToOne.title, from: oneToOne.date, to: oneToOne.end_date, url: oneToOne.book },
    week,
    reading: x.reading || null,
    workbookUrl: x.workbookUrl || '',
    mentorship: { posts: (x.posts || []).map(normPost).sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 3).map(p => ({ id: p.id, title: p.title, who: p.teacher, at: p.at, url: p.url, replies: p.replies })), feedback: x.feedback || [], circleUrl: x.circleUrl, messageUrl: x.messageUrl },
    formation: formation ? hoursByType(formation) : null,
    travelogue: x.travelogue || [],
    launches: x.launches || [],
    // Anything that couldn't be read just now, so the page can say so instead of showing a blank
    unavailable: x.unavailable || [],
    circleDown: !!circleDown,
    // true on the fast first answer: sessions, threads and the calendar are still on their way
    pending: !!x.pending,
  };
}
