// The ad safety net's watchdog (lib/ops/adswatch.js) in node on an in-process Postgres (PGlite), the Meta mock (:4556, its "whole ad account" worlds) and the Twilio mock (:4557).
// `source env.sh`, run.sh running. Nothing real: email goes to a recorder, the numbers are made up, the database is PGlite, Meta and Twilio are the mocks.
//   - no Meta token: nothing is read, "No Meta token set" is red; a preview records nothing, sends nothing and makes no table
//   - a HEALTHY account raises nothing (all six cards green), a TROUBLE account (NOT built in Ops: past its end time, no end and no cap, spending with no purchases, a spike, a low return,
//     a rejected ad) raises each of them at the right level; pixel quiet, account status, payment; pacing against the ceilings (and "Set your ceilings" while they are unset)
//   - levels go to the right channels; quiet hours hold IMPORTANT, not URGENT; the same problem doesn't ping twice; clearing sends one resolved note
//   - the heartbeat: Meta unreadable (important, then urgent after 3 hours), the daily job notices a silent watchdog, no token after it worked, recovery resolves
//   - Meta saw only reads (never a write), the key never in a URL, no phone number in any log
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556' || process.env.TWILIO_BASE !== 'http://localhost:4557') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite';
const KEY = 'mock-ads-token-for-the-safety-test', TOKEN = 'mock-twilio-token-not-real';
const metaOn = on => { for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'META_PAGE_ID']) delete process.env[k]; if (on) Object.assign(process.env, { META_ADS_TOKEN: KEY, META_AD_ACCOUNT_ID: 'act_MOCK1', META_PIXEL_ID: 'PIX1', META_PAGE_ID: 'PAGE1' }); };
Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACmocktwilioaccount0000000000000000', TWILIO_AUTH_TOKEN: TOKEN, TWILIO_SMS_FROM: '+15005550006', TWILIO_WHATSAPP_FROM: '+14155238886' });
const logs = []; for (const k of ['log', 'error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const t = a.map(String).join(' '); if (!/^(ok |FAIL|--)/.test(t)) logs.push(t); o(...a); }; }
const MT = 'http://localhost:4556', TW = 'http://localhost:4557';
const meta = async (q = '') => (await fetch(`${MT}/__log${q}`)).json(), tw = async (q = '') => (await fetch(`${TW}/__log${q}`)).json();
const mmode = q => fetch(`${MT}/__mode?${q}`), world = n => fetch(`${MT}/__world?name=${n}`);
await fetch(`${MT}/__reset`); await fetch(`${TW}/__reset`);

const W = await import('../../lib/ops/adswatch.js'), A = await import('../../lib/ops/alerts.js'), S = await import('../../lib/ops/adsstore.js'), Q = await import('../../lib/ops/adsdb.js');
const P1 = '+15555550142', P2 = '+15555550177';
const team = [{ name: 'Jacob Test', email: 'director@example.test', director: true, roles: [] }, { name: 'Rebecka Test', email: 'ads@example.test', roles: ['Ads'], director: false }, { name: 'Floss Test', email: 'floss@example.test', roles: ['Project Manager'], director: false }];
const mails = []; const deps = { sendEmail: async m => { mails.push(m); return {}; }, emailReady: () => true };
// New York clock, from today's date (the mock's stop times are relative to the real moment, so the pretend moments stay within a day of it)
const NY = 'America/New_York', todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: NY });
const at = (offsetDays, hhmm) => { const d = new Date(Date.parse(`${todayNY()}T12:00:00Z`) + offsetDays * 86400e3).toISOString().slice(0, 10); for (const off of ['-05:00', '-04:00']) { const t = new Date(`${d}T${hhmm}:00${off}`); if (t.toLocaleTimeString('en-GB', { timeZone: NY, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) === hhmm) return t; } };
const NOON = at(0, '12:00'), NIGHT = at(0, '23:00'), MORNING = at(1, '07:30');
const hrs = (d, h) => new Date(d.getTime() + h * 3600e3);
// the mock ages the pixel from the real moment; we pretend a different one, so allow for the difference
const pixel = h => mmode(`pixelAgeHours=${h + (Date.now() - NOON.getTime()) / 3600e3}`);
const run = (now, o = {}) => W.runWatch({ now, team, base: 'https://ops.example.test', deps, ...o });
const keys = r => r.alerts.map(a => a.key).sort();
const lvl = (r, k) => r.alerts.find(a => a.key === k)?.level;
const tables = async () => ({ ads: (await Q.adsQuery("SELECT to_regclass('ads_campaigns') AS t"))[0].t, log: (await Q.adsQuery("SELECT to_regclass('alerts_log') AS t"))[0].t, settings: (await Q.adsQuery("SELECT to_regclass('ads_settings') AS t"))[0].t });

console.log('-- no Meta token: nothing is read; the safety net says so, in red');
metaOn(false);
const nt = await run(NOON);
ck('nothing to watch, no request to Meta', nt.notConnected === true && (await meta()).total === 0);
const hb0 = W.heartbeatView(null, await A.getConfig(), NOON, { token: false });
ck('"No Meta token set" is a red state with what to do', hb0.status === 'red' && /No Meta token set/.test(hb0.headline) && /META_ADS_TOKEN/.test(hb0.detail));
metaOn(true);
const hb1 = W.heartbeatView(null, await A.getConfig(), NOON, { token: true });
ck('with a token but no check yet it is amber "waiting for the first hourly check"', hb1.status === 'amber' && /first hourly check/.test(hb1.headline));
ck('with a token and no ad account it is red', W.heartbeatView(null, await A.getConfig(), NOON, { token: true, accountSet: false }).status === 'red');

console.log('-- a preview records nothing, sends nothing and makes no table (a trouble account, NOT built in Ops, no ceilings set yet)');
await world('trouble'); await meta('?reset=1');
const pv = await run(NOON, { preview: true });
ck('the preview finds each problem: ' + 'ad-issues, low-return, open-ended, past-end, spike, zero-results', keys(pv).join() === 'ad-issues,low-return,open-ended,past-end,spike,zero-results', keys(pv).join());
ck('and says who it would tell (names and channels), sending nothing', pv.alerts.every(a => a.would && a.would.length === 2) && mails.length === 0 && (await tw()).total === 0);
const t0 = await tables();
ck('no table was made (the database is untouched)', !t0.ads && !t0.log && !t0.settings, JSON.stringify(t0));
ck('with no ceilings set the spending check stays off ("Not set"), and no pacing alert is made', !keys(pv).some(k => k.startsWith('pacing')) && pv.board.find(c => c.id === 'spend').status === 'amber' && /Not set/.test(pv.board.find(c => c.id === 'spend').headline));
ck('levels: past its end time URGENT; low return with large spend URGENT; spike URGENT; no purchases important; no end and no cap important; a rejected ad important',
  lvl(pv, 'past-end') === 'urgent' && lvl(pv, 'low-return') === 'urgent' && lvl(pv, 'spike') === 'urgent' && lvl(pv, 'zero-results') === 'important' && lvl(pv, 'open-ended') === 'important' && lvl(pv, 'ad-issues') === 'important');
const mlog = await meta();
ck('Meta saw only reads, the key in a header and never in an address', mlog.requests.length > 0 && mlog.requests.every(r => !r.write && r.method === 'GET' && r.auth && !r.tokenInUrl));
ck('it read the whole account: campaigns, ad sets, ads with issues, the account, the pixel, and two sets of results', ['campaigns', 'adsets', 'ads', 'insights'].every(p => mlog.requests.some(r => r.path.endsWith(p))) && mlog.requests.some(r => r.path === 'act_MOCK1') && mlog.requests.some(r => r.path === 'PIX1'));
const flaggedNames = pv.flagged ? pv.flagged : 0;
ck('the preview counts the campaigns that need a look (the five; the rejected ad is in one of them)', flaggedNames === 5, String(flaggedNames));

console.log('-- long lists come in pages (Meta’s own paging): the same answer');
await mmode('pageSize=2'); const pg = await run(NOON, { preview: true }); await mmode('pageSize=0');
ck('with pages of two the safety net still sees every campaign', keys(pg).join() === keys(pv).join(), keys(pg).join());

console.log('-- a healthy account raises nothing');
await world('healthy'); await mmode('pageSize=0');
await A.saveConfig({ daily_ceiling_cents: '100', monthly_ceiling_cents: '5000' }, 'Jacob Test', async () => {});
await A.saveRecipient('director@example.test', { phone: P1 }, 'Jacob Test', team); await A.saveRecipient('ads@example.test', { phone: P2 }, 'Jacob Test', team);
const h1 = await run(NOON);
ck('no alert, no message, and every card green', h1.alerts.length === 0 && mails.length === 0 && (await tw()).total === 0 && h1.board.every(c => c.status === 'green'), JSON.stringify(h1.board.map(c => [c.id, c.status])));
ck('the seven cards are there', h1.board.map(c => c.id).sort().join() === 'account,forgotten,heartbeat,sales,spend,spike,tracking');
const st = await W.getWatchState();
ck('the run is remembered: when it last read Meta, the numbers, the board', st.last_ok_at === NOON.toISOString() && st.numbers.spent_today_cents === 1000 && st.numbers.daily_ceiling_cents === 10000 && st.numbers.open_ended === 0 && st.board.length === 7);
ck('the alert log table was made only now (the first real run), and holds no alert', (await tables()).log && (await S.peekRows('alerts', {})).length === 0);

console.log('-- ceilings');
const pace = async (daily, monthly) => { await A.saveConfig({ daily_ceiling_cents: daily, monthly_ceiling_cents: monthly }, 'J', async () => {}); return run(NOON, { preview: true }); };
let pc = await pace('', '');
ck('both ceilings empty: the spending check is off and the card says "Not set"', !keys(pc).length && pc.board.find(c => c.id === 'spend').status === 'amber' && /No daily ceiling set/.test(pc.board.find(c => c.id === 'spend').detail));
pc = await pace('12', '5000');
ck('spent today $10 against a $12 ceiling: IMPORTANT at 80% (not yet urgent)', lvl(pc, 'pacing-daily') === 'important' && pc.alerts.find(a => a.key === 'pacing-daily').title.includes('close to'));
pc = await pace('9', '5000');
ck('past the daily ceiling: URGENT, naming what is spending the most', lvl(pc, 'pacing-daily') === 'urgent');
pc = await pace('100', '200');
ck('on course to pass the monthly ceiling: URGENT, with the projection', lvl(pc, 'pacing-month') === 'urgent' && /on course|past your monthly/.test(pc.alerts.find(a => a.key === 'pacing-month').title));
pc = await pace('100', '5000');
ck('well inside both: nothing', !keys(pc).length && pc.board.find(c => c.id === 'spend').status === 'green');

console.log('-- the trouble account, for real: who hears what, on which channel');
await world('trouble'); mails.length = 0; await tw('?reset=1');
await A.saveConfig({ daily_ceiling_cents: '100', monthly_ceiling_cents: '5000' }, 'J', async () => {});
const t1 = await run(hrs(NOON, 1));
const k1 = keys(t1);
ck('every check raises its alert (12): the six from before, the daily and monthly pacing', k1.join() === 'ad-issues,low-return,open-ended,pacing-daily,pacing-month,past-end,spike,zero-results'.split(',').sort().join(), k1.join());
const urgent = t1.alerts.filter(a => a.level === 'urgent'), important = t1.alerts.filter(a => a.level === 'important');
ck('5 urgent (past end, low return, spike, both pacing) and 3 important', urgent.length === 5 && important.length === 3);
let L = (await tw()).requests;
ck('texts: urgent only, to both people (5 × 2)', L.filter(x => x.channel === 'sms').length === 10);
ck('WhatsApp: urgent and important (8 × 2)', L.filter(x => x.channel === 'whatsapp').length === 16);
ck('email: all eight, to both (8 × 2)', mails.length === 16 && mails.filter(m => /^\[URGENT\]/.test(m.subject)).length === 10);
const pastBody = L.find(x => x.channel === 'whatsapp' && /still running after/.test(x.Body || ''));
ck('the message names the campaign, gives the numbers, says what to do and links to the page', pastBody && /still running after/.test(pastBody.Body) && /What to do/.test(pastBody.Body) && /https:\/\/ops\.example\.test\/ops\/ads\?view=safety/.test(pastBody.Body) && /end time was/.test(pastBody.Body), pastBody?.Body);
const zeroBody = mails.find(m => /no purchases or sign-ups/.test(m.subject));
ck('a campaign with no purchases: "$120" and the days, in plain English', zeroBody && /Spring yoga to sale \(\$120\)/.test(zeroBody.html) && /last 3 days/.test(zeroBody.html), zeroBody?.subject);
const lowBody = mails.find(m => /bringing back less than/.test(m.subject));
ck('a low return gives the return and the spend', lowBody && /Weak return test returned 0\.60× on \$150/.test(lowBody.html) && /1\.2×/.test(lowBody.html));
const spikeBody = mails.find(m => /spending far more than usual/.test(m.subject));
ck('a spike names the campaign, what it spent so far and what is usual', spikeBody && /Boosted post \(\$300 so far, usually \$20 a day\)/.test(spikeBody.html), spikeBody?.html.slice(0, 300));
const dailyBody = mails.find(m => /past your daily ceiling/.test(m.subject));
ck('the daily pacing alert gives today’s spend, the ceiling and the biggest spender', dailyBody && /\$323/.test(dailyBody.html) && /\$100/.test(dailyBody.html) && /Boosted post/.test(dailyBody.html));
const stT = await W.getWatchState();
ck('what needs a look is kept for the Safety page: not-built-in-Ops campaigns have a Meta Ads Manager link (the account number, never the key), and no Ops page', stT.flagged.length === 5 && stT.flagged.every(f => !f.ops_id && /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=/.test(f.manager_url) && !f.manager_url.includes(KEY)));

console.log('-- nothing is repeated inside its gap; a campaign built in Ops links to its own page');
mails.length = 0; await tw('?reset=1');
const camp = await S.createRow('campaigns', { name: 'Kali winter (built in Ops)', goal: 'Purchase', status: 'live', meta_campaign_id: 'w_ops', end_date: new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10), created_by: 'test' });
const t2 = await run(hrs(NOON, 1.2));
ck('20 minutes later the old alerts stay quiet (cooldown) and one new one appears: an Ops campaign past its end date, URGENT, linking to its own page', t2.alerts.filter(a => a.send).map(a => a.key).join() === 'past-ops-end' && lvl(t2, 'past-ops-end') === 'urgent', JSON.stringify(t2.alerts.filter(a => a.send).map(a => a.key)));
const opsAlert = (await S.peekRows('alerts', { key: 'past-ops-end' }))[0];
ck('that alert says what was meant (end date), and links to /ops/ads/<id> with Pause and Reverse', opsAlert.link === `/ops/ads/${camp.id}` && /Kali winter \(built in Ops\)|w_ops|Ops built: Kali/.test(opsAlert.body) && /Pause/.test(opsAlert.body));
ck('the Safety page’s list shows that one with an Ops link as well as the Meta link', (await W.getWatchState()).flagged.some(f => f.ops_id === camp.id && f.manager_url));
const t2b = await run(hrs(NOON, 2.3));
ck('an hour after the first send, each URGENT alert is reminded once (not the important ones)', t2b.alerts.filter(a => a.send === 'repeat').every(a => a.level === 'urgent') && t2b.alerts.filter(a => a.send === 'repeat').length === 6, JSON.stringify(t2b.alerts.map(a => [a.key, a.action])));

