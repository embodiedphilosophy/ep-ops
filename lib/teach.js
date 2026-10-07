import { readRange, writeRange, appendRows, toObjects, colLetter } from './google';
import { loadCalendar, loadTemplates, loadTeam } from './calendar';
import { todayET, emailsOf } from './events';
import { addDays, eventIdFromTag, names } from './ops/tasks';
import { listTasks, completeTask } from './ops/motion';
import { photoKey, getAllTeachers } from './content';

// Teacher onboarding data lives in two tabs of the EP-Programming-Calendar sheet (CALENDAR_SHEET_ID):
//   Teacher Profiles: one row per teacher (keyed by email)
//   Course Pages:     one row per offering (keyed by offering = the Master Schedule Series, or the event ID)
const SHEET = () => process.env.CALENDAR_SHEET_ID;
export const PROFILE_COLS = ['email', 'name', 'role', 'bio', 'photo_url', 'status', 'updated_on', 'onboarded_on'];
export const PAGE_COLS = ['offering', 'slug', 'track', 'teacher_emails', 'title', 'subtitle', 'summary', 'explore', 'audience',
  'readings_mode', 'readings', 'promo_1', 'promo_2', 'promo_3', 'promo_clip', 'status', 'submitted_on',
  'circle_space_id', 'circle_status', 'live_notified_on'];

const lower = s => String(s || '').trim().toLowerCase();
export const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

// ---------- generic tab store ----------
async function readTab(tab, { fresh = true } = {}) {
  const values = await readRange(SHEET(), `'${tab}'!A1:Z2000`, { fresh });
  return { head: (values[0] || []).map(h => String(h).trim()), rows: toObjects(values) };
}

// Insert or update the row whose `key` column equals `value`. Only the given fields change.
async function upsert(tab, cols, key, value, fields) {
  const { head, rows } = await readTab(tab);
  if (!head.length) throw new Error(`The "${tab}" tab is missing its header row (${cols.join(', ')})`);
  const keys = head.map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const existing = rows.find(r => lower(r[key]) === lower(value));
  const merged = { ...(existing || {}), [key]: value, ...fields };
  const line = keys.map(k => merged[k] ?? '');
  if (existing) await writeRange(SHEET(), `'${tab}'!A${existing._row}:${colLetter(keys.length - 1)}${existing._row}`, [line]);
  else await appendRows(SHEET(), `'${tab}'!A1`, [line]);
  return merged;
}

// ---------- profiles ----------
export async function loadProfiles({ fresh = true } = {}) {
  try { return (await readTab('Teacher Profiles', { fresh })).rows.filter(r => r.email); } catch { return []; }
}
export async function profileFor(email) {
  return (await loadProfiles()).find(p => lower(p.email) === lower(email)) || null;
}
export const saveProfile = (email, fields) => upsert('Teacher Profiles', PROFILE_COLS, 'email', lower(email), { ...fields, updated_on: todayET() });

// Teachers already on the public Teachers page (EP Website sheet) count as "on file" too, matched by name
export async function siteTeacher(name) {
  if (!name) return null;
  return (await getAllTeachers()).find(t => photoKey(t.name) === photoKey(name)) || null;
}

// ---------- course pages ----------
export async function loadPages({ fresh = true } = {}) {
  try { return (await readTab('Course Pages', { fresh })).rows.filter(r => r.offering); } catch { return []; }
}
export const savePage = (offering, fields) => upsert('Course Pages', PAGE_COLS, 'offering', offering, fields);

// ---------- offerings: the Master Schedule rows a teacher is assigned to, grouped by series ----------
export const offeringKey = ev => ev.series || ev.id;

export async function offeringsFor(email, { fresh = false } = {}) {
  const e = lower(email), today = todayET();
  const cal = await loadCalendar({ fresh });
  const groups = new Map();
  for (const ev of cal) {
    if (!emailsOf(ev).includes(e) || (ev.end_date || ev.date) < today) continue;
    const k = offeringKey(ev);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(ev);
  }
  return [...groups.entries()].map(([key, evs]) => {
    evs.sort((a, b) => a.date.localeCompare(b.date));
    const f = evs[0], last = evs[evs.length - 1];
    return {
      key, track: f.track, program: f.program, title: f.title, host: f.host, price: f.price, time: f.time,
      teachers: f.teachers, course_host: f.course_host, registration_url: f.registration_url, summary: f.summary,
      start: f.date, end: last.end_date || last.date,
      sessions: evs.map(s => ({ id: s.id, date: s.date, end_date: s.end_date, time: s.time, title: s.title })),
    };
  }).sort((a, b) => a.start.localeCompare(b.start));
}

