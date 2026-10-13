import { NextResponse } from 'next/server';
import { runAutoComplete } from '@/lib/ops/autocomplete';
import { sweepShifts } from '@/lib/ops/hours';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Every 15 minutes (vercel.json cron): tick off tasks the calendar sheet proves are done, and look after
// the time clock (a reminder at 10 hours on the clock; shifts left open past midnight are closed).
// By hand: /api/ops/auto?key=CRON_SECRET  (&dry=1 lists what it would close and changes nothing)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = url.searchParams.get('dry') === '1';
  if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
  let shifts = null;
  if (!dry) { try { shifts = await sweepShifts({ base: process.env.OPS_URL || url.origin }); } catch (e) { shifts = { error: e.message }; } }
  try { return NextResponse.json({ ...(await runAutoComplete({ dry })), shifts }); }
  catch (e) { return NextResponse.json({ error: e.message, shifts }, { status: 500 }); }
}
