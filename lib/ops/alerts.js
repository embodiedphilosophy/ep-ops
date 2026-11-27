// The alert channel (Ads safety net; general, so other parts of Ops can use it later, e.g. a cron that fails). One place that decides WHO is told, HOW, and HOW OFTEN.
//
// Three levels:
//   URGENT     email + text message + WhatsApp. Sent at any hour. Repeats (default every 60 minutes, at most 6 repeats in 24 hours) until someone presses Acknowledge or the
//              problem clears.
//   IMPORTANT  email + WhatsApp. Never at night: while a person is in their quiet hours (default 22:00 to 07:00 their time) it waits and goes at the first check after that.
//              A reminder once a day while it lasts and nobody has acknowledged it.
//   ROUTINE    email only, and not as its own message: it goes in the daily ad digest.
// The same problem does not ping again inside its gap unless it got materially worse (25% or more) or its level went up. When the check returns to normal the alert
// resolves, and ONE "resolved" note goes out (at IMPORTANT level). Acknowledge = snooze for N hours: who and when are recorded; a snoozed alert stays quiet until the
// snooze ends or it gets materially worse. Nothing is acknowledged by replying to a message (two-way replies are a later piece).
//
// Every channel can fail on its own without stopping the others; each attempt (sent, skipped and why, failed and why) is written on the alert in the log, and a failure is
// shown on the Safety page. People: directors and the Ads role, by email at every level; text and WhatsApp only for a person who has a number set (by a director, in
// Settings) and the levels chosen. Phone numbers are personal data: kept only in the ads_settings table, never logged, never in the Change Log, never shown except to the
// person they belong to (everyone else sees the last four digits).
import { peekRows, createRow, updateRow } from './adsstore.js';
import { sendEmail as realSendEmail, layout, button, esc } from './email.js';
import { sendMessage as realSendMessage, smsReady, whatsappReady, normalizePhone, isE164, maskPhone, scrub } from './twilio.js';
import { adsRecipients } from './adsdigest.js';

export const LEVELS = ['urgent', 'important', 'routine'];
export const LEVEL_WORD = { urgent: 'URGENT', important: 'Important', routine: 'For your information', test: 'TEST' };
const RANK = { routine: 0, important: 1, urgent: 2 };
const ROUTE = { urgent: ['sms', 'whatsapp', 'email'], important: ['whatsapp', 'email'], routine: [] };
const DAY = 86400e3, HOUR = 3600e3;

