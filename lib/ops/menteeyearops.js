// What the Ops dashboard shows about the mentee year (Today card, Mentee year → Now, Final projects, One-to-ones): cohort counts from the Mentee Step Status
// tab, the review progress, who is waiting on what, and the booked one-to-ones with their summaries. Read only. The numbers come from lib/mentee/year.js.
import { mentees as kitMentees } from '../member/cohort';
import { readTab, TABS } from '../mentee/content';
import { statusRows } from '../mentee/yearstore';
import { scheduleFrom, monthFrom, cohortSteps, reviewProgress, reviewCard, statusFor, oneToOneId, summaryStatus, daysBetween } from '../mentee/year';
import { oneToOnes } from './onetoones';

const lower = s => String(s || '').trim().toLowerCase();
const DAY = 864e5;

export async function loadOpsYear({ today, now = Date.now(), withBookings = true } = {}) {
  const ok = async (p, d) => { try { return await p; } catch (e) { console.error('ops year', e.message); return d; } };
  const [list, schedRows, monthRows, status, o2o] = await Promise.all([
    ok(kitMentees(), []), ok(readTab(TABS.schedule), []), ok(readTab(TABS.months), []), ok(statusRows({ light: true }), []),
    withBookings ? ok(oneToOnes({ days: 120, now: now - 30 * DAY }), { configured: false, items: [] }) : { configured: false, items: [] },
  ]);
  const sch = scheduleFrom(schedRows), cohort = cohortSteps(sch.steps, list, status);
  const upcoming = cohort.filter(c => c.step.date >= today).slice(0, 3);
  const overdue = []; // [{ name, step }]
  for (const c of cohort) if (c.step.date < today) for (const m of list) if (!c.doneBy.some(d => d.email === lower(m.email))) overdue.push({ name: m.name, email: lower(m.email), title: c.step.title });
  const ym = today.slice(0, 7), rv = sch.reviews.find(r => r.month >= ym) || null;
  const review = rv && { ...rv, opensOn: `${rv.month}-01`, opens: today < `${rv.month}-01`, progress: reviewProgress(rv, list, status, today) };
  // one-to-ones: the mentee's own summary on the page (newest) wins over what Calendly sent
  const bookings = o2o.items.map(x => {
    const page = (statusFor(status, x.email).notes[oneToOneId(new Date(x.start).toISOString().slice(0, 7))] || {}).text;
    const summary = page ? [{ q: 'What they sent', a: page }] : x.summary;
    return { ...x, summary, source: page ? 'page' : x.source, status: summaryStatus(x.start, summary.length > 0, now), past: Date.parse(x.start) < now };
  });
  const booked = new Set(bookings.filter(b => !b.past).map(b => lower(b.email)));
  const notBooked = list.filter(m => !booked.has(lower(m.email))).map(m => ({ name: m.name, email: lower(m.email) }));
  const noSummary = bookings.filter(b => !b.past && !b.summary.length);
  // For the editors: the tasks on the mentees' "This month" (with how many ticked) and what has been taken off the page
  const tasks = cohortSteps(sch.tasks, list, status);
  const hidden = schedRows.filter(r => r.step_id && /^(false|no|hide)$/i.test(r.publish || '') && ['step', 'task'].includes(r.kind || 'step'))
    .map(r => ({ id: r.step_id, kind: r.kind || 'step', date: r.date, title: r.title }));
  const months = Object.fromEntries(monthRows.filter(r => r.month).map(r => [r.month, { theme: r.theme || '', focus: r.focus || '' }]));
  return { today, mentees: list, month: monthFrom(monthRows, ym), months, steps: sch.steps, tasks, hidden, upcoming, cohort, overdue, review, bookings, configured: o2o.configured, notBooked, noSummary, fromSheet: sch.fromSheet, reviewOpenNow: !!reviewCard(sch.reviews, new Set(), today) };
}
export { daysBetween };
