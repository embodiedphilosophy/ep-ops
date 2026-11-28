import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { historyView, runHistory } from '@/lib/ops/adshistory';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
let lastRun = 0;

// Ads › What we've learned. Directors and the Ads role, like the rest of Ads; everyone else gets 403. READ ONLY: nothing here writes to Meta.
// GET                    → what has been read so far: how much history and how fresh, the statements (working / not working / no longer true), the groups with too little to say. Only reads what is saved.
// POST { action: 'run' } → "Read the history now": the same job the hourly cron runs, a few more weeks (it resumes where it stopped), at most once a minute
export async function GET() {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  try { return NextResponse.json(await historyView()); }
  catch (e) { console.error('Ads history read failed', String(e.message).slice(0, 120)); return bad('Couldn’t read what has been learned just now. Try again in a moment.', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'run') return bad('Unknown request');
  const wait = Math.ceil((60000 - (Date.now() - lastRun)) / 1000);
  if (wait > 0) return NextResponse.json({ error: `The history was only just read. You can read it again in ${wait} seconds.`, wait }, { status: 429 });
  lastRun = Date.now();
  try { const r = await runHistory({}); return NextResponse.json({ ok: true, run: r, view: await historyView() }); }
  catch (e) { console.error('Ads history run failed', String(e.message).slice(0, 120)); return bad('Couldn’t read the history just now. Try again in a minute.', 502); }
}