console.log('-- pixel, account and payment');
await S.updateRow('campaigns', camp.id, { end_date: '2099-01-01' });   // somebody extended that Ops campaign, so it is no longer late
await world('healthy'); await A.saveConfig({ daily_ceiling_cents: '100', monthly_ceiling_cents: '5000' }, 'J', async () => {});
await pixel(30); let x = await run(NOON, { preview: true });
ck('the pixel quiet for 30 hours with ads running: URGENT, "gone quiet"', lvl(x, 'pixel') === 'urgent' && /gone quiet/.test(x.alerts.find(a => a.key === 'pixel').title), JSON.stringify(x.alerts.map(a => a.key)));
ck('the tracking card is red', x.board.find(c => c.id === 'tracking').status === 'red');
await pixel(14); x = await run(NOON, { preview: true });
ck('quiet for 14 hours: only a ROUTINE note (it goes in the digest, not its own message)', lvl(x, 'pixel-early') === 'routine' && !x.alerts.find(a => a.key === 'pixel') && !x.alerts[0].send);
await pixel(2); await mmode('accountStatus=2'); x = await run(NOON, { preview: true });
ck('an account that is disabled: URGENT', lvl(x, 'account') === 'urgent' && /disabled/.test(x.alerts.find(a => a.key === 'account').title) && x.board.find(c => c.id === 'account').status === 'red');
await mmode('accountStatus=9'); x = await run(NOON, { preview: true });
ck('a payment in its grace period: URGENT, as a payment problem', lvl(x, 'payment') === 'urgent' && /payment problem/.test(x.alerts.find(a => a.key === 'payment').title));
await mmode('accountStatus=1&noPayment=1'); x = await run(NOON, { preview: true });
ck('no payment method on an active account: URGENT', lvl(x, 'payment') === 'urgent' && /no payment method/.test(x.alerts.find(a => a.key === 'payment').title));
await mmode('noPayment=0');
ck('and a healthy account again raises nothing', !(await run(NOON, { preview: true })).alerts.length);

