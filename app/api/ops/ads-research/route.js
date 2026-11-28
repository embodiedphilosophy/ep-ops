import { NextResponse } from 'next/server';
import { runResearch } from '@/lib/ops/adsresearch';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every Monday (vercel.json cron): the weekly outside research for Ads. It asks the model, with Anthropic's web search and only EP-neutral questions (never a customer, a campaign or a number from
// EP's account), what changed OUTSIDE that could matter to the ads, CHECKS every statement against the sources the search really returned (a statement without a returned source, or whose numbers or
// words are not in its source, or that gives advice, is dropped), and keeps what is left in the dashboard's own database. It only informs: it changes no rule and no ad, and writes nothing to Meta.
//   ?dry=1 (or ?preview=1)   says what it would do (whether the key is set, how many searches); asks nothing, keeps nothing, makes no table. Works while the jobs are paused.
// By hand: /api/ops/ads-research?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const preview = url.searchParams.get('dry') === '1' || url.searchParams.get('preview') === '1';
  if (!preview && !jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runResearch({ preview })); }
  catch (e) { console.error('ads-research', String(e.message).slice(0, 120)); return NextResponse.json({ error: 'The weekly outside research could not run just now' }, { status: 500 }); }
}
