import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail, canApproveSocial } from '@/lib/ops/nav';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { readPlain } from '@/lib/ops/store';
import { getBroadcast, createBroadcast, updateBroadcast, tagCount, kitConfigured } from '@/lib/kit';
import { planRows, addPlan, savePlan, revisionsOf, commentsOf, addComment, parse, STATUSES, hashOf } from '@/lib/ops/emailplan';
import { renderBlocks, filterOf, audienceText, etToIso, preSendChecks } from '@/lib/ops/emailrender';
import { syncPlan, kitHashOf } from '@/lib/ops/emailsync';
import { emailList, kitSnapshot, forgetKit, evId } from '@/lib/ops/emailkit';
import { saveLink } from '@/lib/ops/emaildata';
import { teacherFacts, listTeachers } from '@/lib/ops/templates/facts';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TEMPLATE = () => Number(process.env.PROMO_TEMPLATE_ID || process.env.SCAFFOLDING_TEMPLATE_ID || 5578308);
const FIELDS = ['subject', 'preview_text', 'planned_date', 'planned_time_et', 'owner', 'event_id', 'launch_id', 'step', 'type', 'note'];

const eventOf = async id => id ? (await loadCalendar()).find(e => evId(e) === String(id).toUpperCase()) : null;
async function teachersFor(blocks) {
  const out = {};
  for (const b of blocks.filter(x => x.type === 'teacher' && x.teacher)) { const t = await teacherFacts(b.teacher).catch(() => null); if (t?.data) out[String(b.teacher).toLowerCase()] = t.data; }
  return out;
}
const bodyOf = async v => { const blocks = parse(v.blocks_json, []), ev = await eventOf(v.event_id), teachers = await teachersFor(blocks); return { blocks, ev, html: renderBlocks(blocks, { ev, teachers }), preview: renderBlocks(blocks, { ev, teachers, forPreview: true }) }; };
const descOf = (v, ev) => `[${ev ? evId(ev) : 'no event'}] ${v.type || 'email'}${v.step ? ` · ${v.step}` : ''} · ${audienceText(parse(v.audience_json, {}))}${v.note ? ` · ${v.note}` : ''}`;

// Send the copy to Kit as a draft: creates it the first time, updates it after. Never touches send_at, so a scheduled email stays scheduled.
async function pushToKit(v, who) {
  const { html, ev } = await bodyOf(v);
  const fields = { subject: v.subject, preview_text: v.preview_text || '', content: html, description: descOf(v, ev), email_template_id: TEMPLATE(), subscriber_filter: filterOf(parse(v.audience_json, {})) };
  let b;
  if (v.kit_id) {
    const cur = await getBroadcast(v.kit_id).catch(() => null);
    if (!cur) throw Object.assign(new Error('Kit no longer has this email.'), { status: 409 });
    if (cur.published_at) throw Object.assign(new Error('This email has already been sent, so it can’t be changed.'), { status: 409 });
    if (v.kit_hash && kitHashOf(cur) !== v.kit_hash) throw Object.assign(new Error('Someone edited this email in Kit. Choose which version to keep first.'), { status: 409, conflict: true });
    b = await updateBroadcast(v.kit_id, fields);
  } else b = await createBroadcast({ ...fields, send_at: null });
  forgetKit();
  return savePlan(v._row, v, { kit_id: String(b.id), kit_hash: kitHashOf({ ...fields, ...b }), synced_ops_hash: v.ops_hash, conflict: '', last_synced: new Date().toISOString() }, who);
}

