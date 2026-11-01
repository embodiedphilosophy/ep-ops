import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { refreshSite } from '@/lib/ops/refresh';
import { saveText, saveStep, saveMonth, EditError, ConflictError } from '@/lib/ops/yearedit';

export const dynamic = 'force-dynamic';

// Edits on Ops → Mentee year (people who can edit events: directors, managers, projects).
//   POST { kind: 'text', path, value }                     → words from data/mentee-year.json (blank = back to the original)
//   POST { kind: 'step', id, changes, before }             → a dated project step (title, detail, evidence, date, project)
//   POST { kind: 'month', id, changes, before }            → a month's theme, focus, reflection_due
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEvents(user)) return NextResponse.json({ error: 'You don’t have permission to edit the mentee year.' }, { status: 403 });
  const body = await req.json().catch(() => ({})), who = user.name || user.email;
  try {
    if (body.kind === 'text') await saveText(body, who);
    else if (body.kind === 'step') await saveStep(body, who);
    else if (body.kind === 'month') await saveMonth(body, who);
    else return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    refreshSite();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof EditError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed this a moment ago. Reload the page to see their version, then edit again.' }, { status: 409 });
    console.error('Mentee year save failed', e.message);
    return NextResponse.json({ error: 'Couldn’t save. Try again shortly.' }, { status: 500 });
  }
}
