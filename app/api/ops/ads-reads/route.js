import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { adsTablesExist } from '@/lib/ops/adsstore';
import { insightsView, decideIdea, runInsights } from '@/lib/ops/adsinsights';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
let lastRun = 0;

// Ads › Audience insights (Ads PR 5). Directors and the Ads role, like the rest of Ads.
// GET [?week=YYYY-MM-DD]  → the weekly read (or a past one), its numbers, the five sources and whether each is connected, the quiz breakdowns, the topic table and the ideas. Only reads what is saved.
// POST { action: 'run' }                       → "Read the week now": the same job the Monday cron runs (it only reads the other systems)
// POST { action: 'send' | 'dismiss' | 'undismiss', id }   → a person's decision on a topic idea. 'send' puts it on the Programs page as a draft idea; nothing is written to any sheet.
export async function GET(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  try { return NextResponse.json(await insightsView({ week: new URL(req.url).searchParams.get('week') || '' })); }
  catch (e) { console.error('Audience insights read failed', String(e.message).slice(0, 120)); return bad('Couldn’t read the Audience insights', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({})), me = user.name || user.email;
  try {
    if (b.action === 'run') {
      if (Date.now() - lastRun < 60000) return bad('The week was only just read. Give it a minute.', 429);
      lastRun = Date.now();
      const r = await runInsights({});
      return NextResponse.json({ ok: true, message: 'The week has been read.', summary: { metrics: r.metrics, read: r.read, ideas: r.ideas } });
    }
    if (!['send', 'dismiss', 'undismiss'].includes(b.action)) return bad('Unknown request');
    if (!(await adsTablesExist())) return bad('There are no ideas yet.', 404);
    const r = await decideIdea(String(b.id || ''), b.action, me);
    return NextResponse.json(r, { status: r.ok ? 200 : r.status || 400 });
  } catch (e) { console.error('Audience insights write failed', String(e.message).slice(0, 120)); return bad('Couldn’t save that. Try again in a moment.', 502); }
}
