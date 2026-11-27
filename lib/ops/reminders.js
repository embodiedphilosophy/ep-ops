// Reminder rules (Teachers & Email, phase 3). Each rule says which sessions it covers, when its email goes out relative
// to the session, who gets it and what it says. A daily job (and the "Create now" button) turns every upcoming session into a
// Kit email, recorded in the Email Plan so the calendar and the Emails list show it. Rules start OFF.
//   • Kit stays the sender. The job makes a DRAFT, or schedules it only when the rule's "Schedule automatically" is on.
//   • Teacher reminders and Meditation Mondays are not rules here: see BUILT_IN.
import { readPlain, updatePlain, createTab, ensureColumns } from './store';
import { loadCalendar } from '../calendar';
import { todayET } from '../events';
import { minutesOf } from './templates/facts';
import { etToIso, renderBlocks, filterOf, audienceText } from './emailrender';
import { createBroadcast } from '../kit';
import { planRows, addPlan, opsHash } from './emailplan';
import { kitHashOf } from './emailsync';
import { evId } from './emailkit';

export const RULE_COLS = ['id', 'name', 'tracks', 'title_match', 'sends', 'audience_json', 'subject', 'body', 'button_label', 'enabled', 'auto_schedule', 'last_run', 'last_result', 'updated_by', 'updated_at'];
const BODY = 'Hello,\n\n{title} is on {day} at {time}.\n\nWe will see you there.';
// Defaults for the rules in the handoff; tracks and words are editable on the page. All off until someone picks an audience and switches them on.
export const SEED = [
  { id: 'R001', name: 'Sādhana School weekly session', tracks: 'SS', title_match: '', sends: '60m' },
  { id: 'R002', name: 'Wisdom School pathway session', tracks: 'WS,WSQ', title_match: '', sends: '60m' },
  { id: 'R003', name: 'Wisdom School Monthly Lecture', tracks: 'WSML', title_match: '', sends: 'd0@08:00,30m' },
  { id: 'R004', name: 'Open Session and Practicum', tracks: '', title_match: 'open session|practicum', sends: 'd-1@09:00,60m' },
  { id: 'R005', name: 'SLBT mentees', tracks: '', title_match: 'slbt', sends: '60m' },
].map(r => ({ ...r, audience_json: JSON.stringify({ include: [], exclude: [] }), subject: '{title}: {day} at {time}', body: BODY, button_label: 'Join on Zoom', enabled: '', auto_schedule: '' }));
// Things people ask about that are deliberately not rules here
export const BUILT_IN = [
  { key: 'mm', name: 'Meditation Mondays: “We begin in one hour”', how: 'Made automatically each Monday morning by the website and scheduled in Kit for one hour before the session, to Meditation Pass, Wisdom School and Wisdom School Plus members, with the Zoom link, the Circle link and the replays link. No session that Monday (cancelled or a holiday) means no email. Once it is made it shows under that Monday on This week, with a link to it in Kit, where you can change that week’s email. The wording for every week is set in the website. Ops flags a hand-made “today at 12pm ET” email as a duplicate.' },
  { key: 'teachers', name: 'Teacher reminders: a week before, the day before, the day of', how: 'The daily job sends these, only to the addresses typed in that session’s Teacher/Host Emails column. Nobody else.' },
];

let ready = false;
export async function ruleRows({ light = true } = {}) {
  let t = await readPlain('Reminder Rules', { light: light && ready }).catch(() => null);
  if (!t) { await createTab('Reminder Rules', RULE_COLS, SEED); t = await readPlain('Reminder Rules'); }
  if (!ready) { await ensureColumns('Reminder Rules', RULE_COLS).catch(() => {}); ready = true; }
  return t.rows;
}
const yes = v => String(v).trim().toUpperCase() === 'TRUE';
export const ruleOf = r => ({ ...r.values, _row: r.row, enabled: yes(r.values.enabled), auto_schedule: yes(r.values.auto_schedule) });

