// The ad safety net at API level, against the running app (:3100, started by ads-safety.sh) with the Meta mock (the whole-account "worlds") and the Twilio mock. `source env.sh`, then:
//   node ads-safety-api.mjs a   Meta key set, Twilio set (text + WhatsApp)    node ads-safety-api.mjs b   Meta key set, NO Twilio (email only)    node ads-safety-api.mjs c   NO Meta key
// a: who may see the Safety net (director and Rebecka yes; Floss, Irene, Ichha, Carolyn, Stephanie, a teacher no, page and API; Rebecka still no Business/Finance/Payroll; the numbers and
//    settings directors only); the cron (401 without the key and with a wrong one, ?dry=1 records and sends nothing, a real run raises the trouble account's alerts and the Twilio mock gets the
//    right messages); numbers (checked, saved, shown in full only to their owner, masked to everyone else, in no answer for the Ads role); Acknowledge by the Ads role (who and when);
//    Check now; the test alert (directors; labelled TEST; 3 an hour; a Twilio refusal shown as a delivery problem); the Change Log and the app's own log hold no number; Meta saw only reads.
// b: no Twilio settings: the Settings row says "Not set up", a test alert says WhatsApp and text are not set up, alerts still go out by email and the log says so.
// c: no Meta key: red "No Meta token set", the cron says Meta isn't connected, nothing is read.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHASE = process.argv[2] || 'a';
const B = 'http://localhost:3100', MT = 'http://localhost:4556', TW = 'http://localhost:4557';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, c = DIR, body, headers = {}) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${c}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = (await r.text()).replace(/<!-- -->/g, ''); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads-safety', c, b);
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cron = (u, headers = CRON) => fetch(B + u, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const meta = async (q = '') => (await fetch(`${MT}/__log${q}`)).json(), tw = async (q = '') => (await fetch(`${TW}/__log${q}`)).json();
const mmode = q => fetch(`${MT}/__mode?${q}`), tmode = q => fetch(`${TW}/__mode?${q}`);
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const P1 = '+15555550142', P2 = '+15555550177', NUM = /5550142|5550177/;
const hourNY = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).slice(0, 2));
const quiet = hourNY >= 22 || hourNY < 7;
await fetch(`${MT}/__reset`); await fetch(`${TW}/__reset`);
const rb = cookie('rebecka@example.com');

