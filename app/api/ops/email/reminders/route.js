import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { ruleRows, ruleOf, runReminders, parseSends, sendsText, BUILT_IN, SEED } from '@/lib/ops/reminders';
import { kitSnapshot } from '@/lib/ops/emailkit';
import { updatePlain, addPlain } from '@/lib/ops/store';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const FIELDS = ['name', 'tracks', 'title_match', 'sends', 'subject', 'body', 'button_label'];

// GET → the rules, what they would make in the next two weeks, the Kit groups for the audience picker
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const [rows, upcoming, snap] = await Promise.all([ruleRows({ light: !fresh }), runReminders({ dry: true }), kitSnapshot({ fresh })]);
    const rules = rows.map(ruleOf).map(r => ({ ...r, sends_text: sendsText(r.sends), audience: JSON.parse(r.audience_json || '{}') }));
    return NextResponse.json({ rules, builtIn: BUILT_IN, upcoming: upcoming.map(u => ({ ...u, rule: { id: u.rule.id, name: u.rule.name, enabled: u.rule.enabled } })),
      kit: { tags: Object.entries(snap.tags).map(([id, name]) => ({ id, name })), segments: Object.entries(snap.segments).map(([id, name]) => ({ id, name })) }, kitError: snap.error, canEdit: canEditEmail(user) });
  } catch (e) { console.error('Reminders read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the reminder rules' }, { status: 502 }); }
}

// POST { action: 'save', id, changes } | { action: 'create' } | { action: 'run', id, confirm }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email, bad = (error, status = 400) => NextResponse.json({ error }, { status });
  try {
    const rows = await ruleRows({ light: false });
    if (b.action === 'create') {
      const id = `R${String(Math.max(0, ...rows.map(r => Number(String(r.values.id).replace('R', '')) || 0)) + 1).padStart(3, '0')}`;
      await addPlain('Reminder Rules', { ...SEED[0], id, name: 'New reminder rule', tracks: '', title_match: '', sends: '60m', enabled: '', auto_schedule: '', updated_by: me, updated_at: new Date().toISOString() }, { who: me });
      refreshSite(); return NextResponse.json({ ok: true, id });
    }
    const cur = rows.find(r => r.values.id === b.id); if (!cur) return bad('No such rule', 404);
    const r = ruleOf(cur);
    if (b.action === 'save') {
      const ch = {}; for (const k of FIELDS) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 2000);
      if (b.changes?.audience) ch.audience_json = JSON.stringify(b.changes.audience);
      if (b.changes?.enabled !== undefined) ch.enabled = b.changes.enabled ? 'TRUE' : '';
      if (b.changes?.auto_schedule !== undefined) ch.auto_schedule = b.changes.auto_schedule ? 'TRUE' : '';
      const next = { ...r, ...ch };
      const p = parseSends(next.sends); if (p.bad.length || !p.sends.length) return bad(p.bad.length ? `I can’t read “${p.bad.join(', ')}”. Use 60m (minutes before) or d0@08:00 (the day of, at 8:00 ET).` : 'Say when the email goes out.');
      if (next.title_match) { try { new RegExp(next.title_match); } catch { return bad('The words to match aren’t valid.'); } }
      if (String(next.enabled).toUpperCase() === 'TRUE') {
        if (!String(next.tracks || '').trim() && !String(next.title_match || '').trim()) return bad('Say which sessions this covers before switching it on.');
        if (!JSON.parse(next.audience_json || '{}').include?.length) return bad('Choose who gets it before switching it on.');
      }
      await updatePlain('Reminder Rules', cur.row, { ...ch, updated_by: me, updated_at: new Date().toISOString() }, { before: Object.fromEntries(Object.keys(ch).map(k => [k, cur.values[k]])), who: me });
      refreshSite(); return NextResponse.json({ ok: true });
    }
    if (b.action === 'run') {
      if (!b.confirm) return bad('Please confirm first');
      if (!r.enabled) return bad('Switch the rule on first.');
      const items = await runReminders({ dry: false, ruleId: r.id });
      refreshSite(); return NextResponse.json({ ok: true, made: items.filter(i => i.state === 'made').length, skipped: items.filter(i => i.state === 'skip').length });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return bad('Someone changed this a moment ago. Reload and try again.', 409);
    console.error('Reminder rule write failed', e.message); return bad('Couldn’t save that', 502);
  }
}
