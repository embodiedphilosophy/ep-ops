import { NextResponse } from 'next/server';
import { runScaffolding } from '@/lib/ops/scaffoldrun';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// The Weekly Scaffolding draft (vercel.json cron, Thursdays). Builds a Kit DRAFT for the coming Sunday
// from the "Weekly Scaffolding" tab + that week's Master Schedule events, then emails the directors.
// It never schedules or sends: the send button in Kit stays with a person.
//
// Re-running for the same Sunday overwrites that draft (if it is still an unsent draft), so make text
// changes in the dashboard (Content → Email), then rebuild there. Edits made inside Kit are lost on a rebuild.
// The building itself is lib/ops/scaffoldrun.js, shared with the dashboard's Build / Preview buttons.
// The draft goes to Kit as editable editor blocks (lib/scaffoldtree.js); if Kit refuses them it falls back to one
// HTML block (lib/scaffolding.js). SCAFFOLDING_FORMAT=html forces HTML.
//
// Modes (all need ?key=CRON_SECRET or the cron's Authorization header):
//   (none)                 the cron: the coming Sunday
//   &date=YYYY-MM-DD       a specific Sunday (rebuilds its draft)
//   &preview=1             SENDS NOTHING, CREATES NOTHING: returns the email as a web page
//   &dry=1                 JSON of what would happen (events found, blanks to fill); nothing created
//
// Vercel: KIT_API_KEY, CALENDAR_SHEET_ID (+ Google service account), RESEND_API_KEY,
// optional SCAFFOLDING_TEMPLATE_ID (default 5578308 "Text only"), SCAFFOLDING_SEGMENT_ID or SCAFFOLDING_TAG_ID
// (default: all subscribers except the Hold tag, HOLD_TAG_ID, default 24363585).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const mode = url.searchParams.get('preview') ? 'preview' : url.searchParams.get('dry') ? 'dry' : 'build';
  if (mode === 'build' && !jobsHere()) return NextResponse.json(SKIPPED);
  const r = await runScaffolding({ date: url.searchParams.get('date'), mode, origin: url.origin });
  if (r.html) return new NextResponse(r.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  return NextResponse.json(r.json, { status: r.status });
}