console.log('-- clearing: one resolved note each, at important level, none twice');
await world('healthy'); mails.length = 0; await tw('?reset=1');
const open0 = (await S.peekRows('alerts', { state: 'open' })).map(r => r.key).sort();
const c1 = await run(hrs(NOON, 3));
ck('the eight earlier problems plus the Ops one are all cleared by a run that found nothing', c1.resolved.length === open0.length && open0.length === 9, `${open0.length} ${c1.resolved.length}`);
ck('ONE resolved note each, by email and WhatsApp to both (9 × 2 each), and no text', mails.length === 18 && mails.every(m => /Resolved:/.test(m.subject)) && (await tw()).requests.every(r => r.channel === 'whatsapp') && (await tw()).total === 18);
ck('no open alert is left', (await S.peekRows('alerts', { state: 'open' })).length === 0);
mails.length = 0; await tw('?reset=1'); await run(hrs(NOON, 4));
ck('and nothing more is said an hour later', mails.length === 0 && (await tw()).total === 0);

console.log('-- quiet hours: IMPORTANT waits for the morning, URGENT does not');
await world('trouble'); mails.length = 0; await tw('?reset=1');
const q1 = await run(NIGHT);
L = (await tw()).requests;
ck('at 23:00 the urgent ones go out (texts and WhatsApp)', L.filter(r => r.channel === 'sms').length === 10 && mails.some(m => /^\[URGENT\]/.test(m.subject)));
const heldRows = (await S.peekRows('alerts', { state: 'open' })).filter(r => r.level === 'important');
ck('the 3 important ones are held for 2 people each, with the log saying so', heldRows.length === 3 && heldRows.every(r => r.queued.length === 2 && r.deliveries.every(l => l.status === 'queued')) && !mails.some(m => /Ads: (A campaign has no end date|1 running campaign)/.test(m.subject) && !/^\[URGENT\]/.test(m.subject)));
mails.length = 0; await tw('?reset=1');
const q2 = await run(MORNING);
ck('at 07:30 the held ones go (email and WhatsApp, each person, each alert)', q2.flushed.length === 6 && mails.filter(m => !/^\[URGENT\]/.test(m.subject)).length >= 6 && (await S.peekRows('alerts', { state: 'open' })).every(r => r.queued.length === 0));