// ---- Settings (kept in the ads_settings table: a director edits them in Settings; every change goes on the Change Log)
// field → [label, help, lowest, highest, kind]. kind: dollars (stored as cents), whole, number, time, zone
export const CONFIG_FIELDS = {
  daily_ceiling_cents: ['Daily spending ceiling (dollars)', 'The most you are willing to spend on ads in one day, across the whole ad account. Leave empty until you decide: the spending check stays off until both ceilings are set.', 0, 10_000_000, 'dollars'],
  monthly_ceiling_cents: ['Monthly spending ceiling (dollars)', 'The most you are willing to spend in a calendar month. You hear about it when the month is on course to pass it.', 0, 100_000_000, 'dollars'],
  target_roas: ['Return to aim for (times the money spent)', 'At least 1.5 means $1.50 back for every $1 spent. Shown beside the numbers; it never changes anything by itself.', 0.5, 20, 'number'],
  floor_roas: ['Lowest return before you hear about it (times)', 'A campaign whose return stays under this over the last 3 full days, after it has spent the minimum below, is flagged.', 0.1, 20, 'number'],
  floor_min_cents: ['Spend before the return counts (dollars)', 'A campaign has to have spent at least this over those 3 days before its return is judged.', 0, 1_000_000, 'dollars'],
  zero_days: ['Days with no purchases or sign-ups', 'A campaign that has spent money on this many full days and brought nothing is flagged.', 1, 7, 'whole'],
  zero_min_cents: ['Spend with no purchases or sign-ups (dollars)', 'Only when it has spent at least this much in those days.', 0, 1_000_000, 'dollars'],
  urgent_multiple: ['Make it urgent at this many times the minimum', 'If a campaign has spent this many times the minimum above (for the return check and the no-results check), it is URGENT instead of just important. Starting value 3.', 1, 100, 'number'],
  spike_multiple: ['Spend spike: times the usual day', 'Today’s spend, worked out for the whole day, this many times the average of the last 7 days is URGENT.', 1.1, 20, 'number'],
  spike_min_cents: ['Spend spike: ignore under (dollars)', 'A day with less spent so far than this is never called a spike.', 0, 1_000_000, 'dollars'],
  heartbeat_hours: ['Hours of silence before the safety net warns that it can’t see', 'If the hourly check has not completed a read of your ad account for this long, you hear about it.', 2, 48, 'whole'],
  repeat_gap_min: ['Urgent alerts repeat every (minutes)', 'Until someone presses Acknowledge or the problem clears.', 15, 1440, 'whole'],
  max_repeats_day: ['Most repeats of one urgent alert in 24 hours', 'So a problem nobody can fix at 3 a.m. does not fill a phone.', 0, 24, 'whole'],
  important_gap_hours: ['Important alerts remind you every (hours)', 'A reminder while it lasts and nobody has acknowledged it.', 1, 168, 'whole'],
  worsen_pct: ['Send again at once if it gets this much worse (%)', 'Inside the repeat gap, a problem that grew by this much is sent again straight away.', 5, 500, 'whole'],
  quiet_start: ['Quiet hours start', 'Important alerts wait until quiet hours end. Urgent ones never wait. Times are the person’s own clock.', 0, 0, 'time'],
  quiet_end: ['Quiet hours end', '', 0, 0, 'time'],
  default_tz: ['Time zone for quiet hours when a person has none', 'A name like America/New_York. Anyone can have their own in the recipients list below.', 0, 0, 'zone'],
};
export const DEFAULT_CONFIG = {
  daily_ceiling_cents: 0, monthly_ceiling_cents: 0, target_roas: 1.5, floor_roas: 1.2, floor_min_cents: 5000, zero_days: 3, zero_min_cents: 5000, urgent_multiple: 3,
  spike_multiple: 2, spike_min_cents: 2000, heartbeat_hours: 3, repeat_gap_min: 60, max_repeats_day: 6, important_gap_hours: 24, worsen_pct: 25,
  quiet_start: '22:00', quiet_end: '07:00', default_tz: 'America/New_York',
};
const CONFIG_KEY = 'alerts_config', PEOPLE_KEY = 'alerts_recipients';

async function readSetting(key, dflt) { try { const r = (await peekRows('settings', { key }, { limit: 1 }))[0]; return r ? r.value : dflt; } catch { return dflt; } }
export async function writeSetting(key, value, who) {
  const r = (await peekRows('settings', { key }, { limit: 1 }))[0];
  if (r) await updateRow('settings', r.id, { value, updated_by: who }); else await createRow('settings', { key, value, updated_by: who });
}
export const readSettingValue = readSetting;
export const getConfig = async () => ({ ...DEFAULT_CONFIG, ...(await readSetting(CONFIG_KEY, {})) });
export const ceilingsSet = cfg => cfg.daily_ceiling_cents > 0 && cfg.monthly_ceiling_cents > 0;

