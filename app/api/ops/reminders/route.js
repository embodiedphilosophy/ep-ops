import { NextResponse } from 'next/server';
import { runReminders } from '@/lib/ops/reminders';
import { jobsHere, SKIPPED } from '@/lib/crongate';
import { refreshSite } from '@/lib/ops/refresh';

// Daily (vercel.json cron): turns every enabled reminder rule into the Kit emails for sessions in the next 14 days. Makes drafts, or
// schedules them only for rules with "Schedule automatically" on. Never makes the same email twice.
// By hand: /api/ops/reminders?key=CRON_SECRET  (&dry=1 lists what it would make and changes nothing; &days=21; &rule=R001)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = url.searchParams.get('dry') === '1';
  if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
  try {
    const items = await runReminders({ dry, days: Math.min(60, Number(url.searchParams.get('days')) || 14), ruleId: url.searchParams.get('rule') || '' });
    if (!dry) refreshSite();
    return NextResponse.json({ ok: true, dry, made: items.filter(i => i.state === 'made').length, items: items.map(i => ({ rule: i.rule.id, event: i.event.id, send_at: i.send_at, state: i.state, why: i.why })) });
  } catch (e) { console.error('Reminders job failed', e.message); return NextResponse.json({ ok: false, error: e.message }, { status: 502 }); }
}