// GET ?what=calendar&from=&to=   ?what=plan   ?id=EM001   ?what=count&include=tag:1,tag:2
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const u = new URL(req.url), what = u.searchParams.get('what') || (u.searchParams.get('id') ? 'one' : 'plan'), fresh = u.searchParams.get('fresh') === '1';
  try {
    if (what === 'count') { // how many people a tag-based audience reaches
      const inc = (u.searchParams.get('include') || '').split(',').filter(x => x.startsWith('tag:')).map(x => Number(x.slice(4)));
      const segs = (u.searchParams.get('include') || '').split(',').some(x => x.startsWith('segment:')), exc = !!u.searchParams.get('exclude');
      if (!kitConfigured()) return NextResponse.json({ n: null, note: 'Kit isn’t connected' });
      if (!inc.length) return NextResponse.json({ n: null, note: 'Kit counts everyone when it sends' });
      const ns = await Promise.all(inc.map(tagCount).map(p => p.catch(() => NaN)));
      if (ns.some(Number.isNaN)) return NextResponse.json({ n: null, note: 'Kit couldn’t count this just now' });
      return NextResponse.json({ n: ns.reduce((a, b) => a + b, 0), exact: inc.length === 1 && !segs && !exc, note: inc.length > 1 || segs || exc ? 'Up to this many: people in more than one group, or excluded, are counted by Kit when it sends' : '' });
    }
    if (what === 'meta') { // what the editor's pickers need for a brand-new email
      const [snap, cal, teachers] = await Promise.all([kitSnapshot(), loadCalendar(), listTeachers().catch(() => [])]);
      return NextResponse.json({ kit: { tags: Object.entries(snap.tags).map(([id, name]) => ({ id, name })), segments: Object.entries(snap.segments).map(([id, name]) => ({ id, name })) }, teachers,
        events: cal.filter(e => e.date >= addDays(todayET(), -14) && !/cancel/i.test(e.status)).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ id: evId(e), title: e.title, date: e.date, program: e.track })), canEdit: canEditEmail(user) });
    }
    const sync = await syncPlan({ fresh: fresh || what === 'one' }); // an open editor always reads Kit and the plan afresh
    const rows = sync.rows;
    if (what === 'plan') return NextResponse.json({ plan: rows, at: sync.at, error: sync.error, canEdit: canEditEmail(user), statuses: STATUSES });
    if (what === 'one') {
      const v = rows.find(r => r.id === u.searchParams.get('id')); if (!v) return NextResponse.json({ error: 'No such email' }, { status: 404 });
      const raw = (await planRows({ light: false })).find(r => r.values.id === v.id); v._row = raw.row;
      const { blocks, ev, html, preview } = await bodyOf(v);
      const [rev, com, snap, cal, teachers, list] = await Promise.all([revisionsOf(v.id), commentsOf(v.id), kitSnapshot(), loadCalendar(), listTeachers().catch(() => []), emailList()]);
      const others = rows.filter(r => r.planned_date).map(r => ({ id: r.id, date: r.planned_date, audience: audienceText(parse(r.audience_json, {})) })).concat(list.emails.filter(x => x.state === 'scheduled' && !rows.some(r => r.kit_id === x.kit_id)).map(x => ({ id: 'kit' + x.kit_id, date: x.date, audience: x.audience })));
      const checks = preSendChecks({ plan: v, blocks, ev, others, today: todayET() });
      const kitNow = v.kit_id ? await getBroadcast(v.kit_id).catch(() => null) : null;
      return NextResponse.json({ plan: v, blocks, audience: parse(v.audience_json, { include: [], exclude: [] }), html, preview, checks, revisions: rev, comments: com, teachers,
        event: ev && { id: evId(ev), title: ev.title, date: ev.date, time: ev.time, program: ev.track }, kitUrl: v.kit_id ? `https://app.kit.com/campaigns/${v.kit_id}/draft` : '',
        kit: { tags: Object.entries(snap.tags).map(([id, name]) => ({ id, name })), segments: Object.entries(snap.segments).map(([id, name]) => ({ id, name })) },
        kitContent: v.conflict === 'kit' || v.conflict === 'both' ? { subject: kitNow?.subject || '', preview_text: kitNow?.preview_text || '', content: kitNow?.content || '' } : null,
        events: cal.filter(e => e.date >= addDays(todayET(), -14) && !/cancel/i.test(e.status)).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ id: evId(e), title: e.title, date: e.date, program: e.track })),
        canEdit: canEditEmail(user), canSchedule: canApproveSocial(user) || canEditEmail(user) });
    }
    if (what === 'calendar') {
      const from = u.searchParams.get('from'), to = u.searchParams.get('to'); if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
      const [list, cal, social] = await Promise.all([emailList(), loadCalendar(), readPlain('Weekly Plan', { sheet: 'social', light: true }).catch(() => ({ rows: [] }))]);
      const inPlan = new Set(rows.filter(r => r.kit_id).map(r => r.kit_id)), evs = Object.fromEntries(cal.map(e => [evId(e), e]));
      const items = [
        ...rows.filter(r => r.status !== 'Not needed').map(r => ({ key: r.id, id: r.id, kind: 'plan', title: r.subject || `${r.type || 'Email'} (no subject yet)`, date: r.planned_date, status: r.status, program: evs[String(r.event_id).toUpperCase()]?.track || '', event_id: r.event_id, kit_id: r.kit_id, conflict: r.conflict, audience: audienceText(parse(r.audience_json, {})) })),
        ...list.emails.filter(x => !x.archived && !inPlan.has(x.kit_id)).map(x => ({ key: 'k' + x.kit_id, id: '', kind: x.mm ? 'auto' : 'kit', title: x.subject, date: x.date, status: x.state === 'sent' ? 'Sent' : x.state === 'scheduled' ? 'Scheduled' : 'Draft', program: x.program, event_id: x.event_id, kit_id: x.kit_id, audience: x.audience })),
      ];
      const dated = items.filter(i => i.date && i.date >= from && i.date <= to), tray = items.filter(i => !i.date && i.status !== 'Sent');
      const warnings = [], byDay = {};
      for (const i of dated.filter(i => i.kind !== 'auto')) { const k = `${i.date}|${i.audience}`; (byDay[k] ||= []).push(i); }
      for (const [k, xs] of Object.entries(byDay)) if (xs.length > 1) warnings.push({ date: k.split('|')[0], text: `${xs.length} emails go to ${xs[0].audience} on the same day` });
      for (const i of dated) { const e = evs[String(i.event_id).toUpperCase()]; if (e && i.date > e.date && i.kind !== 'auto') warnings.push({ date: i.date, text: `“${i.title}” is dated after its event (${e.date})` }); }
      const today = todayET();
      for (const e of cal) if (e.date >= today && e.date <= addDays(today, 14) && e.date >= from && e.date <= to && ['LRL', 'CHIT', 'EVENT', 'LAUNCH', 'WSML'].includes(String(e.track).toUpperCase()) && !/cancel/i.test(e.status) && !items.some(i => String(i.event_id).toUpperCase() === evId(e) && i.status !== 'Sent' || String(i.event_id).toUpperCase() === evId(e) && i.date >= addDays(e.date, -14))) warnings.push({ date: e.date, text: `Nothing planned yet for ${e.title}` });
      return NextResponse.json({ items: dated, tray, warnings, at: sync.at, error: sync.error, canEdit: canEditEmail(user),
        events: cal.filter(e => e.date >= from && e.date <= to && !/cancel/i.test(e.status)).map(e => ({ id: evId(e), title: e.title, date: e.date, program: e.track })),
        social: social.rows.map(r => r.values).filter(p => p.publish_date >= from && p.publish_date <= to && p.status !== 'Deleted').map(p => ({ id: p.post_id, date: p.publish_date, time: p.publish_time_ET, caption: String(p.caption || '').slice(0, 60), status: p.status })) });
    }
    return NextResponse.json({ error: 'Unknown request' }, { status: 400 });
  } catch (e) { console.error('Email plan read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the email plan' }, { status: 502 }); }
}

