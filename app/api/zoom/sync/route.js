import { NextResponse } from 'next/server';
import { eventRows, recurringRules, todayET } from '@/lib/events';
import { listUpcoming } from '@/lib/zoom';
import { planMeetings, ensureMeeting } from '@/lib/zoomplan';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Creates or updates Zoom meetings from the sheet's `zoom` column (see lib/zoomplan.js):
//   one-off → one meeting for that row (multi-day rows get one link for every day)
//   series  → one meeting for every row / Recurring rule sharing the same series name
//   blank   → nothing (hand-made meetings such as Meditation Mondays; paste the link in zoom_link)
// Runs daily via Vercel Cron (vercel.json), or open /api/zoom/sync?key=CRON_SECRET to run it now.
// Add &dry=1 to see what it would create or update without touching Zoom.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const report = [];
  try {
    const dry = new URL(req.url).searchParams.get('dry');
    if (!dry && !jobsHere()) return NextResponse.json(SKIPPED);
    const [rows, rules] = await Promise.all([eventRows(), recurringRules()]);
    const { plans, skipped } = planMeetings(rows, rules, todayET());
    if (dry) return NextResponse.json({ mode: 'dry run: Zoom was not touched',
      meetings: plans.map(p => ({ zoom_key: p.key, kind: p.kind, title: p.title, time: p.time, minutes: p.duration, sessions: p.dates.length, dates: p.dates, ...(p.warning ? { warning: p.warning } : {}) })), skipped });
    const upcoming = await listUpcoming();
    skipped.forEach(s => report.push({ ...s, action: 'skipped' }));
    for (const p of plans) {
      try { report.push(await ensureMeeting(p, upcoming)); }
      catch (e) { report.push({ id: p.key, action: 'error', error: e.message }); }
    }
    return NextResponse.json({ ok: !report.some(r => r.action === 'error'), report });
  } catch (err) {
    console.error('Zoom sync failed', err.message);
    return NextResponse.json({ ok: false, error: err.message, report }, { status: 500 });
  }
}
