import { NextResponse } from 'next/server';
import { runInsights } from '@/lib/ops/adsinsights';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every Monday (vercel.json cron, after the daily Audience library job): the weekly read for Ads › Audience insights. It reads five sources (the Practice Report's anonymous totals, Meta results
// kept in the dashboard's own database, Circle purchases, Kit purchases, Kit email opens and clicks), works out the numbers, asks the model (only with those numbers) for a short read and
// for topic ideas, CHECKS every claim against the numbers and drops any that fail, and keeps the result in the dashboard's own database. It only READS the other systems and never writes
// to Meta, Circle, Kit or the quiz. Nothing is sent or posted from it.
//   ?dry=1 (or ?preview=1)   reads the sources and says what it would do; keeps nothing, asks no model, makes no table. Works while the jobs are paused.
// By hand: /api/ops/ads-insights?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runInsights({ preview })); }
  catch (e) { console.error('ads-insights', String(e.message).slice(0, 120)); return NextResponse.json({ error: 'The weekly read could not run just now' }, { status: 500 }); }
}
