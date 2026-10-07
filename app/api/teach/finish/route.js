import { NextResponse } from 'next/server';
import { teacherContext } from '@/lib/ops/auth';
import { profileFor, saveProfile, addToTeam, offeringsFor } from '@/lib/teach';
import { todayET } from '@/lib/events';
import { longDate } from '@/lib/dates';
import { sendEmail, layout, esc, button } from '@/lib/ops/email';

export const dynamic = 'force-dynamic';

// Onboarding finished: mark it on the profile, add them to the Team tab, send the welcome email
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ctx = await teacherContext(b.as);
  if (!ctx) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  if (ctx.actingAs) return NextResponse.json({ ok: true, preview: true });
  const p = await profileFor(ctx.email);
  if (!p?.name) return NextResponse.json({ error: 'Please finish your profile first.' }, { status: 400 });
  await saveProfile(ctx.email, { onboarded_on: p.onboarded_on || todayET() });
  const team = await addToTeam({ name: p.name, email: ctx.email }).catch(e => `Team tab: ${e.message}`);
  if (!p.onboarded_on) {
    const base = process.env.OPS_URL || new URL(req.url).origin;
    const list = (await offeringsFor(ctx.email)).map(o => `<li><b>${esc(o.title)}</b>, ${esc(longDate(o.start))}${o.time ? ' · ' + esc(o.time) : ''}</li>`).join('');
    await sendEmail({ to: ctx.email, subject: 'Welcome to the Embodied Philosophy faculty',
      html: layout(`Welcome, ${esc(p.name.split(' ')[0])}`, `<p>Thank you for teaching with us. You’re on the schedule for:</p><ul>${list}</ul>
        <p>Your course page is with our team for review; we’ll email you when it’s live. Your dashboard lists everything we need from you, with due dates and your Zoom links.</p>
        <p>Reminders arrive a week before, the day before and the day of each session, from this address. Add it to your contacts so they don’t land in spam.</p>
        ${button(`${base}/ops`, 'Open your dashboard')}`) }).catch(() => {});
  }
  return NextResponse.json({ ok: true, team });
}
