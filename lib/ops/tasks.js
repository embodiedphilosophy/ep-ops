import { loadCalendar, loadTeam, loadTemplates } from '../calendar';
import { listTasks, createTask, updateTask, retireTask } from './taskstore';
import { todayET, emailsOf } from '../events';
import { joinUrlFor, seriesLinksOf, upcomingMeetings } from './joinurl';

const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const names = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const tagOf = (eventId, task, who) => `[ep:${eventId}:${slug(task)}:${slug(who)}]`;
export const eventIdFromTag = desc => (String(desc).match(/\[ep:([^:\]]+):/) || [])[1] || '';

// Who a template row goes to for a given event → list of Motion labels (a person's name or a role)
function assignees(tpl, ev) {
  const to = tpl.assign_to.trim();
  if (/^teacher$/i.test(to)) return names(ev.teachers).length ? names(ev.teachers) : ['Teacher (unassigned)'];
  if (/^course host$/i.test(to)) return names(ev.course_host).length ? names(ev.course_host) : ['Course Host'];
  return [to];
}

// A teacher template for an event (or a program's session) with nobody named yet makes ONE task,
// "Name the teacher", instead of one "Teacher (unassigned)" copy per template. Once a teacher is named
// on the Master Schedule, the real teacher tasks are made and this one is closed by the sync.
export const NAME_TEACHER = 'Name the teacher';
const NAME_TEACHER_SLUG = slug(NAME_TEACHER);

// Every task the calendar implies for events whose task due dates fall inside the window
export async function expectedTasks({ ahead = 30, behind = 3 } = {}) {
  const { loadSignals, ruleOf, doneBecause, promoDone } = await import('./autocomplete');
  const [cal, tpls, covered, signals] = await Promise.all([loadCalendar({ fresh: true }), loadTemplates({ fresh: true }), coveredByOnboarding(), loadSignals()]);
  const from = addDays(todayET(), -behind), to = addDays(todayET(), ahead);
  const out = [];
  const askedForSeries = new Set(); // one "Name the teacher" per program (series), on its earliest session
  for (const ev of [...cal].sort((a, b) => a.date.localeCompare(b.date))) {
    let nameTeacherDue = '';
    for (const t of tpls.filter(t => t.track.toUpperCase() === ev.track || t.track.toUpperCase() === 'ALL')) {
      if (t.track.toUpperCase() === 'ALL' && !/teacher/i.test(t.assign_to)) continue;
      if (t.track.toUpperCase() === 'ALL' && !names(ev.teachers).length) continue; // bio/headshot only once a teacher is named
      if (covered.skip(ev, t)) continue; // already handed in through teacher onboarding, or already on file
      const due = addDays(ev.date, Number(t.offset_days) || 0);
      if (due < from || due > to) continue;
      if (ruleOf(t) === 'kit_email' && promoDone(ev, slug(t.task), signals)) continue; // not needed, or already in Kit
      // No teacher yet: collect the earliest due date for the single "Name the teacher" task
      if (/^teacher$/i.test(t.assign_to.trim()) && !names(ev.teachers).length) {
        if (!nameTeacherDue || due < nameTeacherDue) nameTeacherDue = due;
        continue;
      }
      for (const who of assignees(t, ev)) {
        if (doneBecause(ruleOf(t), ev, slug(who), signals, due)) continue; // the sheet (or Kit) already shows it done
        out.push({
          due, label: who, event: ev,
          name: `${t.task} — ${ev.title} (${ev.date})`,
          tag: tagOf(ev.id, t.task, who),
          description: `${t.details ? t.details + '\n\n' : ''}Event: ${ev.title}, ${ev.date}${ev.time ? ' ' + ev.time : ''}\n${tagOf(ev.id, t.task, who)}`,
        });
      }
    }
    if (nameTeacherDue && !(ev.series && askedForSeries.has(ev.series))) {
      if (ev.series) askedForSeries.add(ev.series);
      // Due a week before the first teacher task, so there is time to ask someone
      const due = addDays(nameTeacherDue, -7) < from ? nameTeacherDue : addDays(nameTeacherDue, -7);
      const who = 'Teacher (unassigned)';
      out.push({
        due, label: who, event: ev,
        name: `${NAME_TEACHER} — ${ev.title} (${ev.date})`,
        tag: tagOf(ev.id, NAME_TEACHER, who),
        description: `Nobody is named to teach this session yet. Add the teacher (and their reminder email) in Programming → Edit details, or on the Master Schedule. Their tasks are made the next morning.\n\nEvent: ${ev.title}, ${ev.date}${ev.time ? ' ' + ev.time : ''}\n${tagOf(ev.id, NAME_TEACHER, who)}`,
      });
    }
  }
  return out;
}

