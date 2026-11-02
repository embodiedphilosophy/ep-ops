import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { ConflictError } from '@/lib/ops/store';
import { refreshSite } from '@/lib/ops/refresh';
import { checkItem, checkMonth, saveItem, saveMonth, checkRow, saveRow, saveReflection, checkBook, saveBook } from '@/lib/ops/menteeyearedit';

export const dynamic = 'force-dynamic';

// Ops → Mentee year edits (Jacob, Irene, Floss):
//   { what: 'step' | 'task', id? (omit to add), values, before? }   add or change a project step / a task on the mentees' "This month"
//   { what: 'step' | 'task', id, hide: true } / { …, show: true }    take it off the mentees' page, or put it back
//   { what: 'month', values: { month, theme, focus } }               a month's theme and focus
//   { what: 'row', values: { month, row, title, line, date, end, link }, hide?, show? }   a row of the month list (immersion, buddy, one-to-one, notes)
//   { what: 'reflection', values: { month, due, title, line } }      the month's reflection: due date and words
//   { what: 'book', month, original?: { title, starts }, values?, hide? }   a book on the reading list (Mentee Books): change, add or take off
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can edit the mentee year' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (b.what === 'row') {
      const c = checkRow(b.values || {});
      if (c.errors) return NextResponse.json({ error: 'Some fields need fixing', errors: c.errors }, { status: 400 });
      await saveRow({ values: c.values, hide: !!b.hide, show: !!b.show, who });
    } else if (b.what === 'reflection') {
      const v = b.values || {}, c = checkRow({ ...v, row: 'reflection', date: v.due });
      if (c.errors) return NextResponse.json({ error: 'Some fields need fixing', errors: { ...c.errors, ...(c.errors.date ? { due: c.errors.date } : {}) } }, { status: 400 });
      await saveReflection({ month: c.values.month, due: c.values.date, title: c.values.title, line: c.values.line, who });
    } else if (b.what === 'book') {
      let values = {};
      if (!b.hide) { const c = checkBook(b.values || {}); if (c.errors) return NextResponse.json({ error: 'Some fields need fixing', errors: c.errors }, { status: 400 }); values = c.values; }
      await saveBook({ month: String(b.month || ''), original: b.original || null, values, hide: !!b.hide, who });
    } else if (b.what === 'month') {
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
