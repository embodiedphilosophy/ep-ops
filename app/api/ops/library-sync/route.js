import { NextResponse } from 'next/server';
import { runLibrarySync } from '@/lib/ops/librarysync';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every hour (vercel.json cron): read Circle and update the Course Library. Reads Circle only; never writes to it.
// By hand: /api/ops/library-sync?key=CRON_SECRET
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!jobsHere()) return NextResponse.json(SKIPPED);
  try { return NextResponse.json(await runLibrarySync()); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