// Anyone named in Teacher/Host Emails on an upcoming row can sign in as a teacher
export async function isTeacherEmail(email) {
  if (!email) return false;
  return (await offeringsFor(email).catch(() => [])).length > 0 || !!(await profileFor(email).catch(() => null));
}

// ---------- what a teacher owes, from the Task Templates tab ----------
const isTeacherRow = t => /^teacher$/i.test(String(t.assign_to).trim());
export const kindOf = task => /blurb|promotional/i.test(task) ? 'promo' : /reading/i.test(task) ? 'readings'
  : /slide/i.test(task) ? 'slides' : /bio|headshot/i.test(task) ? 'bio' : /title|description/i.test(task) ? 'confirm' : 'other';

// Circle is the teaching space for these tracks (all tracks once everything moves to Circle: CIRCLE_TRACKS=ALL)
export const circleTracks = () => String(process.env.CIRCLE_TRACKS || 'SS,SSWW,EVENT').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export const usesCircle = track => circleTracks().includes('ALL') || circleTracks().includes(String(track).toUpperCase());

export async function deliverables(offering, { hasProfile }) {
  const tpls = (await loadTemplates()).filter(isTeacherRow)
    .filter(t => t.track.toUpperCase() === offering.track || t.track.toUpperCase() === 'ALL');
  return tpls.filter(t => !(kindOf(t.task) === 'bio' && hasProfile)).map(t => {
    const off = Number(t.offset_days) || 0, kind = kindOf(t.task);
    const perSession = offering.sessions.length > 1 && ['readings', 'slides', 'other'].includes(kind);
    return {
      task: t.task, kind, details: t.details || '', offset: off, perSession,
      due: addDays(offering.start, off),
      dues: perSession ? offering.sessions.map(s => addDays(s.date, off)) : [addDays(offering.start, off)],
    };
  }).sort((a, b) => a.due.localeCompare(b.due));
}

// ---------- Motion: close the tasks onboarding has just covered ----------
// Only the teacher's own tasks (labelled with their name) for this offering's sessions, matching `kinds`.
export async function completeTasks({ name, sessionIds, kinds }) {
  if (!name) return { completed: 0 };
  let tasks = [];
  try { tasks = await listTasks({ fresh: true }); } catch (e) { return { completed: 0, error: e.message }; }
  const ids = new Set(sessionIds);
  const mine = tasks.filter(t => !t.completed && t.labels.some(l => photoKey(l) === photoKey(name))
    && (!ids.size || ids.has(eventIdFromTag(t.description))) && kinds.includes(kindOf(t.name.split(' — ')[0])));
  let completed = 0; const errors = [];
  for (const t of mine) { try { await completeTask(t.id); completed++; } catch (e) { errors.push(e.message); } }
  return { completed, errors };
}

// ---------- Team tab: teachers are added once they finish onboarding ----------
export async function addToTeam({ name, email }) {
  const team = await loadTeam({ fresh: true });
  const row = team.find(t => t.email.trim() === lower(email));
  if (row) {
    if (!row.welcomed_on) await writeRange(SHEET(), `'Team'!F${row._row}`, [[todayET()]]);
    return 'already on the Team tab';
  }
  await appendRows(SHEET(), "'Team'!A1", [[name, lower(email), 'teacher', 'Teacher', 'TRUE', todayET(), 'Added by teacher onboarding']]);
  return 'added to the Team tab';
}

// Does this person still have onboarding to do?
export async function onboardingState(email) {
  const [offerings, profile, pages] = await Promise.all([offeringsFor(email), profileFor(email), loadPages()]);
  const byKey = Object.fromEntries(pages.map(p => [p.offering, p]));
  const pending = offerings.filter(o => !['submitted', 'published'].includes(lower(byKey[o.key]?.status)));
  return { offerings, profile, pages: byKey, pending, needed: !profile?.onboarded_on || pending.length > 0 };
}

export { names, addDays };
