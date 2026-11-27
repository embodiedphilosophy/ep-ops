import { NextResponse } from 'next/server';
import { runResultsSync } from '@/lib/ops/adssync';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every hour (vercel.json cron): read each campaign's results from Meta and keep them, a day at a time, for the campaign page and the morning rules.
// It only READS Meta (it needs the ads access key and nothing else) and writes only to the dashboard's own database; the write gate is never involved.
//   ?dry=1     reads Meta and says what it would keep, writes nothing (works while the jobs are paused)
//   ?days=N    how far back to read (default 7, at most 60)
// By hand: /api/ops/ads-sync?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = url.searchParams.get('dry') === '1';
  if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runResultsSync({ days: url.searchParams.get('days') || 7, dry })); }
  catch (e) { console.error('ads-sync', e.message); return NextResponse.json({ error: 'The results sync could not run just now' }, { status: 500 }); }
}
