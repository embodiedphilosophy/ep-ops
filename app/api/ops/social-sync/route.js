import { NextResponse } from 'next/server';
import { syncInstagram } from '@/lib/ops/igsync';
import { setHealth } from '@/lib/ops/socialhealth';
import { refreshSite } from '@/lib/ops/refresh';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Hourly (vercel.json cron): Instagram → Post History, likes and comments, and "Posted" on the matching plan rows.
// By hand: /api/ops/social-sync?key=CRON_SECRET  (&dry=1 shows what it would do; &from=2026-10-01 backfills from that day)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = url.searchParams.get('dry') === '1', from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : '';
  if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
  try {
    const r = await syncInstagram({ from, dry });
    if (r.ok && !dry) refreshSite();
    return NextResponse.json(r);
  } catch (e) {
    console.error('Instagram sync failed', e.message);
    if (!dry) await setHealth('ig_sync_error', { error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
