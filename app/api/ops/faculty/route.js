import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { createInvite, resendInvite, cancelInvite, loadTemplates, fillContract, offerings, KINDS, FEE_UNITS } from '@/lib/ops/faculty';
import { ConflictError } from '@/lib/ops/store';
import { addPerson, setActive, sendOnboardingLink } from '@/lib/ops/people';

export const dynamic = 'force-dynamic';
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i;

// POST { action: 'create', name, email, kind, offering, title?, fee?, fee_unit, message?, template?, terms? }  (no template: no agreement to sign)
//      { action: 'addPerson', name, email, type, roles?, onboard? } | { action: 'removePerson' | 'restorePerson', email } | { action: 'onboardingLink', name, email }
//      { action: 'preview', …same }  → the contract as the teacher will read it (nothing saved or sent)
//      { action: 'resend' | 'cancel', id }
export async function POST(req) {
  const user = await currentUser();
  if (!user) return fail('Please sign in again', 401);
  if (!canEditEvents(user)) return fail('Only Jacob, Irene and Floss can invite faculty', 403);
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  const base = process.env.OPS_URL || new URL(req.url).origin;
  try {
    if (b.action === 'resend') return NextResponse.json({ ok: true, ...(await resendInvite(b.id, who, base)) });
    if (b.action === 'cancel') { await cancelInvite(b.id, who); return NextResponse.json({ ok: true }); }
    // People (the Team tab): add, take off, bring back, and a teacher's onboarding link
    if (b.action === 'addPerson') {
      const p = await addPerson({ name: b.name, email: b.email, type: b.type, roles: b.roles }, user);
      const mail = p.type === 'teacher' && b.onboard ? await sendOnboardingLink(p, base) : null;
      return NextResponse.json({ ok: true, message: `${p.name} is ${p.back ? 'back' : 'added'}.${mail ? (mail.sent ? ' Their onboarding link is on its way.' : ` The onboarding link wasn’t sent: ${mail.why}`) : ''}` });
    }
    if (b.action === 'removePerson' || b.action === 'restorePerson') {
      const p = await setActive(b.email, b.action === 'restorePerson', user);
      return NextResponse.json({ ok: true, message: b.action === 'restorePerson' ? `${p.name} is back on the team.` : `${p.name} is off the team and can no longer sign in. Nothing was deleted.` });
    }
    if (b.action === 'onboardingLink') {
      const mail = await sendOnboardingLink({ name: b.name, email: b.email }, base);
      return mail.sent ? NextResponse.json({ ok: true, message: `Onboarding link sent to ${b.email}.` }) : fail(mail.why);
    }
    const f = {
      name: String(b.name || '').trim(), email: String(b.email || '').trim().toLowerCase(), kind: b.kind, offering: b.offering,
      title: String(b.title || '').trim().slice(0, 160), fee: String(b.fee || '').replace(/[^0-9.]/g, ''), fee_unit: b.fee_unit || 'session',
      message: String(b.message || '').trim().slice(0, 3000), template: b.template, terms: String(b.terms || '').trim().slice(0, 6000),
    };
    if (!f.name) return fail('Their name, please');
    if (!EMAIL.test(f.email)) return fail('A valid email address, please');
    if (!KINDS.includes(f.kind)) return fail('Pick what kind of teaching it is');
    if (!FEE_UNITS.some(u => u.value === f.fee_unit)) return fail('Per session or for the whole offering?');
    if (b.action === 'preview') {
      const off = (await offerings()).find(o => o.key === f.offering);
      const tpl = (await loadTemplates()).find(t => t.name === f.template);
      if (!off) return fail('Pick what you are inviting them to');
      if (!tpl) return NextResponse.json({ ok: true, text: 'No agreement: they accept the invitation, and are then put on the sessions and sent their onboarding link.' });
      return NextResponse.json({ ok: true, text: fillContract(tpl.body, { ...f, offering_title: f.title || off.title, dates: off.dates.join(', ') }) });
    }
    if (b.action === 'create') {
      const inv = await createInvite(f, who, base);
      return NextResponse.json({ ok: true, id: inv.id, link: inv.link, email_status: inv.email_status });
    }
    return fail('Unknown action');
  } catch (e) {
    if (e instanceof ConflictError) return fail('Someone else changed this invitation. Reload and try again.', 409);
    console.error('Faculty action failed', b.action, e.message);
    return fail(/^Sheets|^Google/.test(e.message) ? 'Could not save. Try again shortly.' : e.message, 502);
  }
}