if (PHASE === 'a') {
  console.log('-- who may see it');
  for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn (Publisher)', 'carolyn@example.com', 403], ['Stephanie', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
    const c = email ? cookie(email) : DIR;
    ck(`${who}: the Safety net API answers ${want}`, (await get('/api/ops/ads-safety', c)).status === want);
    ck(`${who}: its write door answers ${want === 200 ? 'a plain "unknown request", not 403' : 403}`, (await post({ action: 'nope' }, c)).status === (want === 200 ? 400 : 403));
    const pg = await get('/ops/ads?view=safety', c);
    ck(`${who}: the Safety net tab ${want === 200 ? 'opens' : 'is not shown'}`, want === 200 ? pg.status === 200 && /Safety net/.test(pg.text) : pg.status !== 200);
    ck(`${who}: the settings are ${email === null ? 'readable (directors only)' : 'refused (directors only)'}`, (await get('/api/ops/ads-safety?settings=1', c)).status === (email === null ? 200 : 403));
  }
  ck('Rebecka cannot save the settings, a number or send a test, and still cannot open Business, Finance or Payroll',
    (await post({ action: 'saveConfig', values: { zero_days: 2 } }, rb)).status === 403 && (await post({ action: 'saveRecipient', email: 'rebecka@example.com', patch: { phone: P2 } }, rb)).status === 403 && (await post({ action: 'test' }, rb)).status === 403
    && (await get('/ops/business', rb)).status !== 200 && (await get('/ops/business?view=finance', rb)).status !== 200 && (await get('/ops/business?view=payroll', rb)).status !== 200);
  ck('Rebecka is not shown the Settings section; the director is', !/Ads safety net/.test((await get('/ops/settings?view=connections&s=ads-safety', rb)).text) && /Ads safety net/.test((await get('/ops/settings?view=connections&s=ads-safety', DIR)).text));

  console.log('-- before anything is set');
  const s0 = (await get('/api/ops/ads-safety')).j;
  ck('opening it first time: Meta key set, ceilings NOT set (so the page asks), no check yet (the sixth card is amber, "waiting for the first hourly check"), no alerts', s0.token && s0.account_set && !s0.ceilings_set && s0.board.length === 1 && s0.board[0].id === 'heartbeat' && s0.board[0].status === 'amber' && /first hourly check/.test(s0.board[0].headline) && s0.alerts.open.length === 0);
  ck('opening it asked Meta nothing', (await meta()).total === 0);
  ck('the channels say Text and WhatsApp ready, with no value', s0.channels.label === 'Text and WhatsApp ready' && !/ACmock|mock-twilio/.test(JSON.stringify(s0)));

  console.log('-- the cron');
  ck('without the key: 401', (await cron('/api/ops/ads-watch', {})).status === 401);
  ck('a wrong key: 401', (await cron('/api/ops/ads-watch?key=wrong', {})).status === 401);
  await fetch(`${MT}/__world?name=trouble`);
  const dry = await cron('/api/ops/ads-watch?dry=1');
  ck('?dry=1 shows what it would alert, records nothing, sends nothing', dry.status === 200 && dry.j.preview === true && dry.j.alerts.length >= 5 && dry.j.alerts.every(a => !a.delivered) && (await tw()).total === 0 && (await get('/api/ops/ads-safety')).j.alerts.open.length === 0);
  const dnow = await cron('/api/ops/ads-watch?dry=1&now=2026-12-01T17:00:00Z');
  ck('?dry=1&now= works for a moment of your choosing', dnow.status === 200 && dnow.j.at === '2026-12-01T17:00:00.000Z');

  console.log('-- numbers (personal data)');
  const setP = async (email, phone, c = DIR) => post({ action: 'saveRecipient', email, patch: { phone } }, c);
  ck('a number without a country code is refused in plain words', (await setP('jacob@embodiedphilosophy.com', '555 555 0142')).status === 400 && /country code/.test((await setP('jacob@embodiedphilosophy.com', '555 555 0142')).j.error));
  ck('a person who is not on the ads list cannot be given one', (await setP('floss@example.com', P1)).status === 400);
  const a1 = await setP('jacob@embodiedphilosophy.com', '+1 (555) 555-0142'), a2 = await setP('rebecka@example.com', P2);
  ck('the director sets his own and Rebecka’s number', a1.status === 200 && a2.status === 200 && a2.j.changed.includes('alert number'));
  const st = (await get('/api/ops/ads-safety?settings=1')).j, me = st.people.find(p => p.is_me), her = st.people.find(p => !p.is_me);
  ck('the director sees his own number in full and Rebecka’s only as the last four digits', me.phone === P1 && her.phone === undefined && her.phone_masked === '••••0177' && !JSON.stringify(her).includes('5550177'));
  ck('each starts with urgent by text and urgent + important by WhatsApp', [me, her].every(p => p.sms.levels.join() === 'urgent' && p.whatsapp.levels.join() === 'urgent,important' && p.email_on));
  const asRb = JSON.stringify((await get('/api/ops/ads-safety', rb)).j);
  ck('what the Ads role gets back holds no number, not even masked', !NUM.test(asRb) && !/••••/.test(asRb));
  ck('the Ads role’s page text holds none either', !NUM.test((await get('/ops/ads?view=safety', rb)).text));

  console.log('-- ceilings and thresholds');
  ck('a nonsense number is refused', (await post({ action: 'saveConfig', values: { spike_multiple: 0.2 } })).status === 400 && /Spend spike/.test((await post({ action: 'saveConfig', values: { spike_multiple: 0.2 } })).j.error));
  const sc = await post({ action: 'saveConfig', values: { daily_ceiling_cents: '100', monthly_ceiling_cents: '5000' } });
  ck('ceilings of $100 a day and $5,000 a month are saved', sc.status === 200 && sc.j.config.daily_ceiling_cents === 10000 && sc.j.config.monthly_ceiling_cents === 500000 && (await get('/api/ops/ads-safety')).j.ceilings_set === true);
  ck('the Ads role can read them but sees only values (no editing door)', (await get('/api/ops/ads-safety', rb)).j.config.daily_ceiling_cents === 10000);

  console.log('-- a real run of the hourly job against the trouble account (not built in Ops)');
  await tw('?reset=1');
  const run = await cron('/api/ops/ads-watch');
  const keys = (run.j.alerts || []).map(a => a.key).sort(), urgentKeys = (run.j.alerts || []).filter(a => a.level === 'urgent').map(a => a.key).sort();
  const wantUrgent = ['low-return', 'pacing-daily', 'pacing-month', 'past-end', ...(hourNY >= 4 ? ['spike'] : [])].sort();
  ck('the problems are raised (urgent: past its end time, low return, both pacing' + (hourNY >= 4 ? ', the spike' : '; the spike check waits until 04:00') + ')', run.status === 200 && JSON.stringify(urgentKeys) === JSON.stringify(wantUrgent) && ['ad-issues', 'open-ended', 'zero-results'].every(k => keys.includes(k)), keys.join());
  const L = (await tw()).requests;
  ck('the Twilio mock got a text for each urgent alert, to each person (and none for the important ones)', L.filter(x => x.channel === 'sms').length === wantUrgent.length * 2 && L.filter(x => x.channel === 'sms').every(x => [P1, P2].includes(x.To) && x.From === '+15005550006'), `${L.filter(x => x.channel === 'sms').length}`);
  ck(quiet ? 'it is the middle of the night in New York, so the important ones wait for the morning (WhatsApp for urgent only)' : 'WhatsApp for the urgent and the important ones', L.filter(x => x.channel === 'whatsapp').length === (wantUrgent.length + (quiet ? 0 : 3)) * 2 && L.filter(x => x.channel === 'whatsapp').every(x => [`whatsapp:${P1}`, `whatsapp:${P2}`].includes(x.To) && x.From === 'whatsapp:+14155238886'));
  ck('the Twilio mock’s request log holds no key and no account number', !/mock-twilio-token|ACmock/.test(JSON.stringify(L)) && L.every(x => x.auth && x.authMatchesAccount));
  const s1 = (await get('/api/ops/ads-safety')).j;
  ck('the page now has seven cards, the open alerts and what needs a look', s1.board.length === 7 && s1.alerts.open.length === keys.length && s1.flagged.length === 5 && s1.last_ok_at && s1.board.find(c => c.id === 'heartbeat').status === 'green');
  ck('email is not set up in the test kit, and the log says so for each person (nothing silent; at night the important ones are queued for the morning)', s1.alerts.recent.every(a => a.deliveries.every(d => d.status === 'queued') || a.deliveries.some(d => d.channel === 'email' && d.status === 'skipped' && /isn’t set up/.test(d.detail))));
  ck('the log shows who was told, on which channel: sent texts and WhatsApp for an urgent one', s1.alerts.recent.find(a => a.key === 'past-end').deliveries.filter(d => d.status === 'sent').map(d => `${d.who}:${d.channel}`).sort().length === 4);
  ck('flagged campaigns carry the Meta Ads Manager link (the account number, no key)', s1.flagged.every(f => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=/.test(f.manager_url)) && !JSON.stringify(s1).includes('mock-ads-token'));
  ck('run again: nothing is sent twice inside its gap', await (async () => { await tw('?reset=1'); const r = await cron('/api/ops/ads-watch'); return r.j.alerts.filter(a => a.send).length === 0 && (await tw()).total === 0; })());

  console.log('-- acknowledge');
  const target = s1.alerts.open.find(a => a.key === 'past-end'), ackR = await post({ action: 'ack', id: target.id, hours: 12 }, rb);
  ck('the Ads role (Rebecka) acknowledges: recorded with her name and the time, 12 hours', ackR.status === 200 && /12 hours/.test(ackR.j.message));
  const after = (await get('/api/ops/ads-safety')).j.alerts.open.find(a => a.key === 'past-end');
  ck('it shows who and until when, and the event is on the alert', after.acked_by === 'Rebecka Oberg' && !!after.acked_at && new Date(after.snooze_until) - new Date(after.acked_at) === 12 * 3600e3 && after.events.some(e => e.type === 'acknowledged' && e.by === 'Rebecka Oberg'));
  ck('an unknown alert is a plain 404, and Floss cannot acknowledge', (await post({ action: 'ack', id: 'alr_nothing', hours: 1 })).status === 404 && (await post({ action: 'ack', id: target.id, hours: 1 }, cookie('floss@example.com'))).status === 403);
  ck('Check now: runs it (Ads role may), and again at once says it was a moment ago', await (async () => { const r1 = await post({ action: 'checkNow' }, rb), r2 = await post({ action: 'checkNow' }, rb); return r1.status === 200 && r2.status === 200 && /a moment ago/.test(r2.j.message); })());

  console.log('-- the test alert');
  await tw('?reset=1');
  const t1 = await post({ action: 'test' });
  const TL = (await tw()).requests;
  ck('a director’s test goes to himself: text and WhatsApp (sent), email (not set up here), clearly labelled TEST', t1.status === 200 && t1.j.lines.find(l => l.channel === 'sms').status === 'sent' && t1.j.lines.find(l => l.channel === 'whatsapp').status === 'sent' && t1.j.lines.find(l => l.channel === 'email').status === 'skipped' && TL.length === 2 && TL.every(x => /TEST/.test(x.Body) && x.To.includes(P1)), JSON.stringify(t1.j));
  ck('the test is in the log as TEST and is not an open alert', (await get('/api/ops/ads-safety')).j.alerts.recent.filter(a => a.level === 'test').length === 1 && (await get('/api/ops/ads-safety')).j.alerts.open.every(a => a.level !== 'test'));

  console.log('-- Twilio refuses: a delivery problem, shown, and the rest still goes');
  await tmode('reject=1');
  await fetch(`${MT}/__world?name=trouble`);
  await post({ action: 'saveConfig', values: { daily_ceiling_cents: '90' } });   // a changed ceiling is a new number: not a new alert, but 'worse' only at +25%, so use a fresh problem below
  await mmode('accountStatus=2');
  await cron('/api/ops/ads-watch');
  await mmode('accountStatus=1'); await tmode('reject=0');
  const keepProblems = (await get('/api/ops/ads-safety')).j;
  const s2 = keepProblems;
  ck('the page lists the failed text and WhatsApp deliveries of the last day, with a plain reason and no number', s2.problems.length >= 2 && s2.problems.every(p => !NUM.test(JSON.stringify(p)) && p.detail) , JSON.stringify(s2.problems.slice(0, 2)));
  ck('and the account alert was still recorded and shown', s2.alerts.open.some(a => a.key === 'account'));
  await post({ action: 'saveConfig', values: { daily_ceiling_cents: '100' } }); await cron('/api/ops/ads-watch');   // back to normal: the account is active again

  console.log('-- heartbeat, from the daily job');
  const hb = await cron('/api/ops/ads-rules?dry=1&now=' + encodeURIComponent(new Date(Date.now() + 5 * 3600e3).toISOString()));
  ck('five hours on with no hourly check, the daily job’s preview says the safety net has gone stale', hb.status === 200 && hb.j.safety?.heartbeat?.stale === true && hb.j.safety.heartbeat.alert.level === 'urgent', JSON.stringify(hb.j.safety));
  const s3 = (await get('/api/ops/ads-safety')).j;
  ck('Settings › Connections and jobs: the alerts row says "Text and WhatsApp ready" by name only, and the Ad safety net job is listed hourly', await (async () => { const pg = (await get('/ops/settings?view=connections')).text; return /Text and WhatsApp ready/.test(pg) && /TWILIO_WHATSAPP_TEMPLATE_SID/.test(pg) && !/ACmock|mock-twilio-token/.test(pg) && /Ad safety net/.test(pg) && /Every hour, at 25 past/.test(pg); })());

  console.log('-- numbers and keys in no log');
  ck('the Change Log (the mock sheet’s log) says what changed and holds no number', /alert number/.test(mockLog()) && !NUM.test(mockLog()));
  ck('the app’s own log holds no number, no Twilio key and no Meta key', !NUM.test(appLog()) && !/mock-twilio-token|ACmock|mock-ads-token/.test(appLog()));
  const ml = await meta();
  ck('Meta saw only reads, the key in a header and never in an address', ml.requests.length > 0 && ml.requests.every(r => !r.write && r.method === 'GET' && r.auth && !r.tokenInUrl));
}

