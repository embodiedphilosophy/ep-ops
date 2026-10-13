import { loadCalendar, loadTemplates } from '../calendar';
import { listTasks, completeTask, updateTask, addComment } from './taskstore';
import { parseTag, names, PLACEHOLDERS } from './tasks';
import { todayET } from '../events';

// Auto-complete, sheet signals only (Ops Dashboard v2, step 3). A task ticks itself off when the
// calendar sheet already proves it happened. Each Task Templates row gets its rule from the optional
// done_when column, or else from the task's wording:
//   bio       every teacher on the task has a bio and a headshot on the Teachers tab
//   title     the event has a Public Title and a Summary, or its course page was submitted
//   blurbs    the course page has promo_1, promo_2 and promo_3
//   readings  the course page says all readings were sent up front (readings_mode all + readings), or none
//   video_id  the event has its replay: a Circle replay link (or, from before the move, a Vimeo Video ID)
//   kit_email a Kit broadcast carrying the event's ID ("[E047] Promo #2") is scheduled or sent within
//             2 days of the task's due date (promo, members, registration and launch emails)
//   manual    never ticked automatically
// A closed task gets [auto:DATE:rule] in its description; Undo swaps that for [auto-undone], and the
// job leaves such a task alone from then on.
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const lower = s => String(s || '').trim().toLowerCase();
const filled = v => String(v || '').trim() !== '';
const SENT = ['submitted', 'published'];
export const RULES = ['bio', 'title', 'blurbs', 'readings', 'video_id', 'kit_email', 'manual'];
const KIT_WINDOW_DAYS = 2;
export const UNDO_DAYS = 7;

export function ruleOf(tpl) {
  const set = lower(tpl.done_when);
  if (RULES.includes(set)) return set;
  const t = String(tpl.task);
  if (/guest/i.test(t)) return 'manual'; // CHITHEADS guests don't use onboarding
  if (/bio|headshot/i.test(t)) return 'bio';
  if (/blurb/i.test(t)) return 'blurbs';
  if (/title/i.test(t) && /description/i.test(t)) return 'title';
  if (/^send readings/i.test(t)) return 'readings';
  if (/\b(promo|members|registration) email\b|\blaunch email|mid-launch email|last-chance email/i.test(t)) return 'kit_email';
  if (/video id|(upload|post|add)\b.{0,20}replay|replay.{0,20}(circle|vimeo|link)/i.test(t)) return 'video_id';
  return 'manual';
}

// Everything the rules read, loaded once per run
export async function loadSignals() {
  const { loadPages, loadProfiles, offeringKey } = await import('../teach');
  const { kitSignals } = await import('../kit');
  const [cal, tpls, pages, profiles, kit] = await Promise.all([
    loadCalendar({ fresh: true }), loadTemplates({ fresh: true }), loadPages().catch(() => []), loadProfiles().catch(() => []),
    kitSignals({ fresh: true }).catch(() => null), // Kit unreachable: kit_email tasks just wait
  ]);
  const pageOf = Object.fromEntries(pages.map(p => [p.offering, p]));
  const profileOf = {};
  for (const p of profiles) if (p.name) profileOf[slug(p.name)] = p;
  return {
    events: Object.fromEntries(cal.map(e => [e.id, e])),
    rules: Object.fromEntries(tpls.map(t => [slug(t.task), ruleOf(t)])),
    page: ev => pageOf[offeringKey(ev)],
    profile: name => profileOf[slug(name)],
    kit,
  };
}

// Is this template's work already done for this event? → a short reason, or '' when not (yet)
// who: the task's owner slug (a teacher's name), used by the bio rule; due: the task's due date (kit_email)
export function doneBecause(rule, ev, who, s, due) {
  const page = s.page(ev);
  const sent = page && SENT.includes(lower(page.status));
  if (rule === 'bio') {
    const placeholder = !who || PLACEHOLDERS.some(p => slug(p) === who);
    const people = placeholder ? names(ev.teachers) : [who];
    if (!people.length) return '';
    const ok = people.every(n => { const p = s.profile(n); return p && filled(p.bio) && filled(p.photo_url); });
    return ok ? 'bio and headshot are on the Teachers tab' : '';
  }
  if (rule === 'title') {
    if (filled(ev.public_title) && filled(ev.summary)) return 'Public Title and Summary are filled in';
    return sent ? 'the course page was submitted' : '';
  }
  if (rule === 'blurbs') return page && ['promo_1', 'promo_2', 'promo_3'].every(k => filled(page[k])) ? 'all three promo blurbs are on the course page' : '';
  if (rule === 'readings') {
    const mode = lower(page?.readings_mode);
    if (mode === 'none') return 'the course page says there are no readings';
    return mode === 'all' && filled(page?.readings) ? 'all readings were shared up front on the course page' : '';
  }
  if (rule === 'video_id') return filled(ev.replay_link) ? 'the replay link is filled in' : filled(ev.video_id) ? 'the Video ID is filled in' : '';
  if (rule === 'kit_email') {
    if (!s.kit || !ev.sched_id || !due) return '';
    const day = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
    const near = b => b.at && Math.abs(Date.parse(day(b.at)) - Date.parse(due)) <= KIT_WINDOW_DAYS * 864e5;
    const b = s.kit.broadcasts.find(b => b.ids.includes(ev.sched_id) && near(b));
    return b ? `Kit has “${b.subject}” ${b.sent ? 'sent' : 'scheduled'} for ${day(b.at)}` : '';
  }
  return '';
}

// The reason an open Motion task is done, or '' (wrong kind of task, manual rule, or no signal yet)
export function reasonFor(task, s) {
  if (task.completed || /\[auto-undone\]/.test(task.description)) return '';
  const p = parseTag(task.description);
  if (!p) return '';
  const [eventId, tplSlug] = p.key.split(':');
  const ev = s.events[eventId], rule = s.rules[tplSlug];
  if (!ev || !rule || rule === 'manual') return '';
  const why = doneBecause(rule, ev, p.who, s, task.due);
  return why ? `${rule}: ${why}` : '';
}

// Close every open task whose signal is in. dry: report only, change nothing.
export async function runAutoComplete({ dry = false } = {}) {
  const [tasks, s] = await Promise.all([listTasks({ fresh: true }), loadSignals()]);
  const out = { mode: dry ? 'dry run: nothing was changed' : 'live', closed: [], errors: [], stoppedAtLimit: false };
  const today = todayET();
  for (const t of tasks) {
    const why = reasonFor(t, s);
    if (!why) continue;
    const rule = why.split(':')[0];
    out.closed.push({ id: t.id, task: t.name, why });
    if (dry) continue;
    try {
      await updateTask(t.id, { description: `${t.description}\n\n[auto:${today}:${rule}]` });
      await completeTask(t.id);
      await addComment(t.id, `Done automatically: ${why.slice(rule.length + 2)}.`).catch(() => {});
    } catch (e) {
      if (e.rateLimited) { out.stoppedAtLimit = true; break; }
      out.errors.push(`${t.name}: ${e.message}`);
    }
  }
  return out;
}
