// The alert channel (lib/ops/alerts.js, lib/ops/twilio.js) in node on an in-process Postgres (PGlite) and the Twilio mock (:4557). `source env.sh`, run.sh running.
// Nothing real is touched: email goes to a recorder (the kit has no mail key), text and WhatsApp to the Twilio mock, the database is PGlite. All numbers are made up (555-01xx).
//   levels route to the right channels (urgent: email + text + WhatsApp; important: email + WhatsApp; routine: only in the digest); quiet hours hold IMPORTANT (not URGENT) until the
//   person's morning; the same problem does not ping again inside its gap, repeats until acknowledged (at most 6 repeats a day), sends again at once if it gets 25% worse, and a snooze
//   (Acknowledge: who and when) stops the repeating; clearing sends ONE resolved note; the Twilio mock sees the right To / From / Body (the WhatsApp prefix; the approved template when set);
//   a Twilio refusal or rate limit is recorded and the other channels still go; with no Twilio settings it is email only and says "WhatsApp not set up"; a test alert is labelled TEST and
//   limited to 3 an hour; phone numbers are in no alert row, log line, Change Log value or console output; the mock's log holds no key; E.164 is checked.
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.TWILIO_BASE !== 'http://localhost:4557') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite';
const SID = 'ACmocktwilioaccount0000000000000000', TOKEN = 'mock-twilio-token-not-real';
const setTwilio = (on, { wa = true, template = false } = {}) => {
  for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TEMPLATE_SID']) delete process.env[k];
  if (!on) return;
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_SMS_FROM: '+15005550006' });
  if (wa) process.env.TWILIO_WHATSAPP_FROM = '+14155238886';
  if (template) process.env.TWILIO_WHATSAPP_TEMPLATE_SID = 'HXmocktemplate00000000000000000000';
};
// every console line is kept, to prove no number ever reaches a log
const logs = []; for (const k of ['log', 'error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const t = a.map(String).join(' '); if (!/^(ok |FAIL|--)/.test(t)) logs.push(t); o(...a); }; }
const TW = 'http://localhost:4557', tw = async (q = '') => (await fetch(`${TW}/__log${q}`)).json(), mode = q => fetch(`${TW}/__mode?${q}`);
await fetch(`${TW}/__reset`);

const T = await import('../../lib/ops/twilio.js'), A = await import('../../lib/ops/alerts.js'), S = await import('../../lib/ops/adsstore.js');
const P1 = '+15555550142', P2 = '+15555550177';
const team = [{ name: 'Jacob Test', email: 'director@example.test', director: true, roles: [] }, { name: 'Rebecka Test', email: 'ads@example.test', roles: ['Ads'], director: false }, { name: 'Floss Test', email: 'floss@example.test', roles: ['Project Manager'], director: false }];
const mails = []; const mailOk = { sendEmail: async m => { mails.push(m); return {}; }, emailReady: () => true };
const changeLog = []; const log = async (...a) => { changeLog.push(a); };
const NOON = new Date('2026-12-02T17:00:00Z'), NIGHT = new Date('2026-12-02T04:00:00Z'), MORNING = new Date('2026-12-02T12:30:00Z');   // 12:00, 23:00 (the evening before) and 07:30 in New York (winter)
const mins = (d, m) => new Date(d.getTime() + m * 60e3);
const A1 = (o = {}) => ({ key: 'k1', level: 'urgent', title: 'Ads are overspending', body: 'The account spent $400 today.\nWhat to do: pause the big one.', short: 'Spent $400 today.', link: '/ops/ads?view=safety', measure: 400, numbers: {}, ...o });
const mk = async (now, over = {}) => { const cfg = await A.getConfig(), people = A.resolvePeople(team, await A.loadPeopleSettings(), cfg); return { now, preview: false, cfg, people, deps: A.makeDeps({ ...mailOk, ...over }), base: 'https://ops.example.test' }; };
const rows = async () => S.peekRows('alerts', {}, { limit: 500 });
const sentCount = (r, ch, kind) => (r.deliveries || []).filter(l => l.channel === ch && l.status === 'sent' && (!kind || l.kind === kind)).length;

console.log('-- twilio: settings, numbers, status');
setTwilio(false);
ck('nothing set: "Not set up"', T.twilioStatus().label === 'Not set up' && !T.twilioStatus().sms && !T.twilioStatus().whatsapp);
process.env.TWILIO_ACCOUNT_SID = SID; process.env.TWILIO_AUTH_TOKEN = TOKEN;
ck('the account only: "Email only"', T.twilioStatus().label === 'Email only');
setTwilio(true, { wa: true });
ck('both senders: "Text and WhatsApp ready" and the status lists names only, never a value', T.twilioStatus().label === 'Text and WhatsApp ready' && !JSON.stringify(T.twilioStatus()).includes(TOKEN) && !JSON.stringify(T.twilioStatus()).includes(SID));
ck('E.164: a full international number passes, a short or bare one does not', T.isE164(P1) && !T.isE164('5555550142') && !T.isE164('+0123') && !T.isE164('abc') && T.normalizePhone('+1 (555) 555-0142') === P1 && T.normalizePhone('001 555 555 0142') === P1);
ck('masked to the last four digits only', T.maskPhone(P1) === '••••0142' && !T.maskPhone(P1).includes('555'));
ck('scrub hides numbers, account numbers and the key in a message', !/5550142|ACmock|mock-twilio-token/.test(T.scrub(`The 'To' number ${P1} is not valid for ${SID} (${TOKEN})`)));

console.log('-- settings and people (a director saves; the Change Log never carries a number)');
const cfg0 = await A.getConfig();
ck('starting values: no ceilings, return floor 1.2, quiet hours 22:00 to 07:00', cfg0.daily_ceiling_cents === 0 && cfg0.monthly_ceiling_cents === 0 && cfg0.floor_roas === 1.2 && cfg0.quiet_start === '22:00' && cfg0.quiet_end === '07:00' && !A.ceilingsSet(cfg0));
let refused = ''; try { await A.saveConfig({ spike_multiple: 0.5 }, 'Jacob Test', log); } catch (e) { refused = e.message; }
ck('a number out of range is refused in plain words', /Spend spike/.test(refused) && refused.includes('1.1'), refused);
ck('a bad quiet-hours time is refused', await A.saveConfig({ quiet_start: '25:00' }, 'J', log).then(() => false, e => /time like 22:00/.test(e.message)));
const saved = await A.saveConfig({ daily_ceiling_cents: '', monthly_ceiling_cents: '' }, 'Jacob Test', log);
ck('empty ceilings stay empty (the check stays off)', saved.changed.length === 0);
const s2 = await A.saveConfig({ daily_ceiling_cents: '250', monthly_ceiling_cents: '5000' }, 'Jacob Test', log);
ck('ceilings are saved in cents and logged', s2.daily_ceiling_cents === 25000 && s2.monthly_ceiling_cents === 500000 && A.ceilingsSet(s2) && changeLog.some(l => /Daily spending ceiling/.test(l[3]) && l[4] === 'not set' && l[5] === '$250'));
let people = A.resolvePeople(team, await A.loadPeopleSettings(), s2);
ck('the ads list is the directors and the Ads role (Floss is not on it)', people.map(p => p.email).sort().join() === 'ads@example.test,director@example.test');
ck('with no number a person gets email only', people.every(p => !p.phone && p.email_on));
ck('a bad number is refused', await A.saveRecipient('director@example.test', { phone: '555-1212' }, 'Jacob Test', team, log).then(() => false, e => /country code/.test(e.message)));
ck('a person not on the ads list cannot be given alerts', await A.saveRecipient('floss@example.test', { phone: P1 }, 'Jacob Test', team, log).then(() => false, e => /isn’t on the ads list/.test(e.message)));
await A.saveRecipient('director@example.test', { phone: '+1 (555) 555-0142' }, 'Jacob Test', team, log);
await A.saveRecipient('ads@example.test', { phone: P2 }, 'Jacob Test', team, log);
people = A.resolvePeople(team, await A.loadPeopleSettings(), s2);
ck('numbers saved; a person with a number defaults to urgent by text and urgent + important by WhatsApp', people.every(p => p.phone && p.sms.levels.join() === 'urgent' && p.whatsapp.levels.join() === 'urgent,important'));
ck('the Change Log says an alert number was set, never the number', changeLog.some(l => /alert number/.test(l[3]) && l[5] === 'set') && !JSON.stringify(changeLog).match(/555/));
const v = A.peopleView(people, 'director@example.test');
ck('a settings page sees its own number in full and everyone else’s as the last four digits', v.find(p => p.is_me).phone === P1 && v.find(p => !p.is_me).phone === undefined && v.find(p => !p.is_me).phone_masked === '••••0177' && !JSON.stringify(v.filter(p => !p.is_me)).includes('5550177'));

console.log('-- URGENT: email, text and WhatsApp, at once, at any hour (here, 23:00)');
setTwilio(true); await tw('?reset=1');
let ctx = await mk(NIGHT), r1 = await A.raiseAlert(A1(), ctx);
let row = (await rows()).find(r => r.key === 'k1');
ck('sent as a new alert', r1.action === 'new' && r1.send === 'alert' && row.state === 'open' && row.level === 'urgent');
ck('email went to both people', mails.filter(m => /^\[URGENT\] Ads: Ads are overspending/.test(m.subject)).map(m => m.to).sort().join() === 'ads@example.test,director@example.test');
let L = (await tw()).requests;
ck('the Twilio mock got 2 texts and 2 WhatsApp messages', L.filter(x => x.channel === 'sms').length === 2 && L.filter(x => x.channel === 'whatsapp').length === 2, JSON.stringify(L.map(x => x.To)));
const sms1 = L.find(x => x.To === P1), wa1 = L.find(x => x.To === `whatsapp:${P1}`);
ck('text: To the person, From the text number, a short body with the title and a full link', sms1 && sms1.From === '+15005550006' && /EP ads URGENT/.test(sms1.Body) && /Spent \$400 today/.test(sms1.Body) && sms1.Body.includes('https://ops.example.test/ops/ads?view=safety') && sms1.Body.length <= 320, JSON.stringify(sms1));
ck('WhatsApp: To and From carry the whatsapp: prefix, free text with the title and the advice, no template', wa1 && wa1.From === 'whatsapp:+14155238886' && /Ads are overspending/.test(wa1.Body) && /pause the big one/.test(wa1.Body) && !wa1.ContentSid, JSON.stringify(wa1));
ck('the mock saw the right account and key (and holds neither)', L.every(x => x.auth && x.authMatchesAccount) && !JSON.stringify(L).includes(TOKEN) && !JSON.stringify(L).includes(SID));
ck('every channel for every person is written on the alert: sent', ['sms', 'whatsapp', 'email'].every(c => sentCount(row, c) === 2));

console.log('-- dedupe, cooldown, repeats, acknowledge');
await tw('?reset=1'); mails.length = 0;
ctx = await mk(mins(NIGHT, 10)); const r2 = await A.raiseAlert(A1(), ctx);
ck('10 minutes later: the same problem does not ping again', r2.action === 'cooldown' && !r2.send && mails.length === 0 && (await tw()).total === 0);
ctx = await mk(mins(NIGHT, 61)); const r3 = await A.raiseAlert(A1(), ctx);
ck('after 60 minutes: a reminder goes (urgent repeats until acknowledged)', r3.action === 'repeat' && mails.length === 2 && (await tw()).total === 4 && /^\[URGENT\] Ads: Reminder:/.test(mails[0].subject));
ctx = await mk(mins(NIGHT, 61 + 20)); const r4 = await A.raiseAlert(A1({ measure: 520 }), ctx);
ck('20 minutes after that it is 30% worse: sent again at once', r4.action === 'worse' && r4.send === 'worse' && /^\[URGENT\] Ads: It got worse:/.test(mails.at(-1).subject));
mails.length = 0; await tw('?reset=1');
row = (await rows()).find(r => r.key === 'k1');
const ack = await A.acknowledge(row.id, 'Rebecka Test', 6, mins(NIGHT, 90));
row = (await rows()).find(r => r.key === 'k1');
ck('acknowledge records who and when and snoozes for the hours asked', ack.ok && row.acked_by === 'Rebecka Test' && !!row.acked_at && new Date(row.snooze_until) - new Date(row.acked_at) === 6 * 3600e3 && row.events.some(e => e.type === 'acknowledged' && e.by === 'Rebecka Test'));
ctx = await mk(mins(NIGHT, 240)); const r5 = await A.raiseAlert(A1({ measure: 540 }), ctx);
ck('while snoozed it stays quiet, even hours later (a small change is not a reason)', r5.action === 'snoozed' && mails.length === 0 && (await tw()).total === 0);
ctx = await mk(mins(NIGHT, 100)); const r6 = await A.raiseAlert(A1({ measure: 900 }), ctx);
ck('but a big change breaks the snooze and says so', r6.action === 'worse' && (await rows()).find(r => r.key === 'k1').snooze_until === null && (await rows()).find(r => r.key === 'k1').events.some(e => e.type === 'worse'));
mails.length = 0; await tw('?reset=1');
// at most 6 repeats in 24 hours: 10 more hourly checks after the snooze is gone
let t = mins(NIGHT, 100), sends = 0;
for (let i = 1; i <= 10; i++) { t = mins(t, 61); const r = await A.raiseAlert(A1({ measure: 900 }), await mk(t)); if (r.send === 'repeat') sends++; }
ck('repeats stop at 6 in 24 hours (the limit in Settings), however long it lasts', sends <= 6 && sends >= 5, `sends ${sends}`);

console.log('-- IMPORTANT: email + WhatsApp, never a text; quiet hours hold it until morning; URGENT ignores them');
await tw('?reset=1'); mails.length = 0;
ctx = await mk(NIGHT); const i1 = await A.raiseAlert(A1({ key: 'imp', level: 'important', title: 'A campaign has no end date', body: 'It could run forever.', short: 'x' }), ctx);
row = (await rows()).find(r => r.key === 'imp');
ck('at 23:00 an IMPORTANT alert is held: nothing sent, two people waiting, the log says so', i1.send === 'alert' && mails.length === 0 && (await tw()).total === 0 && row.queued.length === 2 && row.deliveries.every(l => l.status === 'queued' && /quiet hours end/.test(l.detail)));
const u1 = await A.raiseAlert(A1({ key: 'urg', title: 'Tracking broke' }), await mk(NIGHT));
ck('at the same hour an URGENT one goes straight out (email, text, WhatsApp)', u1.send === 'alert' && mails.length === 2 && (await tw()).total === 4);
mails.length = 0; await tw('?reset=1');
const early = await A.flushQueued(await mk(mins(NIGHT, 60)));
ck('an hour later (midnight) it is still held', early.length === 0 && mails.length === 0);
const fl = await A.flushQueued(await mk(MORNING)); L = (await tw()).requests;
ck('at 07:30 it goes: email and WhatsApp, and no text', fl.length === 2 && mails.length === 2 && L.length === 2 && L.every(x => x.channel === 'whatsapp') && !L.some(x => x.channel === 'sms'));
row = (await rows()).find(r => r.key === 'imp');
ck('the held list is empty after, and the log has the sends', row.queued.length === 0 && sentCount(row, 'email') === 2 && sentCount(row, 'whatsapp') === 2);
mails.length = 0; await tw('?reset=1');
const i2 = await A.raiseAlert(A1({ key: 'imp', level: 'important', title: 'A campaign has no end date', body: 'It could run forever.', short: 'x' }), await mk(mins(MORNING, 120)));
ck('and the same problem inside its day does not ping again', i2.action === 'cooldown' && mails.length === 0);
const i3 = await A.raiseAlert(A1({ key: 'imp', level: 'important', title: 'A campaign has no end date', body: 'It could run forever.', short: 'x' }), await mk(mins(MORNING, 25 * 60)));
ck('a day on, unacknowledged, it reminds once', i3.action === 'repeat' && mails.length === 2);

console.log('-- escalation: important becomes urgent');
mails.length = 0; await tw('?reset=1');
await A.raiseAlert(A1({ key: 'esc', level: 'important', title: 'Pixel quiet' }), await mk(NOON));
mails.length = 0; await tw('?reset=1');
const e1 = await A.raiseAlert(A1({ key: 'esc', level: 'urgent', title: 'Pixel quiet' }), await mk(mins(NOON, 5)));
ck('going up a level sends at once, with the text, even inside the gap', e1.action === 'escalated' && mails.length === 2 && (await tw()).requests.filter(x => x.channel === 'sms').length === 2 && /Now more serious/.test(mails[0].subject));

console.log('-- ROUTINE: not its own message; it goes in the digest');
mails.length = 0; await tw('?reset=1');
const ro = await A.raiseAlert(A1({ key: 'rou', level: 'routine', title: 'Pixel quiet for half a day', body: 'Last fired 13 hours ago.' }), await mk(NOON));
ck('routine sends nothing', !ro.send && mails.length === 0 && (await tw()).total === 0);
const rl = await A.routineAlerts();
ck('it is listed for the daily digest', rl.length === 1 && /half a day/.test(rl[0].title) && /For your information/.test(A.routineHtml(rl, 'https://ops.example.test')));

console.log('-- resolving: one note, at important level');
mails.length = 0; await tw('?reset=1');
const rs = await A.resolveAlerts({ active: new Set(['imp']), scope: k => true, ctx: await mk(mins(NOON, 30)) });
const all = await rows();
ck('every open alert the check no longer says is closed (urgent ones, the escalated one; the routine one quietly)', rs.map(x => x.key).sort().join() === 'esc,k1,rou,urg' && all.filter(r => r.state === 'open').map(r => r.key).join() === 'imp');
ck('ONE resolved note per alert that had been sent (not the routine one): email + WhatsApp, no text', mails.length === 6 && mails.every(m => /Resolved:/.test(m.subject)) && (await tw()).requests.every(x => x.channel === 'whatsapp') && (await tw()).total === 6);
mails.length = 0; await tw('?reset=1');
await A.resolveAlerts({ active: new Set(['imp']), scope: k => true, ctx: await mk(mins(NOON, 90)) });
ck('and no second note', mails.length === 0 && (await tw()).total === 0);
ck('a check that could not run leaves its alert open', (await A.resolveAlerts({ active: new Set(), scope: k => false, ctx: await mk(mins(NOON, 91)) })).length === 0 && (await rows()).find(r => r.key === 'imp').state === 'open');
await A.resolveAlerts({ active: new Set(), scope: k => true, ctx: { ...(await mk(mins(NOON, 92))), preview: true } });
ck('a preview closes nothing', (await rows()).find(r => r.key === 'imp').state === 'open');
await A.resolveAlerts({ active: new Set(), scope: k => true, ctx: await mk(mins(NOON, 93)) });

console.log('-- the WhatsApp template (needed outside WhatsApp’s 24-hour window)');
setTwilio(true, { template: true }); await tw('?reset=1'); mails.length = 0;
await A.raiseAlert(A1({ key: 'tpl', title: 'Template check' }), await mk(NOON));
const wt = (await tw()).requests.find(x => x.channel === 'whatsapp');
ck('with the template set, WhatsApp goes as ContentSid + ContentVariables ({{1}} headline, {{2}} link) and no free text', wt.ContentSid === 'HXmocktemplate00000000000000000000' && !wt.Body && JSON.parse(wt.ContentVariables)['1'] === 'URGENT: Template check' && JSON.parse(wt.ContentVariables)['2'] === 'https://ops.example.test/ops/ads?view=safety', JSON.stringify(wt));
ck('texts stay free text', (await tw()).requests.filter(x => x.channel === 'sms').every(x => x.Body && !x.ContentSid));
await A.resolveAlerts({ active: new Set(), scope: k => true, ctx: await mk(mins(NOON, 5)) });

console.log('-- a channel fails on its own: the others still go, the failure is recorded');
setTwilio(true); await tw('?reset=1'); await mode('reject=1'); mails.length = 0;
const f1 = await A.raiseAlert(A1({ key: 'fail', title: 'Failure check' }), await mk(NOON)); row = (await rows()).find(r => r.key === 'fail');
ck('Twilio refuses (and its error quotes the number): text and WhatsApp are recorded as failed', row.deliveries.filter(l => l.status === 'failed').length === 4 && row.deliveries.filter(l => l.status === 'failed').every(l => !/555|ACmock|token/.test(l.detail)), JSON.stringify(row.deliveries.filter(l => l.status === 'failed')[0]));
ck('email still went, and says the text and WhatsApp could not reach them', mails.length === 2 && mails.every(m => /couldn’t reach you by text messages or WhatsApp/.test(m.html)) && sentCount(row, 'email') === 2);
ck('and the failure is not silent: the alert is not marked "nobody reached"', !row.events.some(e => e.type === 'nobody_reached'));
await mode('reject=0'); await mode('rateLimit=1'); await tw('?reset=1'); mails.length = 0;
await A.raiseAlert(A1({ key: 'fail2', title: 'Rate check' }), await mk(NOON)); row = (await rows()).find(r => r.key === 'fail2');
ck('a rate limit is recorded as "asked us to slow down", email still goes', row.deliveries.some(l => l.status === 'failed' && /slow down/.test(l.detail)) && mails.length === 2);
await mode('rateLimit=0'); await mode('rejectChannel=whatsapp'); await tw('?reset=1'); mails.length = 0;
await A.raiseAlert(A1({ key: 'fail3', title: 'One channel check' }), await mk(NOON)); row = (await rows()).find(r => r.key === 'fail3');
ck('only WhatsApp refused: texts and email were sent, WhatsApp failed', sentCount(row, 'sms') === 2 && sentCount(row, 'email') === 2 && row.deliveries.filter(l => l.channel === 'whatsapp' && l.status === 'failed').length === 2);
await mode('rejectChannel='); await tw('?reset=1');
const dead = await A.raiseAlert(A1({ key: 'fail4', title: 'Nothing works' }), await mk(NOON, { emailReady: () => false }));
await mode('reject=1'); await A.raiseAlert(A1({ key: 'fail5', title: 'Nothing works either' }), await mk(NOON, { emailReady: () => false })); await mode('reject=0');
ck('if no channel can reach anyone, the alert says so (the Safety page shows it)', (await rows()).find(r => r.key === 'fail5').events.some(e => e.type === 'nobody_reached'));
ck('a mail failure is recorded too, and a channel that throws does not stop the rest', await (async () => { mails.length = 0; await tw('?reset=1'); await A.raiseAlert(A1({ key: 'fail6', title: 'Mail down' }), await mk(NOON, { sendEmail: async () => { throw new Error('boom ' + P1); } })); const r = (await rows()).find(x => x.key === 'fail6'); return r.deliveries.filter(l => l.channel === 'email' && l.status === 'failed').length === 2 && sentCount(r, 'sms') === 2 && !JSON.stringify(r).includes('boom'); })());

console.log('-- no Twilio settings: email only, said plainly');
setTwilio(false); await tw('?reset=1'); mails.length = 0;
await A.raiseAlert(A1({ key: 'none', title: 'No Twilio' }), await mk(NOON)); row = (await rows()).find(r => r.key === 'none');
ck('email goes; text and WhatsApp are skipped with "not set up"; Twilio is never called', mails.length === 2 && (await tw()).total === 0 && row.deliveries.some(l => l.channel === 'whatsapp' && l.status === 'skipped' && l.detail === 'WhatsApp not set up') && row.deliveries.some(l => l.channel === 'sms' && l.status === 'skipped' && l.detail === 'Text messages not set up'));
const plan = A.planFor(await (async () => (await mk(NOON)).people)(), 'urgent', 'alert', NOON, await A.getConfig(), A.makeDeps(mailOk));
ck('a preview plan says the same without sending', plan[0].channels.some(c => c.channel === 'whatsapp' && /skipped: WhatsApp not set up/.test(c.will)) && plan[0].channels.some(c => c.channel === 'email' && c.will === 'send'));
ck('with no mail key either, email is skipped and said so', await (async () => { await A.raiseAlert(A1({ key: 'nomail', title: 'No mail' }), await mk(NOON, { emailReady: () => false })); const r = (await rows()).find(x => x.key === 'nomail'); return r.deliveries.some(l => l.channel === 'email' && l.status === 'skipped' && /isn’t set up/.test(l.detail)); })());

console.log('-- switching channels off, per person');
setTwilio(true); await tw('?reset=1'); mails.length = 0;
await A.saveRecipient('ads@example.test', { sms: { on: false, levels: ['urgent'] }, whatsapp: { on: true, levels: ['important'] }, email_on: false }, 'Jacob Test', team, log);
await A.raiseAlert(A1({ key: 'off', title: 'Per person' }), await mk(NOON)); row = (await rows()).find(r => r.key === 'off'); L = (await tw()).requests;
ck('Rebecka: email off, text off, WhatsApp only for important, so an urgent one reaches her by nothing; Jacob gets all three', mails.map(m => m.to).join() === 'director@example.test' && L.filter(x => x.To.includes(P2)).length === 0 && L.filter(x => x.To.includes(P1)).length === 2 && row.deliveries.some(l => l.who === 'Rebecka Test' && l.status === 'skipped'));
ck('and the Change Log notes the changes without any number', changeLog.some(l => /email alerts/.test(l[3]) && l[5] === 'off') && !JSON.stringify(changeLog).match(/5550|5551/));
await A.saveRecipient('ads@example.test', { sms: { on: true, levels: ['urgent'] }, whatsapp: { on: true, levels: ['urgent', 'important'] }, email_on: true }, 'Jacob Test', team, log);

console.log('-- the test alert');
await tw('?reset=1'); mails.length = 0;
const pe = (await mk(NOON)).people.find(p => p.email === 'director@example.test'), pctx = await mk(NOON);
const tr = await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: NOON, deps: pctx.deps }); L = (await tw()).requests;
ck('goes to the person who pressed it only, on every way they have set up, clearly labelled TEST', tr.ok && L.length === 2 && L.every(x => /TEST/.test(x.Body) && x.To.includes(P1)) && mails.length === 1 && mails[0].to === 'director@example.test' && /^\[TEST\]/.test(mails[0].subject) && /This is a test/.test(mails[0].html), JSON.stringify(tr));
await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: mins(NOON, 5), deps: pctx.deps }); await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: mins(NOON, 6), deps: pctx.deps });
const fourth = await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: mins(NOON, 7), deps: pctx.deps });
ck('a fourth test inside an hour is refused (3 an hour)', !fourth.ok && fourth.status === 429 && /three tests/.test(fourth.error));
ck('an hour later it works again', (await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: mins(NOON, 70), deps: pctx.deps })).ok);
ck('a test is in the log as TEST and is never an open alert', (await rows()).filter(r => r.level === 'test').length === 4 && (await rows()).every(r => r.level !== 'test' || r.state === 'resolved'));
setTwilio(false);
const nt = await A.sendTestAlert({ person: pe, people: pctx.people, cfg: pctx.cfg, base: pctx.base, now: mins(NOON, 200), deps: pctx.deps });
ck('with no Twilio settings the test says "not set up" for each, and email still goes', nt.ok && nt.lines.some(l => l.channel === 'whatsapp' && l.status === 'skipped' && /not set up/.test(l.detail)) && nt.lines.some(l => l.channel === 'email' && l.status === 'sent'));

console.log('-- numbers and secrets in no log');
const allRows = JSON.stringify(await rows()), mockLog = JSON.stringify(await tw()), con = logs.join('\n');
ck('no alert row holds a phone number', !/5550142|5550177|555-0142/.test(allRows));
ck('no log line the code wrote holds a number, the account or the key', !/5550142|5550177|ACmock|mock-twilio-token/.test(con), con.slice(0, 200));
ck('the Twilio mock’s own log holds no key and no account number (the numbers are there only because Twilio needs a To)', !/mock-twilio-token|ACmock/.test(mockLog));
const peopleRow = (await S.peekRows('settings', { key: 'alerts_recipients' }))[0];
ck('numbers live in one place only: the recipients setting in the database', peopleRow && JSON.stringify(peopleRow.value).includes('5550142') && (await S.peekRows('settings', {})).filter(r => JSON.stringify(r.value).includes('5550142')).length === 1);
console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
