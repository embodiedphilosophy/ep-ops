import { NextResponse } from 'next/server';
import { runLibraryUpdate } from '@/lib/ops/adslibrary';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every morning (vercel.json cron): the Audience library is brought up to date from the ad results. For each campaign that is in Meta it keeps each audience's result in
// ads_audience_results, works out every audience's standing (Proven, Promising, Not tested, Retired) and strikes, and adds a library row for any audience a campaign used that
// the library doesn't have yet. It only reads the dashboard's own database: it never writes to Meta and never reads the quiz. With no campaigns it does nothing ("No campaigns yet.").
//   ?dry=1 (or ?preview=1)   works it all out and says what it would do; records nothing. Works while the jobs are paused.
// By hand: /api/ops/ads-audiences?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runLibraryUpdate({ preview })); }
  catch (e) { console.error('ads-audiences', e.message); return NextResponse.json({ error: 'The Audience library update could not run just now' }, { status: 500 }); }
}
