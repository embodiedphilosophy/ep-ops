import { loadCalendar, loadTeam, loadTemplates } from '../calendar';
import { listTasks, createTask } from './motion';
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

// Every task the calendar implies for events whose task due dates fall inside the window
export async function expectedTasks({ ahead = 30, behind = 3 } = {}) {
  const [cal, tpls, covered] = await Promise.all([loadCalendar({ fresh: true }), loadTemplates({ fresh: true }), coveredByOnboarding()]);
  const from = addDays(todayET(), -behind), to = addDays(todayET(), ahead);
  const out = [];
  for (const ev of cal) {
    for (const t of tpls.filter(t => t.track.toUpperCase() === ev.track || t.track.toUpperCase() === 'ALL')) {
      if (t.track.toUpperCase() === 'ALL' && !/teacher/i.test(t.assign_to)) continue;
      if (t.track.toUpperCase() === 'ALL' && !names(ev.teachers).length) continue; // bio/headshot only once a teacher is named
      if (covered.skip(ev, t)) continue; // already handed in through teacher onboarding
      const due = addDays(ev.date, Number(t.offset_days) || 0);
      if (due < from || due > to) continue;
      for (const who of assignees(t, ev)) {
        out.push({
          due, label: who, event: ev,
          name: `${t.task} — ${ev.title} (${ev.date})`,
          tag: tagOf(ev.id, t.task, who),
          description: `${t.details ? t.details + '\n\n' : ''}Event: ${ev.title}, ${ev.date}${ev.time ? ' ' + ev.time : ''}\n${tagOf(ev.id, t.task, who)}`,
        });
      }
    }
  }
  return out;
}

// Teacher tasks that onboarding has already covered, so the daily job doesn't create them:
// bio/headshot for teachers with a profile; title/description, promo blurbs and (if they sent them all)
// readings for offerings whose course page was submitted.
async function coveredByOnboarding() {
  const { loadPages, loadProfiles, offeringKey, kindOf } = await import('../teach');
  const [pages, profiles] = await Promise.all([loadPages().catch(() => []), loadProfiles().catch(() => [])]);
  const withProfile = new Set(profiles.filter(p => p.name && p.bio).map(p => p.name.trim().toLowerCase()));
  const sent = Object.fromEntries(pages.filter(p => ['submitted', 'published'].includes(String(p.status).toLowerCase())).map(p => [p.offering, p]));
  return {
    skip(ev, t) {
      if (!/^teacher$/i.test(String(t.assign_to).trim())) return false;
      const kind = kindOf(t.task), page = sent[offeringKey(ev)];
      if (kind === 'bio') return names(ev.teachers).length > 0 && names(ev.teachers).every(n => withProfile.has(n.toLowerCase()));
      if (!page) return false;
      if (kind === 'confirm' || kind === 'promo') return true;
      if (kind === 'readings') return ['all', 'none'].includes(String(page.readings_mode).toLowerCase());
      return false;
    },
  };
}

// Create any missing calendar tasks in Motion (stops politely at Motion's rate limit)
export async function syncToMotion() {
  const existing = await listTasks({ fresh: true });
  const have = new Set(existing.map(t => (t.description.match(/\[ep:[^\]]+\]/) || [])[0]).filter(Boolean));
  const report = { created: 0, alreadyThere: 0, stoppedAtLimit: false, errors: [] };
  const missingLabels = new Set();
  for (const t of await expectedTasks()) {
    if (have.has(t.tag)) { report.alreadyThere++; continue; }
    // If the label doesn't exist in Motion yet, put it in the task name instead: "[Marketing] …"
    const useLabel = !missingLabels.has(t.label);
    try {
      try { await createTask({ name: useLabel ? t.name : `[${t.label}] ${t.name}`, due: t.due, labels: useLabel ? [t.label] : [], description: t.description }); }
      catch (e) {
        if (!useLabel || !/unknown workspace label/i.test(e.message)) throw e;
        missingLabels.add(t.label);
        await createTask({ name: `[${t.label}] ${t.name}`, due: t.due, labels: [], description: t.description });
      }
      report.created++; have.add(t.tag);
    } catch (e) { if (e.rateLimited) { report.stoppedAtLimit = true; break; } report.errors.push(e.message); }
  }
  if (missingLabels.size) report.labelsToCreateInMotion = [...missingLabels];
  return report;
}

// Tasks visible to a person: labelled with their name or one of their roles. Directors see everything.
export function visibleTo(user, tasks) {
  if (user.director) return tasks;
  const mine = new Set([user.name, ...user.roles].map(s => s.toLowerCase()));
  return tasks.filter(t => t.labels.some(l => mine.has(String(l).toLowerCase())));
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
export async function meetingsFor(user, days = 21) {
  const cal = await loadCalendar();
  const today = todayET(), until = addDays(today, days);
  const email = String(user.email || '').trim().toLowerCase();
  const mine = cal.filter(ev => (ev.end_date || ev.date) >= today && ev.date <= until)
    .filter(ev => user.director || (email && emailsOf(ev).includes(email)) || names(ev.teachers).includes(user.name) || names(ev.course_host).includes(user.name))
    .sort((a, b) => a.date.localeCompare(b.date));
  const links = seriesLinksOf(cal);
  const upcoming = await upcomingMeetings();
  return Promise.all(mine.map(async ev => ({ ...ev, join_url: await joinUrlFor(ev, links, upcoming) })));
}

export { loadTeam, addDays };
