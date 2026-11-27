import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { readPlain } from '@/lib/ops/store';
import { createBroadcast, createTag } from '@/lib/kit';
import { planRows, addPlan, savePlan, opsHash } from '@/lib/ops/emailplan';
import { renderBlocks, filterOf, audienceText } from '@/lib/ops/emailrender';
import { kitHashOf } from '@/lib/ops/emailsync';
import { kitSnapshot, forgetKit, evId } from '@/lib/ops/emailkit';
import { launchRows, playbookRows, addLaunch, saveLaunch, addPlaybook, generate, SUGGESTED, LANES } from '@/lib/ops/launches';
import { eventLabel } from '@/lib/ops/socialengine';
import { eventIdFromTag } from '@/lib/ops/tasks';
import { listTasks } from '@/lib/ops/taskstore';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE = () => Number(process.env.PROMO_TEMPLATE_ID || process.env.SCAFFOLDING_TEMPLATE_ID || 5578308);
const eventOf = async id => id ? (await loadCalendar()).find(e => evId(e) === String(id).toUpperCase()) : null;

// GET → launches, playbooks, suggestions   GET ?id=L001 → one launch with its four lanes
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  try {
    const [launches, playbooks, plan, snap, cal] = await Promise.all([launchRows(), playbookRows(), planRows({ light: false }).catch(() => []), kitSnapshot(), loadCalendar().catch(() => [])]);
    const today = todayET(), meta = { canEdit: canEditEmail(user), today };
    const kit = { tags: Object.entries(snap.tags).map(([i, name]) => ({ id: i, name })), segments: Object.entries(snap.segments).map(([i, name]) => ({ id: i, name })) };
    const mine = l => plan.map(r => r.values).filter(v => v.launch_id === l.id && v.status !== 'Not needed');
    if (!id) {
      const rows = launches.map(l => { const em = mine(l), dates = [...em.map(v => v.planned_date), ...l.steps.map(s => s.date)].filter(Boolean).sort();
        return { id: l.id, name: l.name, kind: l.kind, status: l.status, event_id: l.event_id, first: dates[0] || '', last: dates[dates.length - 1] || '', emails: em.length, scheduled: em.filter(v => ['Scheduled', 'Sent'].includes(v.status)).length, steps: l.steps.length }; })
        .sort((a, b) => (a.first || '9').localeCompare(b.first || '9'));
      const have = new Set(launches.map(l => l.name.toLowerCase()));
      const suggestions = SUGGESTED.filter(s => !have.has(s.name.toLowerCase())).map(s => { const m = s.match && cal.find(e => s.match.test(e.title)); return { name: s.name, kind: s.kind, playbook_id: s.playbook_id, dates: m ? { ...s.dates, event: m.date } : s.dates, event_id: m ? evId(m) : '', note: s.note || '' }; });
      return NextResponse.json({ ...meta, launches: rows, playbooks: playbooks.map(p => ({ id: p.id, name: p.name, about: p.about, anchors: p.anchors, steps: p.steps.length })), suggestions, kit,
        events: cal.filter(e => e.date >= today && !/cancel/i.test(e.status)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 80).map(e => ({ id: evId(e), title: e.title, date: e.date, program: e.track })) });
    }
    const l = launches.find(x => x.id === id); if (!l) return NextResponse.json({ error: 'No such launch' }, { status: 404 });
    const ev = await eventOf(l.event_id), items = [];
    for (const v of mine(l)) items.push({ lane: 'email', key: v.id, title: v.subject || v.step || 'Email', date: v.planned_date, status: v.status, href: `/ops/publish?view=compose-email&id=${v.id}` });
    if (ev) { const label = eventLabel(ev), social = await readPlain('Weekly Plan', { sheet: 'social', light: true }).catch(() => ({ rows: [] }));
      for (const r of social.rows) if (r.values.linked_event === label && r.values.status !== 'Deleted') items.push({ lane: 'social', key: r.values.post_id, title: String(r.values.caption || r.values.pillar || 'Post').split('\n')[0].slice(0, 60), date: r.values.publish_date, status: r.values.status || 'Proposed', href: `/ops/publish?view=compose&row=${r.row}` }); }
    for (const s of l.steps) if (s.type !== 'email') items.push({ lane: s.type, key: `${s.type}:${s.step}`, title: s.step, date: s.date, status: 'Planned', href: '' });
    if (l.landing_url) items.push({ lane: 'page', key: 'url', title: 'Landing page', date: l.steps.find(s => s.type === 'page')?.date || '', status: 'Live link', href: l.landing_url });
    if (l.event_id) { try { for (const t of await listTasks()) if (eventIdFromTag(t.description) === l.event_id && !t.completed) items.push({ lane: 'task', key: t.id, title: t.name.replace(/ — .*$/, ''), date: t.due, status: 'Task', href: '/ops/tasks' }); } catch { /* the tasks lane is left empty if tasks can't be read */ } }
    const dates = items.map(i => i.date).filter(Boolean).sort();
    return NextResponse.json({ ...meta, launch: { id: l.id, name: l.name, kind: l.kind, status: l.status, event_id: l.event_id, landing_url: l.landing_url, notes: l.notes, dates: l.dates, tag_name: l.tag_name, playbook_id: l.playbook_id }, event: ev && { id: evId(ev), key: ev.id, title: ev.title, date: ev.date },
      items, lanes: LANES, from: dates[0] || today, to: dates[dates.length - 1] || today });
  } catch (e) { console.error('Launches read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the launches' }, { status: 502 }); }
}

