import { NextResponse } from 'next/server';
import { runWatch } from '@/lib/ops/adswatch';
import { loadTeam } from '@/lib/calendar';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every hour (vercel.json cron): the ad safety net. It READS Meta across the whole ad account (never a write, never a pause), judges six checks, and tells people (email, text and
// WhatsApp, by level) when money is at risk, when an ad should be off, when tracking has broken, or when it cannot see the account at all. See lib/ops/adswatch.js and lib/ops/alerts.js.
//   ?dry=1 (or ?preview=1)   reads Meta and says what it would alert and to whom; records nothing, sends nothing, makes no table. Works while the jobs are paused.
//                            &now=2026-12-01T13:00:00Z pretends it is that moment (preview only).
// By hand: /api/ops/ads-watch?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  const asked = preview && url.searchParams.get('now') ? new Date(url.searchParams.get('now')) : null, now = asked && !isNaN(asked) ? asked : new Date();
  try {
    const team = await loadTeam({ fresh: true }).catch(() => []);
    return NextResponse.json(await runWatch({ now, preview, team, base: process.env.OPS_URL || url.origin }));
  } catch (e) { console.error('ads-watch', String(e.message || e).slice(0, 200)); return NextResponse.json({ error: 'The ad safety net could not run just now' }, { status: 500 }); }
}
