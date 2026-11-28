// Real sales in the ads system (lib/ops/adsrealsales.js, adsrules.js, adswatch.js), in node on PGlite, the Meta mock (:4556) and the Kit and Circle mocks (:4555, `/__sales`).
// `source scripts/ops-test/env.sh`, run.sh running. Nothing real is contacted. Covers: matching by campaign tag; no match = Meta's number only; real sales lower than Meta's (a
// turn-off still fires, a raise is refused); sources unreadable (no raise, a plain reason, turn-offs still go by Meta); Kit and Circle never added together; the same decisions as a
// dry run with a lock closed; the safety-net check (alert raised, cooled down, cleared; unreadable shown as a card without stopping the hourly run); no buyer address anywhere.
import crypto from 'node:crypto';
process.removeAllListeners('warning');

const META = 'http://localhost:4556', SHEETS = 'http://localhost:4555';
if (process.env.META_ADS_BASE !== META || process.env.ADS_TEST_DB !== 'pglite') { console.log('FAIL: run `source scripts/ops-test/env.sh` first'); process.exit(1); }
const out = [];
for (const m of ['log', 'warn', 'error', 'info']) { const o = console[m].bind(console); console[m] = (...a) => { out.push(a.map(String).join(' ')); if (m === 'log' && /^(ok|FAIL|--)/.test(String(a[0]))) o(...a); }; }
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
let bad = 0;
const ck = (n, c, extra = '') => { if (c) say('ok  ', n); else { bad++; say('FAIL', n, extra); } };
const j = async p => (await fetch(META + p)).json();
const writes = async () => (await j('/__log')).requests.filter(r => r.write);
const mark = async () => (await writes()).length;
const setMake = m => fetch(`${SHEETS}/v4/spreadsheets/mock-metrics/values/${encodeURIComponent("'Ad Agent'!B1")}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[m]] }) });

await j('/__reset');
for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'META_PAGE_ID', 'META_ADS_LIVE', 'DATABASE_URL', 'POSTGRES_URL']) delete process.env[k];
process.env.METRICS_SHEET_ID = 'mock-metrics';
const M = await import('../../lib/ops/meta-ads.js'), S = await import('../../lib/ops/adsstore.js'), SY = await import('../../lib/ops/adssync.js'), R = await import('../../lib/ops/adsrules.js'), V = await import('../../lib/ops/adsview.js'), DG = await import('../../lib/ops/adsdigest.js');
const TOKEN = 'ads-test-token-' + crypto.randomBytes(12).toString('hex');
const gate = on => { if (on) process.env.META_ADS_LIVE = 'live'; else delete process.env.META_ADS_LIVE; };
const cron = on => { process.env.OPS_LIVE = on ? '1' : '0'; };
const T = SY.nyDate(), at = k => new Date(`${SY.addDays(T, k)}T13:00:00Z`);   // 13:00 UTC, k days from today
const answers = [];
// Real sales (Kit mock): every test campaign carries its own campaign tag, and after each sync the mock Kit is given purchases that AGREE with what Meta reported for each day,
// so the rules in this file behave as before (a raise needs real sales to back Meta's number; ads-realsales.mjs tests the cases where they don't).
const tagOf = c => c.utm?.utm_campaign || '';
async function realAgrees() {
  await fetch('http://localhost:4555/__sales?reset=1');
  if (!(await S.adsTablesExist())) return;
  for (const c of await S.listRows('campaigns')) {
    if (!tagOf(c)) continue;
    const by = {}; for (const r of await S.listResults(c.id, '2000-01-01')) if (!r.ad_id) by[r.date] = (by[r.date] || 0) + r.revenue_cents;
    for (const [day, cents] of Object.entries(by)) if (cents > 0) await fetch(`http://localhost:4555/__sales?add=kit&utm=${encodeURIComponent(tagOf(c))}&count=1&cents=${cents}&day=${day}`);
  }
}
const sync = async (...a) => { const r = await SY.runResultsSync(...a); await realAgrees(); return r; };
// ---- a campaign as Start leaves it: built and switched on at the mock, with its rows
let n = 0;
async function makeCampaign({ goal = 'Purchase', rule = {}, rulesOn = true, status = 'live', budget = 2000, adset = {}, tag = undefined } = {}) {
  n++;
  const was = process.env.META_ADS_LIVE; gate(true);
  const names = ['Meditation', 'Yoga', 'Mindfulness', 'Buddhism', 'Philosophy'];
  const made = await M.buildCampaign({ name: `Rules test ${n}`, goal, type: 'test', link: 'https://example.test/lp?utm_source=meta', cta: 'LEARN_MORE', budget: { perAdSetDailyCents: budget }, spendCapCents: 150000,
    audiences: names.map((nm, i) => ({ name: nm, targeting: { geo_locations: { countries: ['US'] }, interests: [{ id: String(i), name: nm }] } })),
    ads: [1, 2, 3, 4, 5].map(i => ({ name: `Ad ${i}`, images: { '9:16': `h${i}a`, '4:5': `h${i}b`, '1:1': `h${i}c`, '1.91:1': `h${i}d` } })), copySets: [1, 2, 3, 4, 5].map(i => ({ text: `Main ${i}`, headline: `Head ${i}` })) });
  for (const id of [made.made.campaign, ...made.made.adsets, ...made.made.ads]) await M.setStatus(id, 'ACTIVE');
  if (was) gate(true); else gate(false);
  const c = await S.createRow('campaigns', { name: `Rules test ${n}`, goal, structure: 'test', status, utm: tag === null ? {} : { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: tag || `real-test-${n}` }, meta_campaign_id: made.made.campaign, rules_on: rulesOn, budget_mode: 'per_adset', daily_budget_cents: budget * 5, spend_cap_cents: 150000, start_date: SY.addDays(T, -8) });
  const sets = [], ads = [], crs = [];
  for (let k = 0; k < 5; k++) crs.push(await S.createRow('creatives', { campaign_id: c.id, position: k + 1, name: `Ad ${k + 1}` }));
  for (let i = 0; i < 5; i++) {
    const s = await S.createRow('adsets', { campaign_id: c.id, position: i + 1, audience_name: `Interests · ${names[i]}`, daily_budget_cents: budget, meta_adset_id: made.made.adsets[i], status: 'live', ...(adset[i + 1] || {}) }); sets.push(s);
    for (let k = 0; k < 5; k++) ads.push(await S.createRow('ads', { campaign_id: c.id, adset_id: s.id, creative_id: crs[k].id, position: k + 1, name: `Ad ${k + 1}`, meta_ad_id: made.made.ads[i * 5 + k], status: 'live' }));
  }
  const lead = goal === 'Lead';
  const rules = goal === 'Traffic' ? null : await S.createRow('rules', { campaign_id: c.id, metric: lead ? 'cpl' : 'roas', raise_pct: 20, raise_every_hours: 48, raise_threshold: lead ? 1.75 : 1.5, ceiling_cents: 6000, off_threshold: lead ? 2.5 : 1.2, off_min_spend_cents: 4000, pause_weakest_after_days: 0, ...rule });
  return { c, sets, ads, rules };
}
const open = async () => { cron(true); gate(true); await setMake('OFF'); };
const actionsOf = async c => (await S.listRows('actions', { campaign_id: c.id }, { limit: 1000 }));
const decisionsOf = (run, c) => run.campaigns.find(x => x.id === c.id)?.decisions || [];
const byPos = ds => Object.fromEntries(ds.filter(d => d.adset).map(d => [d.adset + (d.kind === 'pause_ad' ? 'a' : ''), d]));
const budgetOf = async s => (await S.getRow('adsets', s.id)).daily_budget_cents;
const metaOf = async id => (await j('/__state')).adsets.find(a => a.id === id);

