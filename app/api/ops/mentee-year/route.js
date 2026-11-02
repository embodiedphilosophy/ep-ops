import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { ConflictError } from '@/lib/ops/store';
import { refreshSite } from '@/lib/ops/refresh';
import { checkItem, checkMonth, saveItem, saveMonth } from '@/lib/ops/menteeyearedit';

export const dynamic = 'force-dynamic';

// Ops → Mentee year edits (Jacob, Irene, Floss):
//   { what: 'step' | 'task', id? (omit to add), values, before? }   add or change a project step / a task on the mentees' "This month"
//   { what: 'step' | 'task', id, hide: true } / { …, show: true }    take it off the mentees' page, or put it back
//   { what: 'month', values: { month, theme, focus } }               a month's theme and focus
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can edit the mentee year' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (b.what === 'month') {
      const c = checkMonth(b.values || {});
      if (c.errors) return NextResponse.json({ error: 'Some fields need fixing', errors: c.errors }, { status: 400 });
      await saveMonth({ values: c.values, who });
    } else if (b.what === 'step' || b.what === 'task') {
      if ((b.hide || b.show) && !b.id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
      let values = {};
      if (!b.hide && !b.show) {
        const c = checkItem(b.what, b.values || {});
        if (c.errors) return NextResponse.json({ error: 'Some fields need fixing', errors: c.errors }, { status: 400 });
        values = c.values;
      }
      const r = await saveItem({ kind: b.what, id: b.id || '', values, before: b.before || null, hide: !!b.hide, show: !!b.show, who });
      refreshSite();
      return NextResponse.json({ ok: true, ...r });
    } else return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    refreshSite();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed this in the meantime. Reload the page to see the latest, then try again.', conflict: e.current }, { status: 409 });
    console.error('mentee year save', e.message);
    return NextResponse.json({ error: /^Sheets|^Google/.test(e.message) ? 'Could not save to the sheet. Try again shortly.' : e.message }, { status: 502 });
  }
}