console.log('-- the safety net watching itself (heartbeat)');
await world('healthy'); await run(hrs(MORNING, 1)); mails.length = 0; await tw('?reset=1');
await world('trouble'); await run(hrs(MORNING, 2));     // open alerts again, and a good read at MORNING+2h
const T0 = hrs(MORNING, 2), openBefore = (await S.peekRows('alerts', { state: 'open' })).length;
mails.length = 0; await tw('?reset=1'); await mmode('failReads=1');
const hbA = await run(hrs(T0, 1));
ck('Meta unreadable for 1 hour: an IMPORTANT "couldn’t be read", with Meta’s own words', lvl(hbA, 'heartbeat') === 'important' && /couldn’t be read/.test(hbA.alerts.find(a => a.key === 'heartbeat').title), JSON.stringify(hbA.alerts.map(a => [a.key, a.level])));
const hbRow = (await S.peekRows('alerts', { key: 'heartbeat' }))[0];
ck('the error is plain (Meta’s message), with no key in it', /Meta said/.test(hbRow.body) && !JSON.stringify(hbRow).includes(KEY));
ck('open alerts from before are NOT closed just because the read failed', (await S.peekRows('alerts', { state: 'open' })).length === openBefore + 1);
const hbB = await run(hrs(T0, 4));
ck('after 3 hours it is URGENT: "hasn’t been able to check your account since <time>"', lvl(hbB, 'heartbeat') === 'urgent' && /hasn’t been able to check your account since/.test(hbB.alerts.find(a => a.key === 'heartbeat').title) && hbB.board.find(c => c.id === 'heartbeat').status === 'red');
ck('and the urgent one went by text too', (await tw()).requests.some(r => r.channel === 'sms' && /can’t see your account|check your account|couldn/.test(r.Body)));
const before = (await meta()).total;
const hbC = await W.runHeartbeat({ now: hrs(T0, 6), team, base: 'https://ops.example.test', deps });
ck('the daily job’s check notices the silence from the saved note alone (it does not call Meta)', hbC.stale === true && hbC.hours >= 5 && (await meta()).total === before && hbC.alert.level === 'urgent');
const view = W.heartbeatView(await W.getWatchState(), await A.getConfig(), hrs(T0, 6));
ck('the page itself turns red without any job running', view.status === 'red' && /hasn’t been able to check your account since/.test(view.headline));
ck('a heartbeat while it is fine says nothing', (await W.runHeartbeat({ now: hrs(MORNING, 2.5), team, deps, preview: true })).stale === false);
delete process.env.META_ADS_TOKEN; await mmode('failReads=0');
const nk = await run(hrs(T0, 7));
ck('the token taken away after it worked is an error too, not "nothing to do"', !nk.notConnected && lvl(nk, 'heartbeat') === 'urgent');
metaOn(true); mails.length = 0; await tw('?reset=1');
const back = await run(hrs(T0, 8));
ck('Meta readable again: the heartbeat alert clears with one note, and the real checks go on', back.resolved.some(r => r.key === 'heartbeat') && mails.filter(m => /Resolved: .*check your account/.test(m.subject)).length === 2 && (await W.getWatchState()).last_error === '' && W.heartbeatView(await W.getWatchState(), await A.getConfig(), hrs(T0, 8)).status === 'green');

console.log('-- Meta and logs');
const all = await meta();
ck('across all of it Meta saw only reads (no write, ever), and the key was never in an address', all.requests.every(r => !r.write && r.method === 'GET' && !r.tokenInUrl) && !JSON.stringify(all).includes(KEY));
const con = logs.join('\n'), rows = JSON.stringify(await S.peekRows('alerts', {}));
ck('no log line holds a phone number, the Twilio key or the Meta key', !/5550142|5550177|mock-twilio-token|ACmock|mock-ads-token/.test(con), con.slice(0, 200));
ck('no alert row holds a phone number', !/5550142|5550177/.test(rows));
console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