Object.assign(process.env, { META_ADS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: 'act_MOCK1', META_PIXEL_ID: 'PIX1', META_PAGE_ID: 'PAGE1', META_IG_USER_ID: 'IG1' });
cron(true); gate(false);
const SALES = 'http://localhost:4555';
const sales = p => fetch(`${SALES}/__sales?${p}`).then(r => r.json());
const insights = p => fetch(`${SALES}/__insights?${p}`);
// Give a campaign real sales in the Kit mock and/or the Circle mock: a share of what Meta reported for each day (1 = the same)
async function setSales(made, { kit = 0, circle = 0, tag } = {}) {
  const c = made.c;
  await sales('reset=1');
  const by = {}; for (const r of await S.listResults(c.id, '2000-01-01')) if (!r.ad_id) by[r.date] = (by[r.date] || 0) + r.revenue_cents;
  const t = tag ?? c.utm?.utm_campaign ?? '';
  for (const [day, cents] of Object.entries(by)) for (const [src, share] of [['kit', kit], ['circle', circle]]) if (share > 0 && cents > 0) await sales(`add=${src}&utm=${encodeURIComponent(t)}&count=1&cents=${Math.round(cents * share)}&day=${day}`);
}
const kinds = ds => ds.filter(d => d.adset).sort((a, b) => a.adset - b.adset).map(d => d.kind).join();
const run = async c => R.runMorningRules({ now: at(-3) });
const mtext = async () => JSON.stringify(await (await fetch(`${META}/__log`)).json());
await insights('kit=ok&circle=ok');

