import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { waitingReplays } from '@/lib/ops/lanes';
import { updateRow, ensureColumns, TABLES, ConflictError } from '@/lib/ops/store';
import { getEpisodes, placeholder } from '@/lib/podcast';
import { addDays } from '@/lib/ops/tasks';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const slim = e => ({ id: e.sched_id || e.id, title: e.title, date: e.date, track: e.track, teachers: e.teachers || e.course_host || '', link: e.replay_link || '' });

// GET → replays still to post, replays posted in the last 30 days, the latest CHITHEADS episodes
export async function GET() {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    const today = todayET(), from = addDays(today, -30);
    const [waiting, cal, eps] = await Promise.all([waitingReplays().catch(() => null), loadCalendar().catch(() => []), getEpisodes(6).then(x => x.filter(e => !placeholder.includes(e))).catch(() => [])]);
    return NextResponse.json({ canEdit: canEditEmail(user), today, error: waiting === null ? 'Couldn’t read the calendar.' : '', replays: (waiting || []).map(slim),
      posted: cal.filter(e => e.replay_link && e.date >= from && e.date < today).sort((a, b) => b.date.localeCompare(a.date)).map(slim), episodes: eps });
  } catch (e) { console.error('Media read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the media' }, { status: 502 }); }
}

// POST { action: 'posted', id, link } → writes the Circle link into the event's "Replay in Circle" (Event Details › Replay Link)
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email and media team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email, bad = (error, status = 400) => NextResponse.json({ error }, { status });
  if (b.action !== 'posted') return bad('Unknown request');
  const link = String(b.link || '').trim();
  if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(link)) return bad('Paste the Circle link, starting with https://');
  try {
    const ev = (await loadCalendar()).find(e => (e.sched_id || e.id) === b.id); if (!ev) return bad('That session isn’t on the Master Schedule', 404);
    if (ev.date >= todayET()) return bad('That session hasn’t happened yet.');
    await ensureColumns(TABLES.details.title, ['Replay Link'], { headerRow: TABLES.details.headerRow });
    await updateRow('details', ev.sched_id || ev.id, { 'Replay Link': link }, { before: { 'Replay Link': ev.replay_link || '' }, who: me });
    refreshSite(); return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError || e?.name === 'ConflictError') return bad('Someone changed this a moment ago. Reload and try again.', 409);
    console.error('Replay link write failed', e.message); return bad('Couldn’t save that', 502);
  }
}
