import { NextResponse } from 'next/server';
import { sendEmail, layout, button, esc } from '@/lib/ops/email';
import { jobsHere, SKIPPED } from '@/lib/crongate';
import { loadMentor, mentorEmails } from '@/lib/mentee/mentorload';
import { digestFrom } from '@/lib/mentee/mentor';
import { runNudges } from '@/lib/mentee/nudge';

// Monday morning (vercel.json): one email to Jacob with what needs him in Sahṛdaya Upāya this week, and, only when MENTEE_NUDGES=on,
// the gentle messages to pairs with no session. Needs ?key=CRON_SECRET (or the cron header).
//   ?dry=1   shows the email as a web page and the nudges that would go, and sends nothing
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = url.searchParams.get('dry') === '1';
  if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
  const today = url.searchParams.get('today') || nyToday();
  const base = process.env.SCHOOL_ORIGIN || 'https://ss.embodiedphilosophy.com';
  try {
    const m = await loadMentor({ today });
    const d = digestFrom({ queue: m.queue, words: m.words, tiles: m.tiles, today, link: p => base + p });
    const html = layout(d.subject, (d.lines.length ? d.lines.map(l => `<p><b>${esc(l.head)}</b></p>${l.items.length ? `<ul>${l.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}`).join('') : '<p>Nothing is waiting for you this week.</p>') + button(d.queueUrl, 'Open the review queue'));
    const nudges = await runNudges({ tiles: m.tiles, rotation: m.rotation, dry });
    if (dry) return new NextResponse(`<!doctype html><meta charset="utf-8"><title>${esc(d.subject)}</title>${html}<pre style="padding:20px">${esc(JSON.stringify({ nudgesOn: m.nudges, nudges }, null, 2))}</pre>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    await sendEmail({ to: mentorEmails()[0], subject: d.subject, html });
    return NextResponse.json({ sent: true, subject: d.subject, nudges: nudges.map(n => ({ key: n.key, sent: n.sent, error: n.error || undefined })) });
  } catch (e) { console.error('mentee-digest', e.message); return NextResponse.json({ error: 'The digest could not be built just now' }, { status: 502 }); }
}