if (PHASE === 'b') {
  console.log('-- no Twilio settings: email only');
  await fetch(`${MT}/__world?name=trouble`);
  const s0 = (await get('/api/ops/ads-safety')).j;
  ck('the channels say "Not set up"', s0.channels.label === 'Not set up' && !s0.channels.sms && !s0.channels.whatsapp);
  ck('Settings › Connections: the row says "Not set up" and lists the five names as not set', await (async () => { const pg = (await get('/ops/settings?view=connections')).text; return /Alerts by text and WhatsApp/.test(pg) && /Not set up\./.test(pg) && (pg.match(/not set</g) || []).length >= 5; })());
  await post({ action: 'saveRecipient', email: 'jacob@embodiedphilosophy.com', patch: { phone: P1 } });
  const t = await post({ action: 'test' });
  ck('a test alert says text and WhatsApp are not set up and nothing went to Twilio', t.status === 200 && t.j.lines.some(l => l.channel === 'whatsapp' && l.status === 'skipped' && /not set up/.test(l.detail)) && t.j.lines.some(l => l.channel === 'sms' && l.status === 'skipped') && (await tw()).total === 0);
  await post({ action: 'saveConfig', values: { daily_ceiling_cents: '100', monthly_ceiling_cents: '5000' } });
  const run = await cron('/api/ops/ads-watch');
  const s1 = (await get('/api/ops/ads-safety')).j;
  ck('alerts are raised anyway, and each one’s log says "WhatsApp not set up" (never silent), Twilio never called', run.status === 200 && s1.alerts.open.length >= 5 && s1.alerts.recent.filter(a => a.level === 'urgent').every(a => a.deliveries.some(d => d.channel === 'whatsapp' && d.status === 'skipped' && d.detail === 'WhatsApp not set up')) && (await tw()).total === 0);
  ck('the app’s log holds no number', !NUM.test(appLog()));
}

if (PHASE === 'c') {
  console.log('-- no Meta key');
  const s0 = (await get('/api/ops/ads-safety')).j;
  await post({ action: 'test' }); await post({ action: 'test' }); await post({ action: 'test' });
  const t4 = await post({ action: 'test' });
  ck('a fourth test in the hour is refused kindly (3 an hour)', t4.status === 429 && /three tests/.test(t4.j.error));
  ck('the Safety net says no token, and the sixth card is RED', s0.token === false && s0.board.length === 1 && s0.board[0].status === 'red' && /No Meta token set/.test(s0.board[0].headline));
  const dry = await cron('/api/ops/ads-watch?dry=1'), real = await cron('/api/ops/ads-watch');
  ck('the cron says Meta isn’t connected, in a dry run and for real, and asks Meta nothing', dry.j.notConnected === true && real.j.notConnected === true && (await meta()).total === 0 && (await tw()).total === 0);
  ck('Check now says there was nothing to check', /isn’t connected/.test((await post({ action: 'checkNow' }, rb)).j.message));
  const hb = await cron('/api/ops/ads-rules?dry=1');
  ck('the daily job says nothing about a silent watchdog (there is no token to watch with)', hb.j.safety?.heartbeat?.stale === false);
}
console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