// Teacher tasks that are already covered, so the daily job doesn't create them:
// bio/headshot for teachers with a profile (Teachers tab), a bio on the website's Teachers page, or who are
// EP staff on the Team tab; title/description, promo blurbs and (if they sent them all) readings for
// offerings whose course page was submitted.
async function coveredByOnboarding() {
  const { loadPages, loadProfiles, offeringKey, kindOf } = await import('../teach');
  const { getAllTeachers } = await import('../content');
  const [pages, profiles, site, team] = await Promise.all([loadPages().catch(() => []), loadProfiles().catch(() => []),
    getAllTeachers().catch(() => []), loadTeam().catch(() => [])]);
  const onFile = new Set([
    ...profiles.filter(p => p.name && p.bio).map(p => personKey(p.name)),
    ...site.filter(p => p.name && String(p.bio || '').trim()).map(p => personKey(p.name)),
    ...team.filter(m => m.name && String(m.type).toLowerCase() !== 'teacher').map(m => personKey(m.name)),
  ]);
  const sent = Object.fromEntries(pages.filter(p => ['submitted', 'published'].includes(String(p.status).toLowerCase())).map(p => [p.offering, p]));
  return {
    skip(ev, t) {
      if (!/^teacher$/i.test(String(t.assign_to).trim())) return false;
      const kind = kindOf(t.task), page = sent[offeringKey(ev)];
      if (kind === 'bio') return names(ev.teachers).length > 0 && names(ev.teachers).every(n => onFile.has(personKey(n)));
      if (!page) return false;
      if (kind === 'confirm' || kind === 'promo') return true;
      if (kind === 'readings') return ['all', 'none'].includes(String(page.readings_mode).toLowerCase());
      return false;
    },
  };
}
// "Dr. Mary Reilly-Nichols" and "Mary Reilly Nichols" are the same person
export const personKey = n => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z]+/g, ' ').trim();

// Labels that stand in for "nobody yet". A task carrying only these goes to the director's triage list.
export const PLACEHOLDERS = ['Teacher (unassigned)', 'Course Host', 'Teacher'];
const isPlaceholder = l => PLACEHOLDERS.some(p => p.toLowerCase() === String(l).trim().toLowerCase());
const PLACEHOLDER_SLUGS = new Set(PLACEHOLDERS.map(slug));
// [ep:E047:send-slides-as-a-pdf:floss-harry] → { key: 'E047:send-slides-as-a-pdf', who: 'floss-harry' }
export function parseTag(desc) {
  const m = String(desc || '').match(/\[ep:([^:\]]+):([^:\]]+):([^\]]+)\]/);
  return m ? { key: `${m[1]}:${m[2]}`, who: m[3], tag: m[0] } : null;
}

// Write one expected task into Motion: create it, or (with id) move an existing task to it.
// If the label doesn't exist in Motion, the label goes in the task name instead: "[Marketing] …"
async function writeTask(t, missingLabels, id) {
  const send = useLabel => {
    const body = { name: useLabel ? t.name : `[${t.label}] ${t.name}`, labels: useLabel ? [t.label] : [], description: t.description, due: t.due };
    return id ? updateTask(id, body) : createTask(body);
  };
  if (missingLabels.has(t.label)) return send(false);
  try { return await send(true); }
  catch (e) {
    if (!/unknown workspace label|label/i.test(e.message) || e.rateLimited) throw e;
    missingLabels.add(t.label);
    return send(false);
  }
}

