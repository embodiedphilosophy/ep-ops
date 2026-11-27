import { NextResponse } from 'next/server';
import { runMorningRules } from '@/lib/ops/adsrules';
import { runResultsSync } from '@/lib/ops/adssync';
import { buildDigest, adsRecipients } from '@/lib/ops/adsdigest';
import { loadTeam } from '@/lib/calendar';
import { sendEmail } from '@/lib/ops/email';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every morning (vercel.json cron): the automatic rules, then the daily ad digest. Judges each running campaign whose rules a person switched on, ad set by ad set, on
// the last 72 hours; records every decision; and changes Meta ONLY when all three locks are open (jobs live here, META_ADS_LIVE=live, and Make's Ad Agent OFF).
// With any lock closed it makes and records the same decisions as a dry run and changes nothing. See lib/ops/adsrules.js.
//   ?dry=1 (or ?preview=1)   decides and says what it would do and what the digest would say; records nothing, sends nothing, changes nothing.
//                            Works while the jobs are paused. &now=2026-12-01T13:00:00Z pretends it is that moment (preview only). &html=1 shows the email as a page.
// By hand: /api/ops/ads-rules?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  const asked = preview && url.searchParams.get('now') ? new Date(url.searchParams.get('now')) : null, now = asked && !isNaN(asked) ? asked : new Date();
  const base = process.env.OPS_URL || url.origin;
  try {
    const sync = preview ? null : await runResultsSync({ now });   // fresh numbers first
    const run = await runMorningRules({ now, preview });
    const team = await loadTeam({ fresh: true }).catch(() => []), to = adsRecipients(team);
    const d = run.note ? null : await buildDigest({ run, base, now });
    const digest = d && { subject: d.subject, to, made: d.made, would: d.would, sections: d.sections, sent: false };
    if (preview && url.searchParams.get('html') === '1' && d) return new NextResponse(`<!doctype html><meta charset="utf-8"><title>${d.subject.replace(/</g, '')}</title>${d.html}`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (!preview && d && to.length) {
      try { for (const email of to) await sendEmail({ to: email, subject: d.subject, html: d.html }); digest.sent = true; }
      catch (e) { digest.error = 'The digest could not be sent just now'; console.error('ads digest', e.message); }
    }
    return NextResponse.json({ ...run, sync: sync && { campaigns: sync.campaigns, rows: sync.rows, errors: sync.errors }, digest });
  } catch (e) { console.error('ads-rules', e.message); return NextResponse.json({ error: 'The morning rules could not run just now' }, { status: 500 }); }
}