// "60m" = 60 minutes before the session. "d0@08:00" = the day of, at 8:00 ET. "d-1@09:00" = the day before, at 9:00 ET.
export function parseSends(text) {
  const out = [], bad = [];
  for (const raw of String(text || '').split(',').map(s => s.trim()).filter(Boolean)) {
    let m;
    if ((m = raw.match(/^(\d{1,4})m$/i)) && +m[1] > 0) out.push({ token: raw, type: 'before', minutes: +m[1] });
    else if ((m = raw.match(/^d(-?\d{1,2})@(\d{1,2}):(\d{2})$/i)) && +m[2] < 24 && +m[3] < 60) out.push({ token: raw, type: 'day', days: +m[1], at: `${m[2].padStart(2, '0')}:${m[3]}` });
    else bad.push(raw);
  }
  return { sends: out, bad };
}
export function sendsText(text) {
  return parseSends(text).sends.map(s => s.type === 'before' ? (s.minutes % 60 === 0 ? `${s.minutes / 60} hour${s.minutes === 60 ? '' : 's'}` : `${s.minutes} minutes`) + ' before'
    : `${s.days === 0 ? 'The day of' : s.days === -1 ? 'The day before' : `${-s.days} days before`}, ${s.at} ET`).join(' · ');
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const hhmm = mins => `${String(mins / 60 | 0).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const etDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const etTime = iso => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Does this rule cover this session?
export function covers(rule, ev) {
  const tracks = String(rule.tracks || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const re = rule.title_match ? (() => { try { return new RegExp(rule.title_match, 'i'); } catch { return null; } })() : null;
  if (!tracks.length && !re) return false;
  const okTrack = !tracks.length || tracks.includes(String(ev.track).toUpperCase());
  const okTitle = !re || re.test([ev.title, ev.internal_title, ev.program, ev.series].join(' '));
  return okTrack && okTitle;
}
// When each of the rule's emails goes out for one session → [{ token, iso }] (iso is the UTC instant)
export function sendTimes(rule, ev) {
  const start = minutesOf(ev.time); if (start == null) return { error: 'start time' };
  const { sends } = parseSends(rule.sends);
  return { times: sends.map(s => ({ token: s.token, iso: s.type === 'before' ? new Date(Date.parse(etToIso(ev.date, hhmm(start))) - s.minutes * 60000).toISOString() : etToIso(addDays(ev.date, s.days), s.at) })) };
}
const fill = (t, ev, zoom) => String(t || '').replace(/\{title\}/g, ev.title).replace(/\{teacher\}/g, ev.teachers || ev.host || '').replace(/\{zoom\}/g, zoom)
  .replace(/\{day\}/g, new Date(ev.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })).replace(/\{time\}/g, `${hhmm(minutesOf(ev.time))} ET`);
const zoomOf = ev => ev.zoom_link || ev.zoom_registration || '';

// What the rules would do for the next `days` days, and (unless dry) do it.
//   → [{ rule, event, key, send_at, state: 'new' | 'made' | 'exists' | 'skip', why? }]
export async function runReminders({ dry = true, days = 14, ruleId = '', now = Date.now() } = {}) {
  const [rules, cal, plan] = await Promise.all([ruleRows({ light: dry }), loadCalendar(), planRows({ light: dry }).catch(() => [])]);
  const today = todayET(), until = addDays(today, days), have = new Set(plan.map(r => r.values.launch_id).filter(Boolean));
  const items = [];
  for (const r of rules.map(ruleOf).filter(x => (ruleId ? x.id === ruleId : true))) {
    const events = cal.filter(e => e.date >= today && e.date <= until && !/cancel/i.test(e.status) && covers(r, e));
    for (const ev of events) {
      const t = sendTimes(r, ev), id = evId(ev);
      if (t.error) { items.push({ rule: r, event: { id, title: ev.title, date: ev.date }, state: 'skip', why: `The Master Schedule has no ${t.error}.` }); continue; }
      t.times.forEach((st, i) => {
        const key = `${r.id}:${id}:${st.token}`;
        const it = { rule: r, event: { id, title: ev.title, date: ev.date, time: ev.time }, key, send_at: st.iso, token: st.token, _ev: ev };
        if (Date.parse(st.iso) <= now) return; // already past: nothing to show or make
        if (have.has(key)) it.state = 'exists';
        else if (!zoomOf(ev)) { it.state = 'skip'; it.why = 'The Master Schedule has no Zoom link for it yet.'; }
        else if (!JSON.parse(r.audience_json || '{}').include?.length) { it.state = 'skip'; it.why = 'The rule has no audience yet.'; }
        else it.state = 'new';
        items.push(it);
      });
    }
  }
  if (dry) return items.map(({ _ev, ...x }) => x);
  const made = [];
  for (const it of items.filter(x => x.state === 'new' && x.rule.enabled)) {
    try {
      const ev = it._ev, r = it.rule, zoom = zoomOf(ev);
      const blocks = [{ type: 'text', text: fill(r.body, ev, zoom) }, { type: 'button', label: r.button_label || 'Join on Zoom', url: zoom }];
      const subject = fill(r.subject, ev, zoom), aud = JSON.parse(r.audience_json || '{}');
      const fields = { subject, preview_text: '', content: renderBlocks(blocks, { ev }), description: `[${it.event.id}] Reminder · ${r.name} · ${audienceText(aud)} · ${it.token}`,
        email_template_id: Number(process.env.PROMO_TEMPLATE_ID || process.env.SCAFFOLDING_TEMPLATE_ID || 5578308), subscriber_filter: filterOf(aud) };
      const b = await createBroadcast({ ...fields, send_at: r.auto_schedule ? it.send_at : null });
      const v = { subject, preview_text: '', blocks_json: JSON.stringify(blocks) };
      await addPlan({ event_id: it.event.id, launch_id: it.key, step: r.name, type: 'Reminder', planned_date: etDay(it.send_at), planned_time_et: etTime(it.send_at), owner: 'Reminder rule', status: r.auto_schedule ? 'Scheduled' : 'Draft',
        kit_id: String(b.id), subject, preview_text: '', blocks_json: v.blocks_json, audience_json: r.audience_json, kit_hash: kitHashOf({ ...fields, ...b }), synced_ops_hash: opsHash(v), note: `Made by reminder rule ${r.id}` }, 'Reminder rule');
      it.state = 'made'; made.push(it);
    } catch (e) { console.error('Reminder not made', it.key, e.message); it.state = 'skip'; it.why = 'Kit would not take it just now.'; }
  }
  // remember when each rule last ran and what it did
  const when = new Date().toISOString();
  for (const r of rules.map(ruleOf).filter(x => x.enabled && (ruleId ? x.id === ruleId : true))) {
    const mine = items.filter(i => i.rule.id === r.id), n = mine.filter(i => i.state === 'made').length;
    await updatePlain('Reminder Rules', r._row, { last_run: when, last_result: `${n} made, ${mine.filter(i => i.state === 'skip').length} skipped, ${mine.filter(i => i.state === 'exists').length} already there` }, { who: 'Reminder rule' }).catch(() => {});
  }
  return items.map(({ _ev, ...x }) => x);
}
