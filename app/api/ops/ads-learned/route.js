import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { historyView, runHistory, reasonOf, guardMs } from '@/lib/ops/adshistory';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;   // the history job's own clock (RUN_BUDGET_MS in lib/ops/adshistory.js, 80 seconds) and the guard below (105) both end inside this; the hourly job's route says the same
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
let lastRun = 0;

// Ads › What we've learned. Directors and the Ads role, like the rest of Ads; everyone else gets 403. READ ONLY: nothing here writes to Meta. Every answer is JSON, whatever goes wrong.
// GET                    → what has been read so far: how much history and how fresh, the statements (working / not working / no longer true), the groups with too little to say. Only reads what is saved.
// POST { action: 'run' } → "Read the history now": the same job the hourly cron runs, a few more weeks (it resumes where it stopped), at most once a minute.
//                          The job keeps to its own time budget and saves as it goes; if it still has not finished when the guard time comes, the answer says what was done so far instead of failing.
export async function GET() {
  try {
    const user = await currentUser();
    if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
    return NextResponse.json(await historyView());
  } catch (e) { console.error('Ads history read failed', reasonOf(e)); return bad(`Couldn’t read what has been learned just now (${reasonOf(e) || 'no reason given'}). Try again in a moment.`, 502); }
}

export async function POST(req) {
  try {
    const user = await currentUser();
    if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
    const b = await req.json().catch(() => ({}));
    if (b.action !== 'run') return bad('Unknown request');
    const wait = Math.ceil((60000 - (Date.now() - lastRun)) / 1000);
    if (wait > 0) return NextResponse.json({ error: `The history was only just read. You can read it again in ${wait} seconds.`, wait }, { status: 429 });
    lastRun = Date.now();
    const live = {}, work = runHistory({ live }), late = Symbol('late');
    work.catch(() => {});   // if the guard answered first, a failure after that is not worth an unhandled error
    let timer; const guard = new Promise(res => { timer = setTimeout(() => res(late), guardMs()); });
    let r; try { r = await Promise.race([work, guard]); } finally { clearTimeout(timer); }
    if (r === late) {
      const run = { ...live, timedOut: true, progress: live.progress || '', note: 'This read was stopped just before the server’s time limit. What was read is kept, and the next press (or the next hourly run) carries on from there.' };
      return NextResponse.json({ ok: true, run, view: await historyView().catch(() => null) });
    }
    return NextResponse.json({ ok: true, run: r, view: await historyView() });
  } catch (e) { console.error('Ads history run failed', reasonOf(e)); return bad(`Couldn’t read the history just now (${reasonOf(e) || 'no reason given'}). Try again in a minute.`, 502); }
}
