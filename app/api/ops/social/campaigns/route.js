import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditSocial, canApproveSocial } from '@/lib/ops/nav';
import { readPlain, addPlain } from '@/lib/ops/store';
import { loadCalendar, loadTeam } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { eventFacts } from '@/lib/ops/templates/facts';
import { postIdFor, mondayOf, eventLabel } from '@/lib/ops/socialengine';
import { rowsOf, add, update, nextId } from '@/lib/ops/socialdata';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
const SHOW = { sheet: 'social', light: true };
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const STATES = ['Promote', 'Campaign', 'Skip'];
const CLIP = ['Not requested', 'Requested', 'In edit', 'Ready'];
const now = () => new Date().toISOString();
const who = u => u.name || u.email;
const vals = rows => rows.map(r => ({ row: r.row, ...r.values }));

// What's coming up (public events, next 12 weeks) with what the team decided for each, plus campaigns and clip requests
export async function GET() {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    const today = todayET(), end = addDays(today, 84);
    const [cal, coming, camps, steps, clips, plan, team] = await Promise.all([loadCalendar(), rowsOf('Coming Up'), rowsOf('Campaigns'), rowsOf('Campaign Steps'), rowsOf('Clip Requests'),
      readPlain('Weekly Plan', SHOW).catch(() => ({ rows: [] })), loadTeam().catch(() => [])]);
    const decided = Object.fromEntries(coming.map(r => [r.values.event_id, r.values]));
    const events = cal.filter(e => e.date >= today && e.date <= end && /public|free/i.test(e.audience || 'public') && !/cancel/i.test(e.status) && e.newsletter !== 'hide')
      .sort((a, b) => a.date.localeCompare(b.date)).map(e => {
        const f = eventFacts(e), d = decided[e.id] || {}, label = eventLabel(e);
        const posts = plan.rows.filter(r => String(r.values.linked_event || '').includes(e.id) || r.values.linked_event === label).length;
        const camp = camps.find(c => c.values.event_id === e.id)?.values.id || '';
        return { id: e.id, title: e.title, date: e.date, time: e.time || '', state: d.promote_state || (/meditation resolution/i.test(e.title) ? 'Campaign' : 'Promote'), decided: !!d.promote_state, note: d.note || '',
          missing: f.missing || [], posts, campaign: camp };
      });
    const campaigns = camps.map(c => ({ ...c.values, steps: vals(steps).filter(s => s.campaign_id === c.values.id).sort((a, b) => Number(b.step) - Number(a.step) || a.date.localeCompare(b.date)) }));
    const owner = team.find(t => t.roles.some(r => /^creator$/i.test(r)) || /rebecka/i.test(t.name));
    return NextResponse.json({ today, events, campaigns, clips: vals(clips), owner: owner?.name || '', states: STATES, clipStates: CLIP,
      canEdit: canEditSocial(user), canApprove: canApproveSocial(user) });
  } catch (e) { console.error('Campaigns read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the campaigns' }, { status: 502 }); }
}