// POST { action: create | save | push | ready | schedule | reschedule | resolve | comment | notNeeded | adopt, ... }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email;
  const bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
  const need = async () => { const r = (await planRows({ light: false })).find(x => x.values.id === b.id); return r && { ...r.values, _row: r.row }; };
  try {
    if (b.action === 'create') {
      const v = {}; for (const k of FIELDS) if (b[k] !== undefined) v[k] = String(b[k]).slice(0, 300);
      v.blocks_json = JSON.stringify(Array.isArray(b.blocks) ? b.blocks : [{ type: 'text', text: '' }]); v.audience_json = JSON.stringify(b.audience || { include: [], exclude: [] }); v.type ||= 'Promo'; v.status = 'Draft';
      const r = await addPlan(v, me); refreshSite(); return NextResponse.json({ ok: true, id: r.id });
    }
    if (b.action === 'preview') { // draws the email for the editor; writes nothing
      const blocks = Array.isArray(b.blocks) ? b.blocks : [], ev = await eventOf(b.event_id), teachers = await teachersFor(blocks);
      return NextResponse.json({ html: renderBlocks(blocks, { ev, teachers, forPreview: true }) });
    }
    if (b.action === 'adopt') { // take a Kit email into the plan so it can be edited and moved here
      const x = (await emailList()).emails.find(e => e.kit_id === String(b.kit_id)); if (!x) return bad('Kit doesn’t have that email', 404);
      if ((await planRows({ light: false })).some(r => r.values.kit_id === x.kit_id)) return bad('This email is already in the plan');
      const cur = await getBroadcast(x.kit_id).catch(() => null); if (!cur) return bad('Kit doesn’t have that email', 404);
      const r = await addPlan({ event_id: x.event_id, type: x.kind === 'reminder' ? 'Reminder' : 'Promo', planned_date: x.date, planned_time_et: x.when ? new Date(x.when).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '',
        status: x.state === 'sent' ? 'Sent' : x.state === 'scheduled' ? 'Scheduled' : 'Draft', kit_id: x.kit_id, subject: cur.subject || '', preview_text: cur.preview_text || '', blocks_json: JSON.stringify([{ type: 'html', html: cur.content || '' }]), audience_json: JSON.stringify({ include: [], exclude: [] }), kit_hash: kitHashOf(cur) }, me);
      const fresh = (await planRows({ light: false })).find(rr => rr.values.id === r.id); if (fresh) await savePlan(fresh.row, fresh.values, { synced_ops_hash: fresh.values.ops_hash }, me);
      refreshSite(); return NextResponse.json({ ok: true, id: r.id });
    }
    const v = await need(); if (!v) return bad('No such email', 404);
    if (b.action === 'save') {
      if (['Sent'].includes(v.status)) return bad('This email has been sent, so it can’t be changed.', 409);
      const ch = {}; for (const k of FIELDS) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 300);
      if (b.changes?.blocks) ch.blocks_json = JSON.stringify(b.changes.blocks); if (b.changes?.audience) ch.audience_json = JSON.stringify(b.changes.audience);
      let next = await savePlan(v._row, v, ch, me); next._row = v._row;
      let pushed = false;
      if (b.pushToKit) { next = await pushToKit(next, me); pushed = true; }
      refreshSite(); return NextResponse.json({ ok: true, pushed });
    }
    if (b.action === 'push') { const n = await pushToKit(v, me); refreshSite(); return NextResponse.json({ ok: true, kit_id: n.kit_id }); }
    if (b.action === 'ready') { await savePlan(v._row, v, { status: 'Ready for Jake' }, me); refreshSite(); return NextResponse.json({ ok: true }); }
    if (b.action === 'comment') { if (!String(b.text || '').trim()) return bad('Write a comment first'); await addComment(v.id, b.text, me); refreshSite(); return NextResponse.json({ ok: true }); }
    if (b.action === 'resolve') {
      if (b.choose === 'ops') { await pushToKit({ ...v, kit_hash: '' }, me); refreshSite(); return NextResponse.json({ ok: true }); }
      if (b.choose === 'kit') {
        const cur = await getBroadcast(v.kit_id).catch(() => null); if (!cur) return bad('Kit no longer has this email', 404);
        const n = await savePlan(v._row, v, { subject: cur.subject || v.subject, preview_text: cur.preview_text || '', blocks_json: JSON.stringify([{ type: 'html', html: cur.content || '' }]) }, me);
        await savePlan(v._row, n, { kit_hash: kitHashOf(cur), synced_ops_hash: n.ops_hash, conflict: '' }, me); refreshSite(); return NextResponse.json({ ok: true });
      }
      return bad('Choose the Ops version or the Kit version');
    }
    if (b.action === 'reschedule') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return bad('Pick a date');
      if (v.status === 'Sent') return bad('This email has been sent.', 409);
      if (v.status === 'Scheduled') {
        if (!b.confirm) return bad('This email is already scheduled in Kit. Please confirm the new date.');
        const iso = etToIso(b.date, v.planned_time_et || '09:00'); if (!iso) return bad('Needs a send time');
        await updateBroadcast(v.kit_id, { send_at: iso }); forgetKit();
      }
      await savePlan(v._row, v, { planned_date: b.date }, me); refreshSite(); return NextResponse.json({ ok: true, wasScheduled: v.status === 'Scheduled' });
    }
    if (b.action === 'schedule') {
      if (!b.confirm) return bad('Please confirm first');
      if (['Scheduled', 'Sent'].includes(v.status)) return bad('This email is already scheduled or sent.', 409);
      if (!v.planned_time_et) return bad('Choose a send time first');
      const { blocks, ev } = await bodyOf(v), rows = (await syncPlan()).rows, list = await emailList();
      const others = rows.filter(r => r.planned_date && r.id !== v.id).map(r => ({ id: r.id, date: r.planned_date, audience: audienceText(parse(r.audience_json, {})) })).concat(list.emails.filter(x => x.state === 'scheduled' && !rows.some(r => r.kit_id === x.kit_id)).map(x => ({ id: 'kit' + x.kit_id, date: x.date, audience: x.audience })));
      const checks = preSendChecks({ plan: v, blocks, ev, others, today: todayET() });
      const note = String(b.override_note || '').trim();
      if ((checks.length || v.status !== 'Ready for Jake') && !note) return bad(checks.length ? 'Some checks didn’t pass. Fix them, or schedule anyway with a note.' : 'This hasn’t been marked ready for Jake. Schedule anyway with a note.', 400, { checks, needNote: true });
      const n = await pushToKit(v, me);
      const iso = etToIso(v.planned_date, v.planned_time_et); if (!iso) return bad('The send date or time isn’t valid');
      await updateBroadcast(n.kit_id, { send_at: iso }); forgetKit();
      await savePlan(v._row, n, { status: 'Scheduled', note: note ? `Scheduled anyway: ${note}`.slice(0, 300) : n.note }, me);
      if (note) await addComment(v.id, `Scheduled anyway${checks.length ? ` (${checks.map(c => c.key).join(', ')})` : ''}: ${note}`, me);
      refreshSite(); return NextResponse.json({ ok: true, send_at: iso });
    }
    if (b.action === 'notNeeded') {
      if (!b.confirm) return bad('Please confirm first');
      if (['Scheduled', 'Sent'].includes(v.status)) return bad('Unschedule it in Kit first. A sent or scheduled email can’t be marked not needed here.', 409);
      await savePlan(v._row, v, { status: 'Not needed' }, me); if (v.kit_id) await saveLink(v.kit_id, { archived: 'TRUE', note: 'Not needed' }, me); forgetKit();
      refreshSite(); return NextResponse.json({ ok: true });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return NextResponse.json({ error: 'Someone changed this a moment ago. Reload and try again.' }, { status: 409 });
    if (e?.status) return NextResponse.json({ error: e.message, conflict: !!e.conflict }, { status: e.status });
    console.error('Email plan write failed', e.message); return NextResponse.json({ error: 'Couldn’t save that. Kit may be busy; try again in a minute.' }, { status: 502 });
  }
}
