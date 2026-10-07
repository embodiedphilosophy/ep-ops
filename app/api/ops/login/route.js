import { NextResponse } from 'next/server';
import { loadTeam } from '@/lib/calendar';
import { sign } from '@/lib/ops/auth';
import { isTeacherEmail, profileFor } from '@/lib/teach';
import { sendEmail, layout, button } from '@/lib/ops/email';

export const dynamic = 'force-dynamic';

// Email a one-time sign-in link to anyone on the Team tab
export async function POST(req) {
  try { return await handle(req); }
  catch (e) { console.error('Sign-in link failed:', e.message); return NextResponse.json({ error: 'Could not send a sign-in link' }, { status: 500 }); }
}

async function handle(req) {
  const { email } = await req.json().catch(() => ({}));
  const e = String(email || '').trim().toLowerCase();
  let person = (await loadTeam({ fresh: true })).find(t => t.email && t.email.trim() === e);
  // Teachers named in a session's Teacher/Host Emails can sign in before they're on the Team tab
  if (!person && e && (await isTeacherEmail(e))) person = { name: (await profileFor(e))?.name || 'there' };
  if (person) {
    const base = process.env.OPS_URL || new URL(req.url).origin;
    const link = `${base}/api/ops/verify?token=${encodeURIComponent(sign({ email: e, purpose: 'login' }, 60 * 30))}`;
    await sendEmail({ to: e, subject: 'Your Embodied Philosophy sign-in link',
      html: layout(`Hi ${person.name.split(' ')[0]}`, `<p>Use this link to sign in to your Embodied Philosophy dashboard. It works for 30 minutes.</p>${button(link, 'Sign in')}`) });
  }
  // Same answer either way, so the form doesn't reveal who is on the team
  return NextResponse.json({ ok: true });
}
