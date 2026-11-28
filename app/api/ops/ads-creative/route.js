import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { creativeView } from '@/lib/ops/adscreative';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Ads › Creative results. Directors and the Ads role, like the rest of Ads; everyone else gets 403. READ ONLY, so there is no POST: it reads the ads Ops built and the daily results
// already kept for them, makes no table, asks Meta for nothing and changes nothing.
// GET → { exists, connected, synced_at, in_meta, left_out, thresholds, groups: [{ kind, images, copy, pairs, … }] } (see lib/ops/adscreative.js)
export async function GET() {
  const user = await currentUser();
  if (!canAds(user)) return NextResponse.json({ error: 'Ads is for directors and the Ads role' }, { status: 403 });
  try { return NextResponse.json(await creativeView()); }
  catch (e) { console.error('Creative results read failed', String(e.message || e).slice(0, 120)); return NextResponse.json({ error: 'Couldn’t read the creative results just now. Try again in a moment.' }, { status: 502 }); }
}