// POST { action: 'state' | 'campaign' | 'step' | 'apply' | 'request' | 'clip' | 'campaignEdit', ... }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = who(user);
  const bad = (error, status = 400) => NextResponse.json({ error }, { status });
  try {
    if (b.action === 'state') {
      if (!STATES.includes(b.state) || !b.event_id) return bad('Pick Promote, Campaign or Skip');
      const ev = (await loadCalendar()).find(e => e.id === b.event_id); if (!ev) return bad('That event isn’t on the Master Schedule');
      const cur = (await rowsOf('Coming Up')).find(r => r.values.event_id === b.event_id);
      const v = { promote_state: b.state, set_by: me, note: String(b.note ?? cur?.values.note ?? '').slice(0, 300) };
      if (cur) await update('Coming Up', cur.row, v, { promote_state: cur.values.promote_state, note: cur.values.note }, me);
      else await add('Coming Up', { event_id: ev.id, title: ev.title, date: ev.date, kind: 'event', ...v }, me);
      refreshSite(); return NextResponse.json({ ok: true });
    }
    if (b.action === 'campaign') { // start a campaign for an event: a countdown of N days ending the day before, and the launch on the day
      const ev = (await loadCalendar()).find(e => e.id === b.event_id); if (!ev) return bad('That event isn’t on the Master Schedule');
      const camps = await rowsOf('Campaigns');
      if (camps.some(c => c.values.event_id === ev.id)) return bad('This event already has a campaign');
      const n = Math.min(10, Math.max(1, Number(b.days) || 5)), id = nextId(camps, 'id', 'C');
      await add('Campaigns', { id, name: String(b.name || ev.title).slice(0, 120), event_id: ev.id, link_url: String(b.link_url || ''), status: 'Planning', updated_by: me }, me);
      const rows = [];
      for (let i = n; i >= 1; i--) rows.push({ campaign_id: id, step: String(i), date: addDays(ev.date, -i), time_et: '11:00', theme: `${i} ${i === 1 ? 'day' : 'days'} to go`, teacher: '' });
      rows.push({ campaign_id: id, step: '0', date: ev.date, time_et: '09:00', theme: 'Doors open', teacher: '' });
      for (const r of rows) await add('Campaign Steps', r, me);
      const cur = (await rowsOf('Coming Up')).find(r => r.values.event_id === ev.id);
      if (cur) await update('Coming Up', cur.row, { promote_state: 'Campaign', set_by: me }, { promote_state: cur.values.promote_state }, me);
      else await add('Coming Up', { event_id: ev.id, title: ev.title, date: ev.date, promote_state: 'Campaign', set_by: me, kind: 'event' }, me);
      refreshSite(); return NextResponse.json({ ok: true, id });
    }
    if (b.action === 'step') { // edit a step's day, time, theme or teacher
      const t = (await rowsOf('Campaign Steps')).find(r => r.values.campaign_id === b.campaign_id && String(r.values.step) === String(b.step));
      if (!t) return bad('No such step');
      const ch = {}; for (const k of ['date', 'time_et', 'theme', 'teacher']) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 200);
      if (ch.date && !/^\d{4}-\d{2}-\d{2}$/.test(ch.date)) return bad('Pick a date');
      await update('Campaign Steps', t.row, ch, Object.fromEntries(Object.keys(ch).map(k => [k, t.values[k]])), me);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'campaignEdit') {
      const c = (await rowsOf('Campaigns')).find(r => r.values.id === b.id); if (!c) return bad('No such campaign');
      const ch = {}; for (const k of ['name', 'link_url', 'notes', 'status']) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 300);
      await update('Campaigns', c.row, { ...ch, updated_by: me }, Object.fromEntries(Object.keys(ch).map(k => [k, c.values[k]])), me);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'apply') { // one Proposed post on the calendar for each step that has none yet; nothing is approved or published
      const c = (await rowsOf('Campaigns')).find(r => r.values.id === b.campaign_id); if (!c) return bad('No such campaign');
      const ev = (await loadCalendar()).find(e => e.id === c.values.event_id);
      const steps = (await rowsOf('Campaign Steps')).filter(r => r.values.campaign_id === c.values.id && !r.values.plan_post_id);
      if (!steps.length) return NextResponse.json({ ok: true, added: 0 });
      const plan = await readPlain('Weekly Plan', { sheet: 'social' }), ids = plan.rows.map(r => r.values.post_id);
      let added = 0;
      for (const s of steps) {
        const post_id = postIdFor(s.values.date, ids); ids.push(post_id);
        const launch = String(s.values.step) === '0';
        await addPlain('Weekly Plan', { post_id, week_of: mondayOf(s.values.date), publish_date: s.values.date, publish_time_ET: s.values.time_et || '11:00', platforms: launch ? 'IG Feed' : 'IG Reel',
          media_kind: launch ? 'single' : 'reel', pillar: launch ? 'Past or upcoming course' : 'Teacher video', status: 'Proposed', linked_event: ev ? eventLabel(ev) : '',
          caption: '', jake_notes: `${c.values.name}: ${s.values.theme}${s.values.teacher ? ` (${s.values.teacher})` : ''}`, created_by: me, updated_by: me, updated_at: now() }, { who: me, sheet: 'social' });
        await update('Campaign Steps', s.row, { plan_post_id: post_id }, { plan_post_id: s.values.plan_post_id }, me);
        added++;
      }
      refreshSite(); return NextResponse.json({ ok: true, added });
    }
    if (b.action === 'request') { // ask for a clip from each step that has a teacher and no request yet; the owner sees them as Requested
      const steps = (await rowsOf('Campaign Steps')).filter(r => r.values.campaign_id === b.campaign_id && r.values.teacher && !r.values.clip_request_id && String(r.values.step) !== '0');
      if (!steps.length) return NextResponse.json({ ok: true, sent: 0 });
      const clips = await rowsOf('Clip Requests'); let ids = clips.map(r => r); let sent = 0;
      for (const s of steps) {
        const id = nextId(ids, 'id', 'CR'); ids = [...ids, { values: { id } }];
        await add('Clip Requests', { id, for_post_id: s.values.plan_post_id, campaign_id: b.campaign_id, teacher: s.values.teacher, source: String(b.source || ''), ask: s.values.theme, length: '30–45s', aspect: '9:16',
          owner: String(b.owner || ''), requested_by: me, status: 'Requested', due: addDays(s.values.date, -7) }, me);
        await update('Campaign Steps', s.row, { clip_request_id: id }, { clip_request_id: s.values.clip_request_id }, me);
        sent++;
      }
      refreshSite(); return NextResponse.json({ ok: true, sent });
    }
    if (b.action === 'clip') {
      if (!CLIP.includes(b.status)) return bad('Unknown status');
      const c = (await rowsOf('Clip Requests')).find(r => r.values.id === b.id); if (!c) return bad('No such request');
      const ch = { status: b.status }; for (const k of ['source', 'edit_notes', 'owner', 'drive_file_id']) if (b[k] !== undefined) ch[k] = String(b[k]).slice(0, 300);
      await update('Clip Requests', c.row, ch, { status: c.values.status }, me);
      return NextResponse.json({ ok: true });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return NextResponse.json({ error: 'Someone changed this a moment ago. Reload and try again.' }, { status: 409 });
    console.error('Campaigns write failed', e.message); return NextResponse.json({ error: 'Couldn’t save that' }, { status: 502 });
  }
}
