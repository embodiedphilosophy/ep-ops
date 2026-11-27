import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { issueList, ensureIssue, weekLists, verses, FIELDS, VERSE, OFFER_COLS } from '@/lib/ops/newsletter';
import { runScaffolding, audience } from '@/lib/ops/scaffoldrun';
import { buildIssue, weekEvents } from '@/lib/scaffolding';
import { updatePlain, ensureColumns } from '@/lib/ops/store';
import { updateBroadcast } from '@/lib/kit';
import { etToIso } from '@/lib/ops/emailrender';
import { forgetKit } from '@/lib/ops/emailkit';
import { todayET } from '@/lib/events';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const H = { ...FIELDS, ...VERSE };

// GET → the issues, renumbered   GET ?date=YYYY-MM-DD → one issue to edit
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const u = new URL(req.url), date = u.searchParams.get('date'), fresh = u.searchParams.get('fresh') === '1';
  try {
    const { list, snap } = await issueList({ fresh });
    const slim = ({ raw, ...x }) => x;
    if (!date) return NextResponse.json({ issues: list.slice().reverse().map(slim), at: snap.at, error: snap.error, canEdit: canEditEmail(user), today: todayET() });
    const it = list.find(i => i.send_date === date); if (!it) return NextResponse.json({ error: 'No issue for that date' }, { status: 404 });
    if (u.searchParams.get('preview')) { const r = await runScaffolding({ date, mode: 'preview' }); return new NextResponse(r.html || '<p>No preview</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    const [wk, vs] = await Promise.all([weekLists(date), verses()]);
    const events = await weekEvents(date), built = buildIssue(it.raw, events);
    return NextResponse.json({ issue: { ...slim(it), values: Object.fromEntries(Object.keys(H).map(k => [k, it.raw[k] || ''])) }, ...wk, verses: vs, gaps: built.gaps, audience: audienceText(), canEdit: canEditEmail(user), editable: it.state !== 'Sent' && it.state !== 'Scheduled' });
  } catch (e) { console.error('Newsletter read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the newsletter' }, { status: 502 }); }
}
const audienceText = () => { const f = audience()[0] || {}; return f.none ? 'Everyone except people on the hold tag' : f.all?.[0]?.type === 'all_subscribers' ? 'Everyone on the list' : 'A set group in Kit'; };

// POST { action: create | save | build | schedule | skip, date, ... }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email, bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
  if (!DATE.test(b.date || '')) return bad('Which Sunday?');
  try {
    if (b.action === 'create') { const made = await ensureIssue(b.date, me); refreshSite(); return NextResponse.json({ ok: true, made }); }
    const { list, issues } = await issueList({ fresh: true }), it = list.find(i => i.send_date === b.date); if (!it) return bad('No issue for that date', 404);
    const row = issues.find(i => i.send_date === b.date);
    if (b.action === 'save') {
      if (['Sent', 'Scheduled'].includes(it.state)) return bad(`This issue is ${it.state.toLowerCase()}, so it can’t be changed here.`, 409);
      const ch = {}, before = {};
      for (const k of Object.keys(FIELDS)) if (b.changes?.[k] !== undefined) { ch[FIELDS[k]] = String(b.changes[k]).slice(0, 12000); before[FIELDS[k]] = row[k] ?? ''; }
      if (b.changes?.quote_id) { // the verse is copied from the verified Quote Library, never typed
        const v = (await verses()).find(x => x.quote_id === b.changes.quote_id); if (!v) return bad('That verse isn’t verified in the Quote Library.');
        Object.assign(ch, { [VERSE.sanskrit_devanagari]: v.devanagari, [VERSE.sanskrit_iast]: v.iast, [VERSE.sanskrit_translation]: v.translation, [VERSE.sanskrit_source]: v.source });
        for (const k of Object.keys(VERSE)) before[VERSE[k]] = row[k] ?? '';
      }
      if (b.changes?.clear_verse) for (const k of Object.keys(VERSE)) { ch[VERSE[k]] = ''; before[VERSE[k]] = row[k] ?? ''; }
      if (!Object.keys(ch).length) return NextResponse.json({ ok: true });
      if (OFFER_COLS.some(c => c in ch)) await ensureColumns('Weekly Scaffolding', OFFER_COLS); // the four offer columns are added the first time
      await updatePlain('Weekly Scaffolding', row._row, ch, { before, who: me }); refreshSite(); return NextResponse.json({ ok: true });
    }
    if (b.action === 'build') { // makes or updates the Kit draft (never schedules)
      if (!b.confirm) return bad('Please confirm first');
      if (['Sent', 'Scheduled'].includes(it.state)) return bad(`This issue is already ${it.state.toLowerCase()} in Kit.`, 409);
      const r = await runScaffolding({ date: b.date, mode: 'build', origin: new URL(req.url).origin }); forgetKit(); refreshSite();
      return NextResponse.json({ ok: r.status < 300, ...r.json }, { status: r.status });
    }
    if (b.action === 'schedule') {
      if (!b.confirm) return bad('Please confirm first');
      if (!it.kit_id) return bad('Build the Kit draft first.');
      if (['Sent', 'Scheduled'].includes(it.state)) return bad(`This issue is already ${it.state.toLowerCase()}.`, 409);
      const built = buildIssue(row, await weekEvents(b.date)), note = String(b.override_note || '').trim(), problems = [...built.gaps.map(g => `Still blank: ${g}`), ...(it.send_date < todayET() ? ['The send date has passed.'] : [])];
      if (problems.length && !note) return bad('Some checks didn’t pass. Fix them, or schedule anyway with a note.', 400, { checks: problems, needNote: true });
      await updateBroadcast(it.kit_id, { send_at: etToIso(b.date, '09:00') }); forgetKit();
      await updatePlain('Weekly Scaffolding', row._row, { Notes: note ? `Scheduled anyway: ${note}`.slice(0, 300) : row.notes || '' }, { who: me, before: {} });
      refreshSite(); return NextResponse.json({ ok: true });
    }
    if (b.action === 'skip') {
      if (!b.confirm) return bad('Please confirm first');
      if (['Sent', 'Scheduled'].includes(it.state)) return bad(`This issue is ${it.state.toLowerCase()}. It can’t be skipped.`, 409);
      await updatePlain('Weekly Scaffolding', row._row, { Status: 'Skip' }, { who: me, before: { Status: row.status } }); refreshSite(); return NextResponse.json({ ok: true });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return bad('Someone changed this a moment ago. Reload and try again.', 409);
    console.error('Newsletter write failed', e.message); return bad('Couldn’t save that. Kit may be busy; try again in a minute.', 502);
  }
}