const validZone = z => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; } };
const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const dollars = c => (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
// values arrive as the person typed them (dollars as dollars); every changed one goes on the Change Log
export async function saveConfig(values, who, log = async () => {}) {
  const have = await getConfig(), next = { ...have };
  for (const [k, v] of Object.entries(values || {})) {
    const f = CONFIG_FIELDS[k]; if (!f) continue;
    const [label, , lo, hi, kind] = f, user = m => Object.assign(new Error(m), { user: true });
    if (kind === 'time') { if (hm(v) == null) throw user(`“${label}” needs a time like 22:00.`); next[k] = String(v).trim().padStart(5, '0'); continue; }
    if (kind === 'zone') { if (!validZone(String(v || '').trim())) throw user(`“${label}” needs a time zone name like America/New_York.`); next[k] = String(v).trim(); continue; }
    if (kind === 'dollars' && (v === '' || v == null)) { if (k.endsWith('ceiling_cents')) { next[k] = 0; continue; } throw user(`“${label}” needs a number.`); }
    const n = kind === 'dollars' ? Math.round(Number(v) * 100) : kind === 'whole' ? Math.round(Number(v)) : Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw user(`“${label}” needs a number from ${kind === 'dollars' ? lo / 100 + ' to ' + hi / 100 : lo + ' to ' + hi}.`);
    next[k] = n;
  }
  const changed = Object.keys(DEFAULT_CONFIG).filter(k => next[k] !== have[k]);
  if (!changed.length) return { ...next, changed: [] };
  await writeSetting(CONFIG_KEY, next, who);
  const show = (k, v) => (CONFIG_FIELDS[k][4] === 'dollars' ? (v ? `$${dollars(v)}` : 'not set') : String(v));
  for (const k of changed) await log(who, 'Ads: safety net', 'Alert settings', CONFIG_FIELDS[k][0], show(k, have[k]), show(k, next[k]));
  return { ...next, changed };
}

// ---- People
// A person is one of the team on the ads list (directors and the Ads role). Their alert settings are kept by email in the ads_settings table.
export const CHANNEL_DEFAULTS = { sms: ['urgent'], whatsapp: ['urgent', 'important'] };
const CHANNEL_WORD = { sms: 'text messages', whatsapp: 'WhatsApp', email: 'email' };
export const loadPeopleSettings = () => readSetting(PEOPLE_KEY, {});

// → [{ email, name, tz, phone, email_on, sms: { on, levels }, whatsapp: { on, levels } }]
export function resolvePeople(team, settings = {}, cfg = DEFAULT_CONFIG) {
  const emails = new Set(adsRecipients(team));
  return (team || []).filter(m => emails.has(String(m.email || '').trim().toLowerCase())).map(m => {
    const email = m.email.trim().toLowerCase(), s = settings[email] || {}, phone = isE164(s.phone) ? s.phone : '';
    const ch = k => ({ on: s[k]?.on !== false, levels: (Array.isArray(s[k]?.levels) ? s[k].levels : CHANNEL_DEFAULTS[k]).filter(l => l === 'urgent' || l === 'important') });
    return { email, name: m.name || email, tz: (s.tz && validZone(s.tz) ? s.tz : '') || [m.timezone, m.time_zone, m.tz].find(z => z && validZone(String(z).trim())) || cfg.default_tz || 'America/New_York',
      phone, email_on: s.email_on !== false, sms: ch('sms'), whatsapp: ch('whatsapp') };
  });
}

// What a settings page may be shown: the person's own number only to that person; everyone else's as the last four digits
export function peopleView(people, viewerEmail) {
  return people.map(p => ({ email: p.email, name: p.name, tz: p.tz, is_me: p.email === String(viewerEmail || '').toLowerCase(), has_phone: !!p.phone, phone_masked: maskPhone(p.phone),
    phone: p.email === String(viewerEmail || '').toLowerCase() ? p.phone : undefined, email_on: p.email_on, sms: p.sms, whatsapp: p.whatsapp }));
}

// A director changes one person's alert settings. The Change Log says WHAT changed, never the number.
export async function saveRecipient(email, patch, who, team, log = async () => {}) {
  const cfg = await getConfig(), all = await loadPeopleSettings(), user = m => Object.assign(new Error(m), { user: true });
  const person = resolvePeople(team, all, cfg).find(p => p.email === String(email || '').trim().toLowerCase());
  if (!person) throw user('That person isn’t on the ads list (directors and the Ads role).');
  const cur = all[person.email] || {}, next = { ...cur }, notes = [];
  if ('phone' in patch) {
    const raw = String(patch.phone ?? '').trim();
    if (!raw) { if (person.phone) { delete next.phone; notes.push(['alert number', 'set', 'removed']); } }
    else {
      const n = normalizePhone(raw);
      if (!isE164(n)) throw user('Phone numbers need the country code, like +1 555 123 4567.');
      if (n !== person.phone) { next.phone = n; notes.push(['alert number', person.phone ? 'set' : 'not set', person.phone ? 'changed' : 'set']); }
    }
  }
  for (const ch of ['sms', 'whatsapp']) if (patch[ch]) {
    const levels = (patch[ch].levels || []).filter(l => l === 'urgent' || l === 'important'), on = patch[ch].on !== false;
    const was = person[ch], word = x => (x.on ? (x.levels.join(' and ') || 'no levels') : 'off');
    next[ch] = { on, levels };
    if (word(was) !== word(next[ch])) notes.push([`${CHANNEL_WORD[ch]} alerts`, word(was), word(next[ch])]);
  }
  if ('email_on' in patch && (patch.email_on !== false) !== person.email_on) { next.email_on = patch.email_on !== false; notes.push(['email alerts', person.email_on ? 'on' : 'off', next.email_on ? 'on' : 'off']); }
  if ('tz' in patch) {
    const z = String(patch.tz || '').trim();
    if (z && !validZone(z)) throw user('That time zone isn’t one I know. Try a name like America/New_York.');
    if (z !== (cur.tz || '')) { next.tz = z; notes.push(['time zone', cur.tz || 'the default', z || 'the default']); }
  }
  if (!notes.length) return { changed: [] };
  await writeSetting(PEOPLE_KEY, { ...all, [person.email]: next }, who);
  for (const [field, from, to] of notes) await log(who, 'Ads: safety net', `${person.name}’s alerts`, field, from, to);   // never the number itself
  return { changed: notes.map(n => n[0]) };
}

// ---- Quiet hours (each person's own clock)
export function localMinutes(now, tz) {
  let parts;
  try { parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)); }
  catch { parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)); }
  const g = t => +parts.find(p => p.type === t).value;
  return g('hour') * 60 + g('minute');
}
export function inQuiet(now, tz, start, end) {
  const a = hm(start), b = hm(end); if (a == null || b == null || a === b) return false;
  const n = localMinutes(now, tz); return a < b ? n >= a && n < b : n >= a || n < b;
}