// Bring Motion in line with the calendar (stops politely at Motion's rate limit). One task per
// template per event per person: when the calendar's teacher or host changes, the open task moves to
// the new person instead of a second copy being made, and placeholder copies are retired.
export async function syncTasks() {
  const existing = await listTasks({ fresh: true });
  const have = new Set(existing.map(t => parseTag(t.description)?.tag).filter(Boolean));
  const openByKey = {};
  for (const t of existing) {
    const p = parseTag(t.description);
    if (p && !t.completed) (openByKey[p.key] ||= []).push({ ...t, who: p.who });
  }
  const report = { created: 0, moved: 0, retired: 0, alreadyThere: 0, stoppedAtLimit: false, errors: [] };
  const missingLabels = new Set();
  const groups = {};
  for (const t of await expectedTasks()) { const k = parseTag(t.tag).key; (groups[k] ||= []).push(t); }
  try {
    for (const [key, want] of Object.entries(groups)) {
      const open = openByKey[key] || [];
      const wantWho = new Set(want.map(t => parseTag(t.tag).who));
      const realWanted = [...wantWho].some(w => !PLACEHOLDER_SLUGS.has(w));
      // Open tasks no longer matching anyone the calendar names
      let stale = open.filter(t => !wantWho.has(t.who));
      // The calendar only has a placeholder, but someone was given the task by hand: leave it with them
      if (!realWanted && open.some(t => !PLACEHOLDER_SLUGS.has(t.who))) { report.alreadyThere += want.length; continue; }
      for (const t of want) {
        if (have.has(t.tag)) { report.alreadyThere++; continue; }
        try {
          const reuse = stale.shift();
          await writeTask(t, missingLabels, reuse?.id);
          reuse ? report.moved++ : report.created++;
          have.add(t.tag);
        } catch (e) { if (e.rateLimited) throw e; report.errors.push(e.message); }
      }
      // Anything left over is a duplicate placeholder (or a teacher who has been taken off): close it
      for (const t of stale) {
        if (!PLACEHOLDER_SLUGS.has(t.who) && !realWanted) continue;
        try { await retireTask(t.id, t.name); report.retired++; } catch (e) { if (e.rateLimited) throw e; report.errors.push(e.message); }
      }
    }
    // Tasks the templates no longer make (a template was removed or renamed in Settings → Task templates,
    // a teacher has been named so "Name the teacher" is done, or an old per-template "Teacher (unassigned)"
    // copy that "Name the teacher" now stands in for). Only tasks the sync itself made are closed:
    // hand-added and Motion-imported tasks are never touched.
    const cal = await loadCalendar();
    const tpls = await loadTemplates();
    for (const t of orphans(existing, cal, tpls)) {
      try { await retireTask(t.id, t.name); report.retired++; (report.noLongerNeeded ||= []).push(t.name); }
      catch (e) { if (e.rateLimited) throw e; report.errors.push(e.message); }
    }
  } catch (e) { if (e.rateLimited) report.stoppedAtLimit = true; else throw e; }
  if (missingLabels.size) report.labelsToCreateInMotion = [...missingLabels];
  return report;
}

// Open, sync-made tasks that nothing on the calendar asks for any more → the tasks to close.
// Pure (no reads) so it can be checked against sample data.
export function orphans(tasks, cal, tpls) {
  const byId = Object.fromEntries(cal.map(e => [e.id, e]));
  const out = [];
  for (const t of tasks) {
    if (t.completed || t.createdBy !== '') continue; // only what the daily sync made (database tasks)
    const p = parseTag(t.description);
    if (!p) continue;
    const [eventId, taskSlug] = p.key.split(':');
    const ev = byId[eventId];
    if (!ev) continue; // moved or cancelled events are handled where that happens
    const hasTeacher = names(ev.teachers).length > 0;
    if (taskSlug === NAME_TEACHER_SLUG) { if (hasTeacher) out.push(t); continue; }
    const tpl = tpls.find(x => slug(x.task) === taskSlug && [ev.track, 'ALL'].includes(String(x.track).toUpperCase()));
    if (!tpl) { out.push(t); continue; } // its template is gone
    // A teacher task still waiting for a teacher: "Name the teacher" covers it now
    if (/^teacher$/i.test(String(tpl.assign_to).trim()) && !hasTeacher && PLACEHOLDER_SLUGS.has(p.who)) out.push(t);
  }
  return out;
}

// For display, before the next sync has tidied Motion: hide an open placeholder copy when the same
// task already has a named owner, and anything marked superseded.
export function dedupe(tasks) {
  const named = new Set();
  for (const t of tasks) {
    const p = parseTag(t.description);
    if (p && !t.completed && !PLACEHOLDER_SLUGS.has(p.who)) named.add(p.key);
  }
  return tasks.filter(t => {
    if (/\(superseded\)$/.test(t.name)) return false;
    const p = parseTag(t.description);
    return !(p && !t.completed && PLACEHOLDER_SLUGS.has(p.who) && named.has(p.key));
  });
}

// Does anyone on the team own this task? (a person's name, or a role someone holds)
export function ownersOf(task, team) {
  return team.filter(m => task.labels.some(l => {
    const L = String(l).toLowerCase();
    return L === m.name.toLowerCase() || m.roles.some(r => r.toLowerCase() === L);
  }));
}
// No owner: only placeholder labels, or no labels at all. Named teachers who aren't on the Team tab
// still count as owners (they see their tasks in /teach).
export const needsOwner = t => !t.completed && (!t.labels.length || t.labels.every(isPlaceholder));

