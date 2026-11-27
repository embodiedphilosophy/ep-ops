import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canPayroll } from '@/lib/ops/nav';
import { ConflictError } from '@/lib/ops/store';
import { teamRows } from '@/lib/ops/people';
import { MONTH, monthView, saveLine, finalize, reopen, sendToAdmin, settings, saveSettings, loadPeople, savePerson, removePerson, setAccess, monthNow } from '@/lib/ops/payroll';

// Payroll (lib/ops/payroll.js). Seen by directors and anyone with the Payroll role; only a director changes who
// can see it and where it is sent.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function who() {
  const user = await currentUser();
  if (!user) return [null, fail('Please sign in again', 401)];
  if (!canPayroll(user)) return [null, fail('Payroll is only for Jacob and the people he gives access', 403)];
  return [user];
}

// GET ?month=YYYY-MM → the month, people & rates, the payroll admin, and (directors) who can see payroll
export async function GET(req) {
  const [user, denied] = await who(); if (!user) return denied;
  const month = new URL(req.url).searchParams.get('month') || monthNow();
  try {
    const [view, people, s, team] = await Promise.all([monthView(month), loadPeople(), settings(), user.director ? teamRows() : []]);
    const access = user.director ? team.filter(t => t.active && !['teacher'].includes(String(t.type).toLowerCase()))
      .map(t => ({ name: t.name, email: t.email, director: String(t.type).toLowerCase() === 'director', payroll: /(^|,)\s*payroll\s*(,|$)/i.test(t.roles || '') })) : null;
    return NextResponse.json({ ...view, people, settings: s, access, director: !!user.director });
  } catch (e) { console.error('Payroll read failed', e.message); return fail(e.message.startsWith('Pick') ? e.message : 'Couldn’t read payroll just now', 502); }
}

// POST { action: 'line', month, key ('new' to add), fields: { hours, rate, amount, what, name, email, note, removed, kind, date } }
//      { action: 'finalize' | 'reopen' | 'send', month }
//      { action: 'person', person: { email, name, kind, rate, monthly, note } } | { action: 'unperson', email }
//      { action: 'settings', admin_name, admin_email }   director     { action: 'access', email, on }   director
export async function POST(req) {
  const [user, denied] = await who(); if (!user) return denied;
  const b = await req.json().catch(() => ({})), by = user.name || user.email;
  const month = String(b.month || '');
  try {
    if (['line', 'finalize', 'reopen', 'send'].includes(b.action) && !MONTH.test(month)) return fail('Pick a month');
    if (b.action === 'line') { await saveLine(month, String(b.key || ''), b.fields || {}, by); return NextResponse.json({ ok: true }); }
    if (b.action === 'finalize') { const r = await finalize(month, by); return NextResponse.json({ ok: true, message: `Finalized: ${r.lines} lines, $${r.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}. The month is locked; reopen it to change anything.` }); }
    if (b.action === 'reopen') { await reopen(month, by); return NextResponse.json({ ok: true, message: 'Reopened. Finalize it again when you’re done.' }); }
    if (b.action === 'send') { const r = await sendToAdmin(month, by); return NextResponse.json({ ok: true, message: `Sent to ${r.to}.` }); }
    if (b.action === 'person') { await savePerson(b.person || {}, by); return NextResponse.json({ ok: true }); }
    if (b.action === 'unperson') { await removePerson(b.email, by); return NextResponse.json({ ok: true }); }
    if (b.action === 'settings' || b.action === 'access') {
      if (!user.director) return fail('Only a director changes this', 403);
      if (b.action === 'settings') return NextResponse.json({ ok: true, settings: await saveSettings(b, by) });
      if (String(b.email).toLowerCase() === String(user.email).toLowerCase()) return fail('Directors always see payroll');
      await setAccess(b.email, !!b.on, by); return NextResponse.json({ ok: true });
    }
    return fail('Unknown action');
  } catch (e) {
    if (e instanceof ConflictError) return fail('Someone else changed this at the same time. Reload and try again.', 409);
    console.error('Payroll action failed', b.action, e.message);
    return fail(/^Sheets|^Google|^Email failed/.test(e.message) ? 'That didn’t go through. Try again shortly.' : e.message, 502);
  }
}