say('-- matched by the campaign tag, and real sales agree with Meta: the rules raise as before');
const A = await makeCampaign({}); await SY.runResultsSync(); await setSales(A, { kit: 1 }); await open();
{
  const w0 = await mark(), res = await run(A), ds = decisionsOf(res, A.c), b = byPos(ds);
  ck('the run says the sales were read and the tags are working', res.real?.readable === true && res.real.tagged === true && res.real.kit.ok && res.real.circle.ok);
  ck('raise, raise, hold, turn off, turn off, as before', kinds(ds) === 'raise_budget,raise_budget,hold,turn_off,turn_off', kinds(ds));
  ck('the reason shows both numbers in plain words', /Real sales agree with Meta/.test(b[1].detail) && /for the whole campaign/.test(b[1].detail), b[1].detail);
  ck('and the changes reached the Meta mock (4 writes)', (await mark()) - w0 === 4);
}

say('-- no campaign tag on the ad link: Meta’s number only, so nothing is raised, but a turn-off still happens');
const N = await makeCampaign({ tag: null }); await SY.runResultsSync(); await setSales(N, { kit: 1, tag: 'whatever' });
{
  const b = byPos(decisionsOf(await run(N), N.c)), ds = Object.values(b);
  ck('no raise; the two good ad sets hold with the reason; the two bad ones are still turned off by Meta’s number', ds.map(d => d.kind).join() === 'hold,hold,hold,turn_off,turn_off', ds.map(d => d.kind).join());
  ck('it says “Meta’s number only” and why nothing was raised', /Meta’s number only/.test(b[1].detail) && /no campaign tag on its link/.test(b[1].detail) && /nothing was raised/.test(b[1].detail), b[1].detail);
}

say('-- two campaigns sharing one tag cannot be told apart: both Meta’s number only');
const D1 = await makeCampaign({ tag: 'shared-launch' }), D2 = await makeCampaign({ tag: 'shared-launch' }); await SY.runResultsSync(); await setSales(D1, { kit: 1 });
{
  const r = await run(D1), b = byPos(decisionsOf(r, D1.c));
  ck('neither is raised, and the reason says the tag is shared', b[1].kind === 'hold' && /another campaign uses the same campaign tag/.test(b[1].detail) && decisionsOf(r, D2.c).every(d => d.kind !== 'raise_budget'), b[1].detail);
}

