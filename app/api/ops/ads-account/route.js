import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { accountView } from '@/lib/ops/adsaccount';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

// Ads › Campaigns › "In your Meta account" (Ads account view). Directors and the Ads role, like the rest of Ads; everyone else gets 403. READ ONLY: nothing here writes to Meta or to any table.
// GET                        → every campaign in the real ad account with its last 7 and 30 days, totals, and a status block (not connected / couldn't be read, with a plain reason / ok, with "as of").
//                              Served from a 5-minute memory; only the first look in five minutes asks Meta.
// POST { action: 'refresh' } → asks Meta again now, at most once a minute per person (inside the minute it answers from memory and says how long to wait)
export async function GET() {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  try { return NextResponse.json(await accountView({ who: user.email })); }
  catch (e) { console.error('Ads account view failed', String(e.message || e).slice(0, 120)); return bad('Couldn’t read your Meta account just now. Try again in a moment.', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'refresh') return bad('Unknown request');
  try { return NextResponse.json(await accountView({ refresh: true, who: user.email })); }
  catch (e) { console.error('Ads account refresh failed', String(e.message || e).slice(0, 120)); return bad('Couldn’t read your Meta account just now. Try again in a moment.', 502); }
}