// ---- Deciding whether to send (pure)
// row: the open alert already on file (or null); next: what this check says now. → { action, send } where send is the kind of message, or null
export function decideSend({ row, next, now, cfg }) {
  const t = new Date(now).getTime(), lvl = next.level;
  if (!row) return { action: lvl === 'routine' ? 'routine' : 'new', send: lvl === 'routine' ? null : 'alert' };
  if (lvl === 'routine') return { action: 'routine', send: null };
  if (RANK[lvl] > RANK[row.level]) return { action: 'escalated', send: 'escalated' };
  const worse = row.sent_measure > 0 && next.measure >= row.sent_measure * (1 + cfg.worsen_pct / 100);
  const snoozed = row.snooze_until && new Date(row.snooze_until).getTime() > t;
  if (worse) return { action: 'worse', send: 'worse' };
  if (snoozed) return { action: 'snoozed', send: null };
  const last = row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
  if (!last) return { action: 'new', send: 'alert' };
  if (lvl === 'urgent') {
    if (t - last < cfg.repeat_gap_min * 60e3) return { action: 'cooldown', send: null };
    const repeats = (row.sends || []).filter(s => s.kind === 'repeat' && t - new Date(s.at).getTime() < DAY).length;
    return repeats >= cfg.max_repeats_day ? { action: 'capped', send: null } : { action: 'repeat', send: 'repeat' };
  }
  return t - last >= cfg.important_gap_hours * HOUR ? { action: 'repeat', send: 'repeat' } : { action: 'cooldown', send: null };
}

// ---- What is said
const abs = (base, link) => (!link ? '' : /^https?:/.test(link) ? link : `${String(base || '').replace(/\/+$/, '')}${link}`);
const PREFIX = { repeat: 'Reminder: ', worse: 'It got worse: ', escalated: 'Now more serious: ', resolved: 'Resolved: ', test: 'TEST: ' };
function wording(row, kind, base, level) {
  const link = abs(base, row.link), safety = abs(base, '/ops/ads?view=safety');
  const tag = kind === 'test' ? 'TEST' : kind === 'resolved' ? 'Resolved' : LEVEL_WORD[level];
  const head = `${PREFIX[kind] || ''}${row.title}`;
  const text = kind === 'resolved' ? 'This has cleared up. Nothing more to do.' : row.body;
  return {
    subject: `${kind === 'test' ? '[TEST] ' : level === 'urgent' && kind !== 'resolved' ? '[URGENT] ' : ''}Ads: ${head}`.slice(0, 160),
    html: layout(head, `${kind === 'test' ? '<p style="background:#F4E3C4;padding:10px 12px"><b>This is a test.</b> Nothing is wrong. It only shows that this way of reaching you works.</p>' : ''}`
      + String(text).split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') + (link ? button(link, kind === 'resolved' ? 'Open the Safety net' : 'See it and decide') : '')
      + (kind === 'resolved' || kind === 'test' ? '' : `<p style="color:#6b6358;font-size:13px">If you’re dealing with it, press Acknowledge on the <a href="${esc(safety)}">Safety net page</a> and it will stop repeating for a while.</p>`)),
    sms: `EP ads ${tag}: ${kind === 'resolved' ? head : row.short || head} ${link}`.replace(/\s+/g, ' ').slice(0, 320).trim(),
    whatsapp: `*EP ads · ${tag}*\n${head}\n\n${text}${link ? `\n\n${link}` : ''}`.slice(0, 1200),
    headline: `${tag}: ${row.title}`.slice(0, 120), link,
  };
}

