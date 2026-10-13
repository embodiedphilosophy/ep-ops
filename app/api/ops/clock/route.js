import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { loadTeam } from '@/lib/ops/tasks';
import { isStaff } from '@/lib/ops/nav';
import { statusFor, clockIn, clockOut, requestHours, decideRequest, fixShift, clockAvailable } from '@/lib/ops/hours';

export const dynamic = 'force-dynamic';

// GET → this person's clock: open shift, hours this month, cap, pace
// POST { action: in | out (tags, note) | request (hours, why) | fix (id, start, end) | approve | decline (id) }
export async function GET() {
  const user = await currentUser();
  if (!user || !isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  if (!clockAvailable()) return NextResponse.json({ off: true });
  try { return NextResponse.json(await statusFor(user)); }
  catch (e) { return NextResponse.json({ error: 'Couldn’t load your hours' }, { status: 502 }); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!user || !isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  if (!clockAvailable()) return NextResponse.json({ error: 'The time clock isn’t set up yet' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const ctx = { team: await loadTeam().catch(() => []), base: process.env.OPS_URL || new URL(req.url).origin };
  try {
    if (b.action === 'in') return NextResponse.json(await clockIn(user));
    if (b.action === 'out') return NextResponse.json(await clockOut(user, { tags: b.tags || [], note: b.note || '' }, ctx));
    if (b.action === 'request') return NextResponse.json(await requestHours(user, { hours: b.hours, why: b.why }, ctx));
    if (b.action === 'fix') return NextResponse.json(await fixShift(user, b.id, { start: b.start, end: b.end }));
    if (b.action === 'approve' || b.action === 'decline') {
      if (!user.director) return NextResponse.json({ error: 'Only directors decide hours' }, { status: 403 });
      return NextResponse.json(await decideRequest(user, b.id, b.action === 'approve', ctx));
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Couldn’t save that', atCap: !!e.atCap }, { status: 400 });
  }
}
