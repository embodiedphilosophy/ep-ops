import { NextResponse } from 'next/server';
import { teacherContext } from '@/lib/ops/auth';
import { offeringsFor } from '@/lib/teach';
import { agreementFor, signOnboardingAgreement } from '@/lib/ops/faculty';
import { ConflictError } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';

// The agreement step of teacher onboarding: { name, agree } signs the General Teaching Agreement for the signed-in
// teacher (Jacob's countersignature is added automatically and the exact text is archived on Faculty Invitations).
// Directors trying onboarding as a teacher ({ as }): the input is checked, nothing is saved or sent.
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ctx = await teacherContext(b.as);
  if (!ctx) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    const offs = await offeringsFor(ctx.email, { fresh: true });
    if (ctx.actingAs) {
      if (String(b.name || '').trim().length < 3) return NextResponse.json({ error: 'Type your full name to sign' }, { status: 400 });
      if (!b.agree) return NextResponse.json({ error: 'Tick the box to agree' }, { status: 400 });
      const st = await agreementFor(ctx.email, offs, { name: b.name });
      return NextResponse.json({ ok: true, preview: true, agreement: st.status === 'signed' ? st : { status: 'signed', signer: String(b.name).trim(), countersigned_by: 'Jacob Kyle', signed_at: new Date().toISOString(), link: '' } });
    }
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const base = process.env.OPS_URL || new URL(req.url).origin;
    const agreement = await signOnboardingAgreement(ctx.email, offs, { name: b.name, agree: !!b.agree }, { ip, base });
    return NextResponse.json({ ok: true, agreement });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Something changed while you were signing. Reload and try again.' }, { status: 409 });
    console.error('Onboarding agreement failed', e.message);
    return NextResponse.json({ error: /^Sheets|^Google/.test(e.message) ? 'Couldn’t save your signature just now. Please try again in a minute.' : e.message }, { status: 400 });
  }
}