// ---- Sending to people
const defaultDeps = () => ({ sendEmail: realSendEmail, emailReady: () => !!process.env.RESEND_API_KEY, sendMessage: realSendMessage, smsReady, whatsappReady });
export const makeDeps = o => ({ ...defaultDeps(), ...(o || {}) });
const providerWord = ch => (ch === 'sms' ? 'Text messages not set up' : 'WhatsApp not set up');

// One person, every channel for this level, each on its own: a failure in one never stops the next. Returns the log lines (no numbers in them).
async function deliverTo(person, row, kind, level, ctx) {
  const out = [], at = new Date(ctx.now).toISOString(), say = wording(row, kind, ctx.base, level), test = kind === 'test';
  const route = test ? ['sms', 'whatsapp', 'email'] : ROUTE[level === 'test' ? 'urgent' : level] || [];
  const line = (channel, status, detail = '') => out.push({ at, kind, who: person.name, channel, status, detail });
  const failed = [];
  for (const ch of ['sms', 'whatsapp']) {
    if (!route.includes(ch)) continue;
    if (!person.phone) { if (test) line(ch, 'skipped', 'no number set'); continue; }
    const c = person[ch];
    if (!test && !c.on) { line(ch, 'skipped', `${CHANNEL_WORD[ch]} switched off for this person`); continue; }
    if (!test && !c.levels.includes(level)) { line(ch, 'skipped', `${CHANNEL_WORD[ch]} not chosen for ${level} alerts`); continue; }
    if (!(ch === 'sms' ? ctx.deps.smsReady() : ctx.deps.whatsappReady())) { line(ch, 'skipped', providerWord(ch)); continue; }
    try {
      const r = await ctx.deps.sendMessage({ channel: ch, to: person.phone, body: say[ch], headline: say.headline, link: say.link });
      if (r.ok) line(ch, 'sent'); else { line(ch, 'failed', scrub(r.error || 'it did not go')); failed.push(ch); }
    } catch (e) { line(ch, 'failed', 'it did not go (unexpected problem)'); failed.push(ch); }
  }
  if (route.includes('email')) {
    if (!test && !person.email_on) line('email', 'skipped', 'email switched off for this person');
    else if (!ctx.deps.emailReady()) line('email', 'skipped', 'Email isn’t set up (no mail key)');
    else {
      try {
        const note = failed.length ? `<p style="background:#F2D9D2;padding:10px 12px">We couldn’t reach you by ${failed.map(c => CHANNEL_WORD[c]).join(' or ')} just now, so you are getting this by email.</p>` : '';
        await ctx.deps.sendEmail({ to: person.email, subject: say.subject, html: note ? say.html.replace('<div style="font-family:Helvetica', `${note}<div style="font-family:Helvetica`) : say.html });
        line('email', 'sent');
      } catch { line('email', 'failed', 'the email did not go'); }
    }
  }
  return out;
}

// Who would hear it, for a preview (names and channels only)
export function planFor(people, level, kind, now, cfg, deps) {
  const test = kind === 'test', route = test ? ['sms', 'whatsapp', 'email'] : ROUTE[level] || [];
  return people.map(p => {
    const quiet = !test && level !== 'urgent' && inQuiet(now, p.tz, cfg.quiet_start, cfg.quiet_end);
    const ch = [];
    for (const c of ['sms', 'whatsapp']) if (route.includes(c) && p.phone) ch.push({ channel: c, will: quiet ? 'wait for quiet hours to end' : !p[c].on ? 'skipped: switched off' : !p[c].levels.includes(level) ? 'skipped: not chosen for this level' : !(c === 'sms' ? deps.smsReady() : deps.whatsappReady()) ? `skipped: ${providerWord(c)}` : 'send' });
    if (route.includes('email')) ch.push({ channel: 'email', will: quiet ? 'wait for quiet hours to end' : !p.email_on ? 'skipped: switched off' : !deps.emailReady() ? 'skipped: Email isn’t set up' : 'send' });
    return { who: p.name, channels: ch };
  });
}

const keep = list => list.slice(-80);   // a log line each for the last 80 attempts is plenty on one alert

