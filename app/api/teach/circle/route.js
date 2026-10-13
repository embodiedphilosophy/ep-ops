import { NextResponse } from 'next/server';
import { teacherContext } from '@/lib/ops/auth';
import { offeringsFor, loadPages, savePage, profileFor, usesCircle, circleGroupsFor } from '@/lib/teach';
import { giveTeacherAccess, circleConfigured } from '@/lib/circle';

export const dynamic = 'force-dynamic';

// Give the teacher Circle access for one offering (Sādhana School and seasonal sādhanas only, for now)
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ctx = await teacherContext(b.as);
  if (!ctx) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const offering = (await offeringsFor(ctx.email)).find(o => o.key === b.offering);
  if (!offering) return NextResponse.json({ error: 'Offering not found' }, { status: 404 });
  if (!usesCircle(offering.track)) return NextResponse.json({ ok: true, skipped: true });
  if (ctx.actingAs) return NextResponse.json({ ok: true, preview: true, steps: [
    { step: 'account', ok: true, note: 'Trying it out: Circle wasn’t changed' }] });
  if (!circleConfigured()) return NextResponse.json({ error: 'Circle isn’t connected yet. The EP team will add you.' }, { status: 503 });

  const page = (await loadPages()).find(p => p.offering === offering.key);
  const name = (await profileFor(ctx.email))?.name || '';
  try {
    const groupIds = await circleGroupsFor(offering.key);
    const spaceId = page?.circle_space_id || (groupIds.length ? '' : process.env[`CIRCLE_SPACE_${offering.track}`] || '');
    const steps = await giveTeacherAccess({ email: ctx.email, name, spaceId, groupIds });
    await savePage(offering.key, { circle_status: steps.map(s => `${s.ok ? '✓' : '•'} ${s.note}`).join('; ') }).catch(() => {});
    return NextResponse.json({ ok: true, steps });
  } catch (e) {
    await savePage(offering.key, { circle_status: `Error: ${e.message}` }).catch(() => {});
    return NextResponse.json({ error: 'Circle didn’t respond as expected. The EP team has been flagged and will add you.' }, { status: 502 });
  }
}
