import { NextResponse } from 'next/server';
import { runMorningRules } from '@/lib/ops/adsrules';
import { runResultsSync } from '@/lib/ops/adssync';
import { buildDigest, adsRecipients } from '@/lib/ops/adsdigest';
import { loadTeam } from '@/lib/calendar';
import { sendEmail } from '@/lib/ops/email';
import { jobsHere, SKIPPED } from '@/lib/crongate';
import { runHeartbeat } from '@/lib/ops/adswatch';
import { routineAlerts, routineHtml } from '@/lib/ops/alerts';
import { layout } from '@/lib/ops/email';

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
    // The ad safety net rides along: this daily job checks the hourly watchdog is alive (alerts if it has gone quiet) and puts any routine safety notes in the digest
    const heartbeat = await runHeartbeat({ now, preview, team, base }).catch(() => ({ error: 'The safety net check could not run' }));
    const routine = await routineAlerts().catch(() => []), extra = routineHtml(routine, base);
    if (d && extra) d.html += `<div style="max-width:560px;margin:0 auto;padding:0 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a342b">${extra}</div>`;
    const note = !d && extra ? { subject: 'Ads: notes from the safety net', html: layout('Ads: notes from the safety net', extra), sections: [], made: 0, would: 0 } : null, mail = d || note;
    const digest = mail && { subject: mail.subject, to, made: mail.made, would: mail.would, sections: mail.sections, sent: false, routine: routine.length };
    if (preview && url.searchParams.get('html') === '1' && mail) return new NextResponse(`<!doctype html><meta charset="utf-8"><title>${mail.subject.replace(/</g, '')}</title>${mail.html}`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (!preview && mail && to.length) {
      try { for (const email of to) await sendEmail({ to: email, subject: mail.subject, html: mail.html }); digest.sent = true; }
      catch (e) { digest.error = 'The digest could not be sent just now'; console.error('ads digest', e.message); }
    }
    return NextResponse.json({ ...run, sync: sync && { campaigns: sync.campaigns, rows: sync.rows, errors: sync.errors }, digest, safety: { heartbeat } });
  } catch (e) { console.error('ads-rules', e.message); return NextResponse.json({ error: 'The morning rules could not run just now' }, { status: 500 }); }
}
