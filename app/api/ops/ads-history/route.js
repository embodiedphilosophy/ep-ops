import { NextResponse } from 'next/server';
import { runHistory, reasonOf } from '@/lib/ops/adshistory';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every hour (vercel.json cron): reads the history of the ads already run in the Meta account, a few weeks at a time, for Ads › What we've learned. The first import takes several runs: each run
// saves the weeks it finished and the next one carries on; when Meta says "too many requests" it stops and the next run tries again. Once everything is read it only refreshes the latest four weeks, about once a day.
// Each run keeps to its own time budget (80 seconds, in lib/ops/adshistory.js) inside the 120 below, saves as it goes and carries on from where it stopped, even on a very big account. It only READS Meta and never writes to it. By hand: /api/ops/ads-history?key=CRON_SECRET
//   ?dry=1 (or ?preview=1)   asks Meta for the campaign list only, says what it would read, keeps nothing and makes no table. Works while the jobs are paused.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runHistory({ preview })); }
  catch (e) { console.error('ads-history', reasonOf(e)); return NextResponse.json({ error: `The ad history could not be read just now (${reasonOf(e) || 'no reason given'})` }, { status: 500 }); }
}
