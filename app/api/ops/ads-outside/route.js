import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { researchView, runResearch } from '@/lib/ops/adsresearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

// Ads › Audience insights › Outside research. Directors and the Ads role, like the rest of Ads.
// GET [?week=YYYY-MM-DD]  → what was found that week (or the latest), each statement with its sources, and whether the key is set. Only reads what is saved.
// POST { action: 'run' }  → "Look now": the same look the Monday cron makes (one search run on our Anthropic account); once every few minutes. It only informs: it changes nothing in Meta or in any rule.
export async function GET(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  try { return NextResponse.json(await researchView({ week: new URL(req.url).searchParams.get('week') || '' })); }
  catch (e) { console.error('Outside research read failed', String(e.message).slice(0, 120)); return bad('Couldn’t read the outside research', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'run') return bad('Unknown request');
  try {
    const r = await runResearch({ manual: true });
    if (r.state === 'too_soon') return bad('A look was only just made. Give it a few minutes.', 429);
    if (r.state === 'no_key') return bad('The look needs the Anthropic key, which isn’t set up yet. Nothing was searched.', 503);
    if (r.state === 'failed') return bad('The look couldn’t be made just now, so nothing new was kept. Try again in a few minutes.', 502);
    return NextResponse.json({ ok: true, state: r.state, message: r.state === 'unchanged' ? 'Done. Nothing new this time, so this week’s earlier statements are still shown.' : r.state === 'ok' ? `Done. ${r.kept} statement${r.kept === 1 ? '' : 's'} with a source ${r.kept === 1 ? 'was' : 'were'} kept.` : 'Done. Nothing new we could back with a source.', summary: { searches: r.searches, kept: r.kept, dropped: r.dropped } });
  } catch (e) { console.error('Outside research run failed', String(e.message).slice(0, 120)); return bad('Couldn’t make the look just now. Try again in a moment.', 502); }
}