// Send `kind` of this alert to everyone (quiet hours hold IMPORTANT and resolved notes for each person until their night is over). Updates the row.
async function sendOut(row, kind, level, ctx) {
  const lines = [], queued = [...(row.queued || [])], t = new Date(ctx.now).toISOString();
  for (const p of ctx.people) {
    if (kind !== 'test' && level !== 'urgent' && inQuiet(ctx.now, p.tz, ctx.cfg.quiet_start, ctx.cfg.quiet_end)) {
      queued.push({ email: p.email, kind }); lines.push({ at: t, kind, who: p.name, channel: 'all', status: 'queued', detail: `held until quiet hours end (${ctx.cfg.quiet_end})` }); continue;
    }
    lines.push(...await deliverTo(p, row, kind, level, ctx));
  }
  const anySent = lines.some(l => l.status === 'sent'), events = [...(row.events || [])];
  if (!anySent && !lines.some(l => l.status === 'queued') && kind !== 'resolved') events.push({ at: t, type: 'nobody_reached', by: '', note: 'No message could be sent to anyone for this one.' });
  return { lines, queued, events, anySent };
}

// ---- Raising, resolving, acknowledging
// a: { key, level, title, body, short, link, measure, numbers }. Returns what happened (and in a preview, what would).
export async function raiseAlert(a, ctx) {
  const level = a.level, cfg = ctx.cfg;
  const row = (await peekRows('alerts', { key: a.key, state: 'open' }, { limit: 1 }))[0] || null, d = decideSend({ row, next: a, now: ctx.now, cfg });
  const res = { key: a.key, level, title: a.title, action: d.action, send: d.send };
  if (ctx.preview) { if (d.send) res.would = planFor(ctx.people, level, d.send, ctx.now, cfg, ctx.deps); return res; }
  const at = new Date(ctx.now).toISOString(), fields = { level, title: a.title, body: a.body, short: a.short || '', link: a.link || '', measure: Number(a.measure) || 0, numbers: a.numbers || {} };
  let cur = row ? await updateRow('alerts', row.id, fields) : (level === 'routine' || d.send ? await createRow('alerts', { key: a.key, ...fields, state: 'open' }) : null);
  if (!cur || !d.send) return res;
  const sent = await sendOut(cur, d.send, level, ctx), events = [...sent.events];
  if (d.action === 'worse' || d.action === 'escalated') { if (cur.snooze_until) events.push({ at, type: d.action, by: '', note: 'It changed while snoozed, so it was sent again.' }); }
  cur = await updateRow('alerts', cur.id, { sends: keep([...(cur.sends || []), { at, kind: d.send }]), last_sent_at: at, sent_measure: fields.measure, deliveries: keep([...(cur.deliveries || []), ...sent.lines]),
    queued: sent.queued, events, ...(d.action === 'worse' || d.action === 'escalated' ? { snooze_until: null } : {}) });
  res.delivered = sent.lines.map(l => `${l.who}: ${l.channel} ${l.status}`);
  return res;
}

// Every open alert the checks did not say again, among the checks that really ran (scope), has cleared: close it and tell people once.
export async function resolveAlerts({ active, scope, ctx }) {
  const out = [], rows = (await peekRows('alerts', { state: 'open' }, { limit: 300 })).filter(r => r.level !== 'test' && scope(r.key) && !active.has(r.key));
  for (const r of rows) {
    out.push({ key: r.key, title: r.title, told: (r.sends || []).length > 0 });
    if (ctx.preview) continue;
    const at = new Date(ctx.now).toISOString(), told = (r.sends || []).length > 0 && r.level !== 'routine';
    let cur = await updateRow('alerts', r.id, { state: 'resolved', resolved_at: at, queued: [], events: [...(r.events || []), { at, type: 'resolved', by: '', note: 'The check is back to normal.' }] });
    if (!told) continue;
    const sent = await sendOut({ ...cur, queued: [] }, 'resolved', 'important', ctx);
    await updateRow('alerts', cur.id, { sends: keep([...(cur.sends || []), { at, kind: 'resolved' }]), deliveries: keep([...(cur.deliveries || []), ...sent.lines]), queued: sent.queued });
  }
  return out;
}

