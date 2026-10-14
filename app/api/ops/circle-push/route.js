import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { circleConfigured, circleGet } from '@/lib/circle';
import { planCircle, pushCircle, liveAllowed } from '@/lib/ops/circlesync';
import { setupCourse, publishCourse, courseRowFor, isStandalone, COURSE_COL } from '@/lib/ops/circlecourse';
import { loadCalendar } from '@/lib/calendar';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const ID = /^E\d{3,}$/;

// The Circle panel on an event's drawer (Events page). ids = the drawer's sessions (E047,E048…).
//   GET  ?ids=…                       what's in Circle for them, and what "Push to Circle" would do (reads only)
//   POST { action: 'push', ids }      make/update their Circle events, then publish them (and a course's lessons)
//   POST { action: 'setup', ids }     standalone course: make its hidden course space, events space and draft lessons
async function gate(ids) {
  const user = await currentUser();
  if (!user) return [null, NextResponse.json({ error: 'Please sign in again' }, { status: 401 })];
  if (!canEditEvents(user)) return [null, NextResponse.json({ error: 'Only Jacob, Irene and Floss can change Circle from here' }, { status: 403 })];
  if (!circleConfigured()) return [null, NextResponse.json({ error: 'Circle isn’t connected (CIRCLE_API_TOKEN is missing in Vercel)' }, { status: 503 })];
  if (!ids.length || !ids.every(i => ID.test(i))) return [null, NextResponse.json({ error: 'Unknown event' }, { status: 400 })];
  return [user];
}
const idsOf = v => [...new Set(String(v || '').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 60);

export async function GET(req) {
  const ids = idsOf(new URL(req.url).searchParams.get('ids'));
  const [user, denied] = await gate(ids); if (!user) return denied;
  try {
    const [plan, cal] = await Promise.all([planCircle({ only: ids }), loadCalendar()]);
    const evs = cal.filter(e => ids.includes(e.sched_id));
    const row = isStandalone(evs) ? await courseRowFor(evs, { light: true }).catch(() => null) : null;
    const courseId = row?.values[COURSE_COL] || '';
    // Hidden until the first push; unknown (null) if Circle doesn't say
    const space = courseId ? await circleGet(`/spaces/${courseId}`).then(r => r.space || r).catch(() => null) : null;
    return NextResponse.json({
      live: liveAllowed(),
      sessions: plan.rows.flatMap(r => r.steps.map(s => ({ id: r.id, day: s.day, space: r.space, action: s.action, status: s.status || '', url: s.url || '', name: s.name || s.fields?.name || '', changes: Object.keys(s.changes || {}) }))),
      flags: plan.flags.map(f => f.why),
      course: isStandalone(evs) ? { has: !!courseId, id: courseId, hidden: space ? space.is_hidden !== false : null } : null,
    });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ids = idsOf(Array.isArray(b.ids) ? b.ids.join(',') : b.ids);
  const [user, denied] = await gate(ids); if (!user) return denied;
  const who = user.name || user.email;
  if (!liveAllowed()) return NextResponse.json({ error: 'Circle is switched off for the dashboard. Set CIRCLE_EVENT_SYNC=live in Vercel to allow it.' }, { status: 403 });
  try {
    if (b.action === 'setup') {
      const r = await setupCourse(ids, who);
      refreshSite();
      return NextResponse.json({ ok: true, done: r.done, errors: [] });
    }
    if (b.action === 'push') {
      const r = await pushCircle(ids);
      if (!r.errors.length) { const c = await publishCourse(ids, who); r.done.push(...c.done); r.errors.push(...c.errors); }
      if (r.done.length) refreshSite();
      return NextResponse.json({ ok: !r.errors.length, done: r.done, errors: r.errors, flags: r.flags.map(f => f.why) });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Circle push failed', b.action, e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