const blocksFor = (step, ev) => [{ type: 'text', text: `[FILL IN] Write the “${step}” email.` }, ...(ev ? [{ type: 'facts' }] : []), { type: 'button', label: 'Learn more', url: '' }];

// POST { action: 'preview' | 'create' | 'update' | 'savePlaybook' }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email, bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
  try {
    const playbooks = await playbookRows();
    if (b.action === 'preview') {
      const pb = playbooks.find(p => p.id === b.playbook_id); if (!pb) return bad('Choose a playbook');
      return NextResponse.json({ ok: true, ...generate(pb, b.dates || {}) });
    }
    if (b.action === 'create') {
      if (!b.confirm) return bad('Please confirm first');
      const name = String(b.name || '').trim().slice(0, 120); if (!name) return bad('Give the launch a name');
      if ((await launchRows()).some(l => l.name.toLowerCase() === name.toLowerCase())) return bad('A launch with that name already exists');
      const steps = (Array.isArray(b.steps) ? b.steps : []).filter(s => s && DATE.test(s.date || '') && s.step); if (!steps.length) return bad('There are no dated steps to create. Fill in the key dates.');
      const ev = await eventOf(b.event_id), aud = b.audience?.include ? b.audience : { include: [], exclude: [] };
      // The tag for the people who enrol, made in Kit if it isn't there (never deleted, never added to by this)
      let tag = null; const tagName = String(b.tag_name || '').trim();
      if (tagName) { const snap = await kitSnapshot(); const found = Object.entries(snap.tags).find(([, n]) => n.toLowerCase() === tagName.toLowerCase());
        tag = found ? { id: Number(found[0]), name: found[1], made: false } : b.make_drafts ? { ...(await createTag(tagName)), made: true } : null; if (tag?.made) forgetKit(); }
      const audFor = s => s.audience === 'enrolled' && tag ? { include: [{ type: 'tag', id: Number(tag.id), name: tag.name }], exclude: [] } : aud;
      const lid = await addLaunch({ name, kind: String(b.kind || '').slice(0, 40), event_id: ev ? evId(ev) : '', playbook_id: b.playbook_id || '', dates_json: JSON.stringify(b.dates || {}), audience_json: JSON.stringify(aud),
        steps_json: JSON.stringify(steps.filter(s => s.type !== 'email').map(({ type, step, date, time }) => ({ type, step, date, time }))), landing_url: String(b.landing_url || '').slice(0, 300), tag_name: tag?.name || tagName }, me);
      const made = []; let drafts = 0;
      for (const s of steps.filter(x => x.type === 'email')) {
        const blocks = blocksFor(s.step, ev), subject = String(s.subject || `${s.step}: ${name}`).slice(0, 150), a = audFor(s);
        const v = { event_id: ev ? evId(ev) : '', launch_id: lid, step: s.step, type: 'Launch', planned_date: s.date, planned_time_et: s.time || '09:00', status: 'Draft', owner: me, subject, preview_text: '', blocks_json: JSON.stringify(blocks), audience_json: JSON.stringify(a), note: `Made by the launch “${name}”` };
        const r = await addPlan(v, me); made.push(r.id);
        if (b.make_drafts) {
          const fields = { subject, preview_text: '', content: renderBlocks(blocks, { ev }), description: `[${v.event_id || 'no event'}] Launch · ${s.step} · ${audienceText(a)} · ${name}`, email_template_id: TEMPLATE(), subscriber_filter: filterOf(a) };
          const k = await createBroadcast({ ...fields, send_at: null });
          const cur = { ...v, id: r.id, revision: '1', ops_hash: opsHash(v) };
          await savePlan(r.row, cur, { kit_id: String(k.id), kit_hash: kitHashOf({ ...fields, ...k }), synced_ops_hash: cur.ops_hash }, me); drafts++;
        }
      }
      if (drafts) forgetKit(); refreshSite();
      return NextResponse.json({ ok: true, id: lid, emails: made.length, drafts, tag: tag && { name: tag.name, made: tag.made } });
    }
    const l = (await launchRows()).find(x => x.id === b.id); if (!l) return bad('No such launch', 404);
    if (b.action === 'update') {
      const ch = {}; for (const k of ['name', 'status', 'landing_url', 'notes']) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 400);
      if (ch.status && !['Planning', 'Live', 'Done'].includes(ch.status)) return bad('Unknown status');
      await saveLaunch(l._row, ch, Object.fromEntries(Object.keys(ch).map(k => [k, l[k]])), me); refreshSite(); return NextResponse.json({ ok: true });
    }
    if (b.action === 'savePlaybook') { // keep this launch's shape for next time, counted from its first key date
      const name = String(b.name || '').trim(); if (!name) return bad('Name the playbook');
      const em = (await planRows({ light: false })).map(r => r.values).filter(v => v.launch_id === l.id), anchor = Object.keys(l.dates)[0] || 'event', base = l.dates[anchor] || '';
      const diff = d => base ? Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(base + 'T12:00:00Z')) / 864e5) : 0;
      const steps = [...em.map(v => ({ type: 'email', step: v.step, anchor, days: diff(v.planned_date), time: v.planned_time_et || '09:00' })), ...l.steps.map(s => ({ type: s.type, step: s.step, anchor, days: diff(s.date), time: s.time || '' }))];
      await addPlaybook({ id: `PB-${Date.now().toString(36)}`, name, about: `Saved from ${l.name}`, anchors: [[anchor, 'Key date']], steps }, me); return NextResponse.json({ ok: true });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return bad('Someone changed this a moment ago. Reload and try again.', 409);
    console.error('Launch write failed', e.message); return bad('Couldn’t save that. Kit may be busy; try again in a minute.', 502);
  }
}