// Someone's night is over: send what was held for them
export async function flushQueued(ctx) {
  const out = [], rows = (await peekRows('alerts', {}, { limit: 300 })).filter(r => (r.queued || []).length);
  for (const r of rows) {
    const keepQ = [], lines = [];
    for (const item of r.queued) {
      const p = ctx.people.find(x => x.email === item.email);
      if (!p) continue;
      if (inQuiet(ctx.now, p.tz, ctx.cfg.quiet_start, ctx.cfg.quiet_end)) { keepQ.push(item); continue; }
      out.push({ key: r.key, who: p.name, kind: item.kind });
      if (!ctx.preview) lines.push(...await deliverTo(p, r, item.kind, item.kind === 'resolved' ? 'important' : r.level, ctx));
    }
    if (!ctx.preview && (lines.length || keepQ.length !== r.queued.length)) await updateRow('alerts', r.id, { queued: keepQ, deliveries: keep([...(r.deliveries || []), ...lines]) });
  }
  return out;
}

// Acknowledge = snooze for N hours. Who and when are recorded. It stops the repeating; it never closes the alert (only the check returning to normal does).
export async function acknowledge(id, who, hours, now = new Date()) {
  const row = (await peekRows('alerts', {}, { limit: 500 })).find(r => r.id === id);
  if (!row || row.state !== 'open') return { ok: false, status: 404, error: 'That alert has already cleared, or isn’t there.' };
  const h = Math.min(Math.max(Math.round(Number(hours) || 24), 1), 24 * 14), at = new Date(now).toISOString(), until = new Date(new Date(now).getTime() + h * HOUR).toISOString();
  const r = await updateRow('alerts', id, { acked_by: who, acked_at: at, snooze_until: until, events: [...(row.events || []), { at, type: 'acknowledged', by: who, note: `Snoozed for ${h} hour${h === 1 ? '' : 's'}.` }] });
  return { ok: true, row: r, hours: h };
}

// A clearly labelled test to the person who pressed the button, on the ways they have set up. At most 3 in an hour.
export async function sendTestAlert({ person, people, cfg, base, now = new Date(), deps }) {
  const hourAgo = new Date(new Date(now).getTime() - HOUR).toISOString(), key = `test:${person.email}`;
  const recent = (await peekRows('alerts', { key }, { limit: 20 })).filter(r => r.last_sent_at && r.last_sent_at >= hourAgo);
  if (recent.length >= 3) return { ok: false, status: 429, error: 'That’s three tests in the last hour. Please wait a little before the next one.' };
  const row = await createRow('alerts', { key, level: 'test', state: 'resolved', resolved_at: new Date(now).toISOString(), title: 'Test of the ad safety alerts', short: 'This is only a test. Nothing is wrong.',
    body: 'This is a test of the ad safety alerts. Nothing is wrong. If you can read this on this channel, it works.', link: '/ops/ads?view=safety', numbers: { by: person.name } });
  const lines = await deliverTo(person, row, 'test', 'urgent', { now, base, cfg, deps, people });
  await updateRow('alerts', row.id, { deliveries: lines, sends: [{ at: new Date(now).toISOString(), kind: 'test' }], last_sent_at: new Date(now).toISOString() });
  return { ok: true, lines: lines.map(l => ({ channel: l.channel, status: l.status, detail: l.detail })) };
}

// ---- For the Safety page and the digest
export async function pageAlerts() {
  const rows = (await peekRows('alerts', {}, { limit: 120 })).map(r => ({ id: r.id, key: r.key, level: r.level, title: r.title, body: r.body, link: r.link, state: r.state, numbers: r.numbers, created_at: r.created_at,
    last_sent_at: r.last_sent_at, acked_by: r.acked_by, acked_at: r.acked_at, snooze_until: r.snooze_until, resolved_at: r.resolved_at, deliveries: r.deliveries || [], events: r.events || [], queued: (r.queued || []).length }));
  return { open: rows.filter(r => r.state === 'open'), recent: rows.slice(0, 40) };
}
export async function routineAlerts() { return (await peekRows('alerts', { state: 'open', level: 'routine' }, { limit: 50 })).map(r => ({ title: r.title, body: r.body, link: r.link })); }
export const routineHtml = (list, base) => (list.length ? `<h2 style="font-size:18px;margin:18px 0 4px">For your information (ad safety net)</h2><ul>${list.map(x => `<li><b>${esc(x.title)}</b>. ${esc(x.body)}${x.link ? ` <a href="${esc(abs(base, x.link))}">Open</a>` : ''}</li>`).join('')}</ul>` : '');
