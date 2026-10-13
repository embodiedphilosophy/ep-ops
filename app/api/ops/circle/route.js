import { NextResponse } from 'next/server';
import { runCircleSync, liveAllowed } from '@/lib/ops/circlesync';
import { refreshSite } from '@/lib/ops/refresh';

// Circle event sync by hand (the daily job runs it too).
//   /api/ops/circle?key=CRON_SECRET          dry run: lists what it would create, adopt and update, and what needs a person
//   /api/ops/circle?key=CRON_SECRET&live=1   does it, only when CIRCLE_EVENT_SYNC=live is set in Vercel
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const live = url.searchParams.get('live') === '1';
  if (live && !liveAllowed()) return NextResponse.json({ error: 'Live Circle sync is switched off. Set CIRCLE_EVENT_SYNC=live in Vercel first.' }, { status: 403 });
  try {
    const out = await runCircleSync({ dry: !live });
    if (live && out.done.length) refreshSite();
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