say('-- real sales lower than Meta’s: a turn-off still fires and a raise is refused');
const LO = await makeCampaign({}); await SY.runResultsSync(); await setSales(LO, { kit: 0.6 });
{
  const w0 = await mark(), ds = decisionsOf(await run(LO), LO.c), b = byPos(ds);
  ck('Meta alone would raise two ad sets; at 60% real sales nothing is raised, and ad sets below the line are turned off', !ds.some(d => d.kind === 'raise_budget') && b[2].kind === 'turn_off' && b[3].kind === 'turn_off' && b[1].kind === 'hold', kinds(ds));
  ck('the reason shows Meta’s number, the real number and the number it was judged on', /Meta says 2\.4× for this ad set, real sales say 0\.\d+× for the whole campaign/.test(b[1].detail) && /judged at 1\.44×/.test(b[1].detail), b[1].detail);
  ck('nothing but turn-offs reached Meta (4 writes: ad sets 2 to 5)', (await mark()) - w0 === 4);
}
const ZERO = await makeCampaign({}); await SY.runResultsSync(); await sales('reset=1');
{
  const ds = decisionsOf(await run(ZERO), ZERO.c);
  ck('with tags working but none of this campaign’s sales in Kit or Circle: nothing raised, the weak ad sets and the good ones are all judged on 0×', !ds.some(d => d.kind === 'raise_budget') && ds.filter(d => d.adset).every(d => d.kind === 'turn_off' || d.kind === 'hold'), kinds(ds));
}

say('-- Kit and Circle are never added together');
const BOTH = await makeCampaign({}); await SY.runResultsSync(); await setSales(BOTH, { kit: 0.5, circle: 0.5 });
{
  const ds = decisionsOf(await run(BOTH), BOTH.c), b = byPos(ds);
  ck('half in each: the larger source counts (about 0.66×), not the sum (about 1.3×), so nothing is raised', !ds.some(d => d.kind === 'raise_budget') && Number((/real sales say ([\d.]+)×/.exec(b[1].detail) || [])[1]) < 0.9, b[1].detail);
}

say('-- the sales cannot be read: nothing is raised, with the reason; turn-offs still go by Meta’s number');
const UN = await makeCampaign({}); await SY.runResultsSync(); await setSales(UN, { kit: 1 });
await insights('kit=fail&circle=fail');
{
  const res = await run(UN), ds = decisionsOf(res, UN.c), b = byPos(ds);
  ck('the run says neither source could be read', res.real.readable === false && !res.real.kit.ok && !res.real.circle.ok && res.real.kit.note.length > 0);
  ck('no raise; the reason says it couldn’t read the real sales', kinds(ds) === 'hold,hold,hold,turn_off,turn_off' && /couldn’t read your real sales/.test(b[1].detail) && /nothing was raised/.test(b[1].detail), b[1].detail);
}
await insights('kit=fail&circle=ok');
const HALF = await makeCampaign({}); await SY.runResultsSync(); await setSales(HALF, { circle: 1 }); await insights('kit=fail&circle=ok');
{
  const res = await run(HALF);
  ck('with Kit unreadable and Circle readable the real sales are the Circle ones: raised, and the run says which one failed', res.real.readable && !res.real.kit.ok && res.real.circle.ok && kinds(decisionsOf(res, HALF.c)) === 'raise_budget,raise_budget,hold,turn_off,turn_off', kinds(decisionsOf(res, HALF.c)));
}
await insights('kit=ok&circle=ok');

say('-- tagging does not seem to work at all (no recent purchase arrived with a tag): Meta’s number only, no mass turn-off by real sales');
const NT = await makeCampaign({}); await SY.runResultsSync(); await sales('reset=1&untagged=1');
{
  const res = await run(NT), ds = decisionsOf(res, NT.c), b = byPos(ds);
  ck('the run says tags are not arriving; nothing is raised and the good ad sets are not turned off', res.real.tagged === false && !ds.some(d => d.kind === 'raise_budget') && b[1].kind === 'hold' && b[2].kind === 'hold' && /none of your recent Kit or Circle purchases arrived with a campaign tag/.test(b[1].detail), b[1].detail);
}
await sales('reset=1');