// Tasks visible to a person: labelled with their name or one of their roles, or blocked waiting on them.
// Directors see everything.
export function visibleTo(user, tasks) {
  if (user.director) return tasks;
  const mine = new Set([user.name, ...user.roles].map(s => s.toLowerCase()));
  return tasks.filter(t => t.labels.some(l => mine.has(String(l).toLowerCase())) || (t.blockedOn && t.blockedOn.toLowerCase() === String(user.name).toLowerCase()));
}

// Home: the person's own tasks plus anything blocked waiting on them. A director also gets every owned
// task that is 7 or more days overdue (escalated), marked so it reads as someone else's.
export const ESCALATE_DAYS = 7, NUDGE_DAYS = 3;
export function forHome(user, tasks) {
  const mine = visibleTo({ ...user, director: false }, tasks);
  if (!user.director) return mine;
  const have = new Set(mine.map(t => t.id)), cutoff = addDays(todayET(), -ESCALATE_DAYS);
  const late = tasks.filter(t => !have.has(t.id) && !t.completed && t.due && t.due <= cutoff && !needsOwner(t))
    .map(t => ({ ...t, escalated: `${t.labels.join(', ')}, ${Math.round((Date.parse(todayET()) - Date.parse(t.due)) / 864e5)} days late` }));
  return [...mine, ...late];
}

// Today's "Needs you" list: the person's own open tasks that are late or due this week, plus anything
// blocked waiting on them. The sidebar badge counts exactly this list, so the two numbers always match.
// (A director's view of other people's 7+ day late tasks lives in Tasks → Late, not here.)
export function needsYouFor(user, all) {
  const mine = forHome(user, all).filter(t => !needsOwner(t) && !t.escalated);
  const b = bucket(mine);
  const blocked = mine.filter(t => !t.completed && t.blockedOn && t.blockedOn === user.name && t.due > addDays(todayET(), 7));
  return { mine, b, blocked, list: [...b.pastDue, ...b.thisWeek, ...blocked] };
}

// Tasks under event headings ("Navarātri — 3 tasks"), events in date order, then anything without an event
export function groupByEvent(tasks, cal = []) {
  const byId = Object.fromEntries(cal.map(e => [e.id, e]));
  const groups = new Map();
  for (const t of tasks) {
    const id = eventIdFromTag(t.description);
    const ev = byId[id];
    const fromName = (t.name.match(/ — (.+) \((\d{4}-\d{2}-\d{2})\)$/) || []);
    const key = id || fromName[1] || '';
    if (!groups.has(key)) groups.set(key, { key, title: ev?.title || fromName[1] || 'Other tasks', date: ev?.date || fromName[2] || '', tasks: [] });
    groups.get(key).tasks.push(t);
  }
  return [...groups.values()].sort((a, b) => (!a.key) - (!b.key) || (a.date || '9').localeCompare(b.date || '9'));
}

export function bucket(tasks) {
  const today = todayET(), week = addDays(today, 7);
  const open = tasks.filter(t => !t.completed);
  return {
    pastDue: open.filter(t => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due)),
    thisWeek: open.filter(t => !t.due || (t.due >= today && t.due <= week)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')),
    upcoming: open.filter(t => t.due > week).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 40),
    done: tasks.filter(t => t.completed).sort((a, b) => (b.due || '').localeCompare(a.due || '')).slice(0, 15),
  };
}

// Calendar sessions a person is assigned to (their email in Teacher/Host Emails, or named in Teachers /
// Course Host) in the next `days`; directors see everything. Each comes with its Zoom link.
// all: list every event in the window (staff see all programming); otherwise only the person's own
export async function meetingsFor(user, days = 21, { all = false } = {}) {
  const cal = await loadCalendar();
  const today = todayET(), until = addDays(today, days);
  const email = String(user.email || '').trim().toLowerCase();
  const mine = cal.filter(ev => (ev.end_date || ev.date) >= today && ev.date <= until)
    .filter(ev => all || user.director || (email && emailsOf(ev).includes(email)) || names(ev.teachers).includes(user.name) || names(ev.course_host).includes(user.name))
    .sort((a, b) => a.date.localeCompare(b.date));
  const links = seriesLinksOf(cal);
  const upcoming = await upcomingMeetings();
  return Promise.all(mine.map(async ev => ({ ...ev, join_url: await joinUrlFor(ev, links, upcoming) })));
}

export { loadTeam, addDays };
