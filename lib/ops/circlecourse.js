import { loadCalendar } from '../calendar';
import { createSpace, updateSpace, createSection, createLesson, updateLesson, listSections } from '../circle';
import { readPlain, addPlain, updateRow, ensureColumns, TABLES } from './store';
import { wanted, liveAllowed, SPACE_COL } from './circlesync';

// Standalone courses (track EVENT, e.g. Navarātri) get their own Circle home, made from the ops dashboard:
//   - a course space (one lesson per session, or per day of a multi-day course) for readings and replays
//   - an events space "<title> · Live sessions", where the Circle sync (circlesync.js) makes each live event
// Both are made private and hidden, and the lessons as drafts, so members see nothing until "Push to Circle".
// The two space IDs go on a new Circle Groups row (offering = the course's Series, or its first event ID);
// each session's lesson ID(s) go in Event Details → "Circle Lesson".
// Programs with a home already (Sādhana School, Wisdom School, Meditation Mondays) only get events.
export const COURSE_COL = 'circle_course_space_id';
export const LESSON_COL = 'Circle Lesson';
export const COURSE_TRACKS = ['EVENT'];
const GROUPS = 'Circle Groups';
const lower = s => String(s || '').trim().toLowerCase();
const idsOf = v => String(v || '').split(/\s+/).filter(x => /^\d+$/.test(x));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const offeringOf = evs => evs[0]?.series || evs[0]?.sched_id || '';
export const isStandalone = evs => evs.length > 0 && evs.every(e => COURSE_TRACKS.includes(String(e.track).toUpperCase()));

// The program's own Circle Groups row (by its Series or one of its event IDs; a whole-track row doesn't count)
export async function courseRowFor(evs, { light = false } = {}) {
  const keys = new Set([...evs.map(e => e.series), ...evs.map(e => e.sched_id)].filter(Boolean).map(lower));
  const { rows } = await readPlain(GROUPS, { light });
  return rows.find(r => keys.has(lower(r.values.offering))) || null;
}

const sessionsOf = (cal, ids) => cal.filter(e => ids.includes(e.sched_id)).sort((a, b) => a.date.localeCompare(b.date));

// Make the course space, its live-sessions space and a draft lesson per session. Safe to press twice: a
// program that already has its own Circle Groups row is left alone.
export async function setupCourse(ids, who) {
  if (!liveAllowed()) throw new Error('Circle is switched off for the dashboard (set CIRCLE_EVENT_SYNC=live in Vercel to allow it)');
  const cal = await loadCalendar({ fresh: true });
  const evs = sessionsOf(cal, ids);
  if (!evs.length) throw new Error('None of these sessions are on the Master Schedule');
  if (!isStandalone(evs)) throw new Error('Only standalone courses get their own Circle space; this program’s events go in its existing space');
  if (!evs.every(e => e.sched_id)) throw new Error('Every session needs an event ID on the Schedule tab first');
  if (await courseRowFor(evs)) throw new Error('This course already has its Circle spaces (Settings → Circle spaces)');
  const title = evs[0].title, offering = offeringOf(evs), done = [];

  const course = await createSpace({ name: title, space_type: 'course', course_setting: { course_type: 'structured', custom_lesson_label: 'session' } });
  if (!course?.id) throw new Error('Circle made no course space');
  done.push(`Made the course space “${title}” (hidden)`);
  const live = await createSpace({ name: `${title} · Live sessions`, space_type: 'event', event_auto_rsvp_enabled: true });
  if (!live?.id) throw new Error(`Circle made the course space (${course.id}) but not its live-sessions space`);
  done.push(`Made the events space “${title} · Live sessions” (hidden)`);
  // Record the spaces straight away, so a failure below never leads to a second set
  await ensureColumns(GROUPS, ['offering', 'name', SPACE_COL, COURSE_COL]);
  await addPlain(GROUPS, { offering, name: title, [SPACE_COL]: String(live.id), [COURSE_COL]: String(course.id) }, { who });
  done.push(`Saved both on Settings → Circle spaces as “${offering}”`);

  const section = await createSection(course.id, 'Sessions');
  await ensureColumns(TABLES.details.title, [LESSON_COL], { headerRow: TABLES.details.headerRow });
  let n = 0;
  for (const ev of evs) {
    const w = wanted(ev, cal), made = [];
    for (const name of w.names) made.push((await createLesson(section.id, { name, body_html: ev.summary ? `<p>${esc(ev.summary)}</p>` : '' })).id);
    await updateRow('details', ev.sched_id, { [LESSON_COL]: made.join('\n') }, { who, create: true });
    n += made.length;
  }
  done.push(`Made ${n} draft lesson${n === 1 ? '' : 's'}`);
  return { done, course: course.id, live: live.id };
}

// Part of "Push to Circle": unhide the course's two spaces, publish its lessons (making any for sessions
// added since) and keep lesson names in step with the sheet. Nothing to do for programs without a course space.
export async function publishCourse(ids, who) {
  const cal = await loadCalendar({ fresh: true });
  const evs = sessionsOf(cal, ids);
  const row = evs.length ? await courseRowFor(evs) : null;
  const courseId = row?.values[COURSE_COL];
  if (!courseId) return { done: [], errors: [] };
  const out = { done: [], errors: [] };
  try {
    await updateSpace(courseId, { is_hidden: false });
    if (row.values[SPACE_COL]) await updateSpace(row.values[SPACE_COL], { is_hidden: false });
    out.done.push('Course spaces visible to their members');
  } catch (e) { out.errors.push(`Course space: ${e.message}`); return out; }
  let section = null;
  for (const ev of evs) {
    const w = wanted(ev, cal), have = idsOf(ev.circle_lesson);
    try {
      const ids2 = [];
      for (const [i, name] of w.names.entries()) {
        if (have[i]) { await updateLesson(have[i], { name, status: 'published' }); ids2.push(have[i]); continue; }
        section ||= (await listSections(courseId))[0] || await createSection(courseId, 'Sessions');
        ids2.push(String((await createLesson(section.id, { name, status: 'published' })).id));
      }
      if (ids2.join('\n') !== have.join('\n')) await updateRow('details', ev.sched_id, { [LESSON_COL]: ids2.join('\n') }, { who, create: true });
      out.done.push(`Published ${w.names.length === 1 ? 'the lesson' : `${w.names.length} lessons`} for ${ev.sched_id}`);
    } catch (e) { out.errors.push(`${ev.sched_id} lesson: ${e.message}`); }
  }
  return out;
}
