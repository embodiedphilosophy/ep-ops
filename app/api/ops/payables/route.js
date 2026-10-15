import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff } from '@/lib/ops/nav';
import { loadTeam } from '@/lib/calendar';
import { markPaid, submitHours, syncPayables } from '@/lib/ops/payables';
import { statusFor, clockAvailable, monthNow } from '@/lib/ops/hours';

export const dynamic = 'force-dynamic';
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// POST { action: 'paid', keys: [...] }        director: record payments made in Gusto
//      { action: 'sync' }                      director: write newly taught sessions to the tab
//      { action: 'submit-hours', month }       staff contractor: submit a month of hours (their invoice)
export async function POST(req) {
  const user = await currentUser();
  if (!user) return fail('Please sign in again', 401);
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (b.action === 'paid' || b.action === 'sync') {
      if (!user.director) return fail('Only directors record payments', 403);
      if (b.action === 'sync') return NextResponse.json({ ok: true, added: await syncPayables({ who }) });
      const keys = (Array.isArray(b.keys) ? b.keys : []).map(String).slice(0, 200);
      if (!keys.length) return fail('Nothing picked');
      return NextResponse.json({ ok: true, paid: await markPaid(keys, who) });
    }
    if (b.action === 'submit-hours') {
      if (!isStaff(user) || user.director) return fail('Only staff contractors submit hours', 403);
      if (!clockAvailable()) return fail('The time clock isn’t connected');
      const month = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : monthNow();
      const member = (await loadTeam()).find(m => m.email === user.email) || user;
      const st = await statusFor(member, month);
      if (st.open) return fail('Clock out first');
      if (!st.used) return fail('No hours to submit for that month');
      return NextResponse.json({ ok: true, ...(await submitHours(member, month, st.used, { who })) });
    }
    return fail('Unknown action');
  } catch (e) {
    console.error('Payables action failed', b.action, e.message);
    return fail(/^Sheets|^Google/.test(e.message) ? 'Could not save. Try again shortly.' : e.message, 502);
  }
}
