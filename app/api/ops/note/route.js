import { NextResponse } from 'next/server';
import { refreshSite } from '@/lib/ops/refresh';
import { currentUser } from '@/lib/ops/auth';
import { setNote } from '@/lib/ops/note';

export const dynamic = 'force-dynamic';

// POST { text } → the director's note on everyone's Home (empty text hides it)
export async function POST(req) {
  const user = await currentUser();
  if (!user?.director) return NextResponse.json({ error: 'Only directors can edit the note' }, { status: 403 });
  const { text } = await req.json().catch(() => ({}));
  try { await setNote(text, user.name); refreshSite(); return NextResponse.json({ ok: true }); }
  catch (e) {
    console.error('Note save failed', e.message);
    return NextResponse.json({ error: /400|Unable to parse range/.test(e.message) ? 'Add a tab named “Ops Note” to the calendar sheet first.' : 'Could not save. Try again shortly.' }, { status: 502 });
  }
}