say('-- a lock closed: the very same decisions, as dry runs, and nothing reaches Meta');
const DR = await makeCampaign({}), DRA = await makeCampaign({}); await SY.runResultsSync();
{
  await setMake('AUTO'); cron(true); gate(true);
  await setSales(DR, { kit: 0.6 });
  const w0 = await mark(), res = await run(DR), ds = decisionsOf(res, DR.c);
  ck('Make’s Ad Agent on: locks closed, same decisions as the open run (real lower: hold, turn off ×4... as before)', res.locks.open === false && kinds(ds) === 'hold,turn_off,turn_off,turn_off,turn_off' && ds.every(d => d.dry_run), kinds(ds));
  await setSales(DRA, { kit: 1 }); const res2 = await R.runMorningRules({ now: at(-2) }), ds2 = decisionsOf(res2, DRA.c);
  ck('with real sales agreeing it would raise two and turn off two, all dry runs, and the Meta mock saw no write', kinds(ds2) === 'raise_budget,raise_budget,hold,turn_off,turn_off' && ds2.every(d => d.dry_run) && (await mark()) === w0, kinds(ds2) + ' ' + ds2.map(d => d.dry_run) + ' ' + ((await mark()) - w0));
}

say('-- the hourly safety net: Meta reports purchases but Kit and Circle show none');
{
  await open();
  const W = await import('../../lib/ops/adswatch.js'), RS = await import('../../lib/ops/adsrealsales.js'), Q = await import('../../lib/ops/adsdb.js');
  const wm = q => fetch(`${META}/__mode?${q}`), world = nm => fetch(`${META}/__world?name=${nm}`);
  const team = [{ name: 'Jacob Test', email: 'director@example.test', director: true, roles: [] }];
  const mails = [], deps = { sendEmail: async m => { mails.push(m); return {}; }, emailReady: () => true };
  const NOON = new Date(`${T}T17:00:00Z`), hrs = (d, h) => new Date(d.getTime() + h * 3600e3), keys = r => r.alerts.map(a => a.key).sort().join();
  await world('healthy'); await wm(`pixelAgeHours=${1 + (Date.now() - NOON.getTime()) / 3600e3}`);
  await S.createRow('campaigns', { name: 'Kali winter (built in Ops)', goal: 'Purchase', status: 'live', meta_campaign_id: 'w_ops', utm: { utm_campaign: 'ops-built-kali' }, created_by: 'test' });
  const watch = (now, o = {}) => W.runWatch({ now, team, base: 'https://ops.example.test', deps, ...o });
  const dayCents = 4400, days = Array.from({ length: 3 }, (_, i) => SY.addDays(T, -(i + 1)));   // the mock: $20 a day at 2.2×, three full days before today
  const give = async (src, share) => { await sales('reset=1'); await sales('add=kit&utm=some-other-launch&count=1&cents=5000&day=' + days[0]); for (const d of days) await sales(`add=${src}&utm=ops-built-kali&count=1&cents=${Math.round(dayCents * share)}&day=${d}`); };
  await sales('reset=1');
  await sales('add=kit&utm=some-other-launch&count=1&cents=5000&day=' + days[0]);   // so the tags are known to arrive, and one tagged sale belongs to no campaign here
  const w1 = await watch(NOON), n1 = w1.alerts.find(a => a.key === 'sales-none');
  ck('purchases in Meta, none in Kit or Circle: an alert, IMPORTANT (not urgent), sent', !!n1 && n1.level === 'important' && !!n1.send, JSON.stringify(w1.alerts.map(a => [a.key, a.level])));
  ck('the card is amber and says what to look at', w1.board.find(c => c.id === 'sales')?.status === 'amber' && /to look at/.test(w1.board.find(c => c.id === 'sales').headline));
  const nb = (await S.peekRows('alerts', { key: 'sales-none' }))[0]?.body || '';
  ck('the alert says what it means and what to do, in plain words', /Meta says these brought purchases, but no matching purchase appears in Kit or Circle/.test(nb) && /What to do/.test(nb) && /will not raise/.test(nb), nb);
  const w2 = await watch(hrs(NOON, 0.3));
  ck('twenty minutes later it is not sent again (cooldown)', !w2.alerts.find(a => a.key === 'sales-none')?.send);
  const sentBefore = mails.length;
  await give('kit', 1);
  const w3 = await watch(hrs(NOON, 2));
  ck('once Kit shows the sales, the alert clears and the card is green', !keys(w3).includes('sales-none') && w3.board.find(c => c.id === 'sales').status === 'green' && /agree/.test(w3.board.find(c => c.id === 'sales').headline), JSON.stringify(w3.board.find(c => c.id === 'sales')));
  await give('kit', 0.3);
  const w4 = await watch(hrs(NOON, 3)), g4 = w4.alerts.find(a => a.key === 'sales-gap');
  ck('real sales at 30% of Meta’s: the "far below" alert, IMPORTANT, with both numbers', !!g4 && g4.level === 'important' && /Meta 2\.20×, real sales 0\.66×/.test((await S.peekRows('alerts', { key: 'sales-gap' }))[0]?.body || ''), JSON.stringify(await S.peekRows('alerts', { key: 'sales-gap' })));
  await give('kit', 1);
  await insights('kit=fail&circle=fail');
  const w5 = await watch(hrs(NOON, 4)), c5 = w5.board.find(c => c.id === 'sales'), st5 = await W.getWatchState();
  ck('Kit and Circle both unreadable: a clear card, no sales alert, nothing crashed', c5.status === 'amber' && /Couldn’t read your real sales/.test(c5.headline) && /will not raise any ad budget/.test(c5.detail) && !/sales-/.test(keys(w5)), JSON.stringify(c5));
  ck('the heartbeat is unaffected: Meta was read, the safety net says it checked, no heartbeat alert', w5.board.find(c => c.id === 'heartbeat').status === 'green' && !keys(w5).includes('heartbeat') && st5.last_ok_at === hrs(NOON, 4).toISOString());
  const st = await RS.readRealState(), lines = RS.realLines(st, (await S.peekRows('campaigns', { meta_campaign_id: 'w_ops' }))[0].id, hrs(NOON, 4).getTime());
  ck('the page shows what the last reading said (unreadable, in plain words)', lines.length === 1 && /couldn’t be read at the last check/.test(lines[0]), JSON.stringify(lines));
  await insights('kit=ok&circle=ok'); await give('kit', 1);
  const w6 = await watch(hrs(NOON, 5)), st6 = await RS.readRealState(), lines6 = RS.realLines(st6, (await S.peekRows('campaigns', { meta_campaign_id: 'w_ops' }))[0].id, hrs(NOON, 5).getTime());
  ck('after it recovers the page shows both numbers and the sale that matched no campaign', /Meta says 2\.2×; real sales say 2\.2×/.test(lines6[0]) && /no matching campaign tag/.test(lines6[1]), JSON.stringify(lines6));
  const pv = await watch(hrs(NOON, 6), { preview: true });
  ck('a preview raises no alert row and writes no state', pv.preview === true && (await S.peekRows('settings', { key: 'real_sales_state' }))[0].value.at === st6.at);
  const early = await watch(new Date(`${T}T12:00:00Z`));   // 07:00 or 08:00 in New York: yesterday's sales have not had time to arrive
  ck('early in the morning it waits rather than compare (card green, says why)', /Waiting until mid-morning/.test(early.board.find(c => c.id === 'sales').headline) && !keys(early).includes('sales-none'));
}

say('-- no buyer address, name or id was kept or logged anywhere');
{
  const dump = JSON.stringify([await S.peekRows('settings', {}, { limit: 200 }), await S.listRows('actions', {}, { limit: 5000 }), await S.listRows('campaigns')]);
  ck('the saved rows hold no marker address or name', !/example\.invalid|Marker|MARKER|KITTXN/i.test(dump));
  ck('nothing printed by the code under test names a buyer', !out.some(l => /example\.invalid|Marker Buyer|KITTXN/i.test(l)));
  ck('the saved real-sales note is aggregates only (day windows, counts, cents)', Object.keys(JSON.parse(JSON.stringify((await S.peekRows('settings', { key: 'real_sales_state' }))[0].value))).sort().join() === 'at,campaigns,readable,sources,tagged,unmatched,window');
  ck('the key and token appear in no log line', !out.some(l => l.includes(TOKEN)));
}
say(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
