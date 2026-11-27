// Ads PR 3, the results sync, the morning rules and Reverse, in node (`source scripts/ops-test/env.sh`, `bash scripts/ops-test/run.sh` first). The libraries run in this
// process against an in-process Postgres (PGlite) and the Meta mock (:4556, the same week of results every time: five ad sets with return 2.4 / 1.8 / 1.2 / 0.8 / 0.4 and cost
// per lead $1.00 / 1.50 / 2.00 / 3.00 / 5.00); the Make Ad Agent setting is the mock Revenue & Metrics sheet (:4555). Nothing real is contacted.
//   sync   : upserts a week idempotently, only reads, tolerates a Meta error, token only.   rules: raise / hold / turn off exactly as the settings say (72-hour average, 48-hour steps,
//   the ceiling, the minimum spend, Traffic none, Lead by cost per lead, pause the weakest ad), every decision recorded with from / to.
//   locks  : with all three open the changes reach the mock; close any ONE (jobs, switch, Make's Ad Agent) and the same decisions are dry runs and the mock's write log is empty.
//   reverse: puts the earlier value back, once, refuses after a later change, nothing to reverse for a dry run.
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

say('-- the results sync with no key: nothing happens and nothing is asked of Meta');
{
  const r = await SY.runResultsSync();
  ck('no ads key: it says Meta isn’t connected, and the mock saw no request', r.notConnected === true && r.campaigns === 0 && (await j('/__log')).total === 0, JSON.stringify(r));
}
Object.assign(process.env, { META_ADS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: 'act_MOCK1', META_PIXEL_ID: 'PIX1', META_PAGE_ID: 'PAGE1', META_IG_USER_ID: 'IG1' });
cron(true); gate(false);
{
  const r = await SY.runResultsSync();
  ck('a key but no campaigns (and no tables yet): it does nothing, makes no tables', r.campaigns === 0 && r.rows === 0 && !(await S.adsTablesExist()), JSON.stringify(r));
}

// ---- a campaign as Start leaves it: built and switched on at the mock, with its rows
let n = 0;
async function makeCampaign({ goal = 'Purchase', rule = {}, rulesOn = true, status = 'live', budget = 2000, adset = {} } = {}) {
  n++;
  const was = process.env.META_ADS_LIVE; gate(true);
  const names = ['Meditation', 'Yoga', 'Mindfulness', 'Buddhism', 'Philosophy'];
  const made = await M.buildCampaign({ name: `Rules test ${n}`, goal, type: 'test', link: 'https://example.test/lp?utm_source=meta', cta: 'LEARN_MORE', budget: { perAdSetDailyCents: budget }, spendCapCents: 150000,
    audiences: names.map((nm, i) => ({ name: nm, targeting: { geo_locations: { countries: ['US'] }, interests: [{ id: String(i), name: nm }] } })),
    ads: [1, 2, 3, 4, 5].map(i => ({ name: `Ad ${i}`, images: { '9:16': `h${i}a`, '4:5': `h${i}b`, '1:1': `h${i}c`, '1.91:1': `h${i}d` } })), copySets: [1, 2, 3, 4, 5].map(i => ({ text: `Main ${i}`, headline: `Head ${i}` })) });
  for (const id of [made.made.campaign, ...made.made.adsets, ...made.made.ads]) await M.setStatus(id, 'ACTIVE');
  if (was) gate(true); else gate(false);
  const c = await S.createRow('campaigns', { name: `Rules test ${n}`, goal, structure: 'test', status, meta_campaign_id: made.made.campaign, rules_on: rulesOn, budget_mode: 'per_adset', daily_budget_cents: budget * 5, spend_cap_cents: 150000, start_date: SY.addDays(T, -8) });
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

say('-- the results sync: a week of results, idempotent, read only');
const A = await makeCampaign({ status: 'sent_paused' });
{
  const before = await mark();
  const r1 = await SY.runResultsSync(), rows1 = await S.listResults(A.c.id, '2000-01-01');
  answers.push(JSON.stringify(r1));
  ck('a week for 5 ad sets and 25 ads is kept (210 daily rows: 5 × 7 and 25 × 7)', r1.rows === 210 && rows1.length === 210 && rows1.filter(r => !r.ad_id).length === 35 && rows1.filter(r => r.ad_id).length === 175, JSON.stringify(r1));
  const set1 = rows1.filter(r => r.adset_id === A.sets[0].id && !r.ad_id);
  ck('the rows are in cents and counts under Ops’ own ids, and the first ad set returns 2.4', set1.length === 7 && set1.every(r => r.campaign_id === A.c.id && r.spend_cents > 0) && Math.abs(set1.reduce((s, r) => s + r.revenue_cents, 0) / set1.reduce((s, r) => s + r.spend_cents, 0) - 2.4) < 0.01);
  const r2 = await SY.runResultsSync(), rows2 = await S.listResults(A.c.id, '2000-01-01');
  ck('running it again changes nothing (still 210 rows, same numbers)', r2.rows === 210 && rows2.length === 210 && JSON.stringify(rows2.map(r => [r.date, r.adset_id, r.ad_id, r.spend_cents, r.revenue_cents])) === JSON.stringify(rows1.map(r => [r.date, r.adset_id, r.ad_id, r.spend_cents, r.revenue_cents])));
  ck('it only reads: the mock saw no write during either sync', (await mark()) === before);
  ck('the last sync is noted on the campaign', (await S.getRow('campaigns', A.c.id)).meta_settings.sync?.ok === true);
  await j('/__mode?failInsights=1');
  const r3 = await SY.runResultsSync(), cs = await S.getRow('campaigns', A.c.id);
  ck('a Meta rate limit is recorded on the campaign in plain words, the job does not throw, and the numbers already kept stay', r3.errors.length === 1 && cs.meta_settings.sync?.ok === false && /slow down/.test(cs.meta_settings.sync.error) && (await S.listResults(A.c.id, '2000-01-01')).length === 210, JSON.stringify(r3));
  await j('/__mode?failInsights=0');
  const r4 = await SY.runResultsSync();
  ck('and the next sync puts it right', r4.errors.length === 0 && (await S.getRow('campaigns', A.c.id)).meta_settings.sync?.ok === true);
  const fresh = await makeCampaign({ status: 'live', rulesOn: false }), d = await SY.runResultsSync({ dry: true });
  ck('a dry run reads Meta and says what it would keep, and keeps nothing', d.dry === true && d.rows > 0 && (await S.listResults(fresh.c.id, '2000-01-01')).length === 0);
  await S.updateRow('campaigns', fresh.c.id, { status: 'draft' });
  const ended = await makeCampaign({ status: 'ended', rulesOn: false });
  await SY.runResultsSync();
  ck('only campaigns in Meta are synced (not drafts or ended ones)', (await S.listResults(fresh.c.id, '2000-01-01')).length === 0 && (await S.listResults(ended.c.id, '2000-01-01')).length === 0);
  await S.updateRow('campaigns', fresh.c.id, { status: 'live' }); await SY.runResultsSync();
}

say('-- the morning rules, all three locks open: raise, hold and turn off as the settings say');
const P = await makeCampaign({});   // Purchase: raise at 1.5×, off below 1.2×, after $40; $20 a day per ad set, ceiling $60
await SY.runResultsSync();
await open();
{
  const w0 = await mark();
  const run = await R.runMorningRules({ now: at(-3) }), ds = decisionsOf(run, P.c), b = byPos(ds);
  ck('the locks report open', run.locks.open === true && run.locks.cron && run.locks.gate && run.locks.makeOff && run.locks.makeMode === 'OFF');
  ck('five ad sets, five decisions: raise, raise, hold, turn off, turn off', ds.length === 5 && ['raise_budget', 'raise_budget', 'hold', 'turn_off', 'turn_off'].every((k, i) => b[i + 1]?.kind === k), JSON.stringify(ds.map(d => [d.adset, d.kind])));
  ck('each says why in plain English with the numbers (the 72-hour return against the line)', /return on ad spend 2\.4× over the last 3 days/.test(b[1].detail) && /1\.5× line/.test(b[1].detail) && /goes up 20%, from \$20 to \$24/.test(b[1].detail) && /return on ad spend 1\.2×/.test(b[3].detail) && /stays as it is/.test(b[3].detail) && /below the 1\.2× line/.test(b[4].detail) && /turned off/.test(b[5].detail), b[1].detail + ' | ' + b[3].detail);
  ck('the changes reached the Meta mock: two budgets up (2400) and two ad sets paused, four writes in all', (await mark()) - w0 === 4 && (await metaOf(P.sets[0].meta_adset_id)).daily_budget === '2400' && (await metaOf(P.sets[1].meta_adset_id)).daily_budget === '2400' && (await metaOf(P.sets[3].meta_adset_id)).status === 'PAUSED' && (await metaOf(P.sets[4].meta_adset_id)).status === 'PAUSED' && (await metaOf(P.sets[2].meta_adset_id)).daily_budget === '2000');
  const acts = await actionsOf(P.c), raise1 = acts.find(a => a.adset_id === P.sets[0].id && a.kind === 'raise_budget'), off4 = acts.find(a => a.adset_id === P.sets[3].id && a.kind === 'turn_off');
  ck('every decision is a row in the actions table, by the rules, applied (not a dry run), 5 in all', acts.length === 5 && acts.every(a => a.by === 'rules' && a.dry_run === false));
  ck('a raise records from and to, and what Reverse restores', raise1.before.daily_budget_cents === 2000 && raise1.after.daily_budget_cents === 2400 && raise1.reverse_to.daily_budget_cents === 2000, JSON.stringify(raise1));
  ck('a turn-off records from and to, and what Reverse restores', off4.before.status === 'on' && off4.after.status === 'off' && off4.reverse_to.status === 'on');
  ck('Ops’ own record follows Meta (budgets 2400, 2400, 2000; two ad sets off)', (await budgetOf(P.sets[0])) === 2400 && (await budgetOf(P.sets[2])) === 2000 && (await S.getRow('adsets', P.sets[3].id)).status === 'off');
  const again = await R.runMorningRules({ now: at(-3) });
  ck('running it a second time the same morning does nothing more (no new rows, no new writes)', decisionsOf(again, P.c).length === 0 && (await actionsOf(P.c)).length === 5 && (await mark()) - w0 === 4);
  // the 48-hour step
  const w1 = await mark(), nextDay = await R.runMorningRules({ now: at(-2) }), b2 = byPos(decisionsOf(nextDay, P.c));
  ck('the next morning (24 hours on): the two raised ad sets hold, with the reason, and the two that are off are left alone', Object.keys(b2).length === 3 && b2[1].kind === 'hold' && b2[2].kind === 'hold' && /raised 24 hours ago/.test(b2[1].detail) && /48 hours between steps/.test(b2[1].detail) && b2[3].kind === 'hold' && (await mark()) === w1);
  const third = await R.runMorningRules({ now: at(-1) }), b3 = byPos(decisionsOf(third, P.c));
  ck('48 hours after the first step the next step is taken (2400 to 2880, 20% more)', b3[1].kind === 'raise_budget' && b3[1].to.daily_budget_cents === 2880 && b3[2].kind === 'raise_budget' && (await metaOf(P.sets[0].meta_adset_id)).daily_budget === '2880' && (await budgetOf(P.sets[0])) === 2880);
}

say('-- the ceiling, the minimum spend, the 72-hour average');
{
  await open();
  const C = await makeCampaign({ rule: { ceiling_cents: 2600, raise_every_hours: 24 }, adset: { 2: { budget_ceiling_cents: 2200 } } });
  await SY.runResultsSync();
  const a = byPos(decisionsOf(await R.runMorningRules({ now: at(-3) }), C.c));
  ck('a raise never goes above the ceiling (2000 to 2400 is fine) and a per-ad-set ceiling beats the campaign’s ($22 for ad set 2)', a[1].to.daily_budget_cents === 2400 && a[2].to.daily_budget_cents === 2200 && /\$22 ceiling stops it/.test(a[2].detail), JSON.stringify([a[1].to, a[2].to]));
  const b = byPos(decisionsOf(await R.runMorningRules({ now: at(-2) }), C.c));
  ck('the next step is cut to the ceiling (2400 to 2600 for ad set 1), and an ad set already at its ceiling holds', b[1].to.daily_budget_cents === 2600 && /ceiling stops it/.test(b[1].detail) && b[2].kind === 'hold' && /already at the \$22 a day ceiling/.test(b[2].detail), JSON.stringify(b[2]));
  ck('and Meta has the capped numbers', (await metaOf(C.sets[0].meta_adset_id)).daily_budget === '2600' && (await metaOf(C.sets[1].meta_adset_id)).daily_budget === '2200');
  const c3 = byPos(decisionsOf(await R.runMorningRules({ now: at(-1) }), C.c));
  ck('at the ceiling it holds, the step is not taken', c3[1].kind === 'hold' && /already at the \$26 a day ceiling/.test(c3[1].detail) && (await metaOf(C.sets[0].meta_adset_id)).daily_budget === '2600');
  // minimum spend: the 4th ad set has spent about $119 over the week, the 5th about $133
  const M2 = await makeCampaign({ rule: { off_min_spend_cents: 12000 } });
  await SY.runResultsSync();
  const m = byPos(decisionsOf(await R.runMorningRules({ now: at(-1) }), M2.c)), sp = Object.fromEntries((await S.resultTotals({ campaignId: M2.c.id })).map(x => [x.adset_id, x.spend_cents]));
  ck('with a $120 minimum, ad set 4 (spent just under it) is held on although it is below the line, and ad set 5 (spent more) is turned off', sp[M2.sets[3].id] < 12000 && sp[M2.sets[4].id] >= 12000 && m[4].kind === 'hold' && /only spent \$119/.test(m[4].detail) && /wait until \$120/.test(m[4].detail) && m[5].kind === 'turn_off', JSON.stringify([sp, m[4].detail]));
  // the 72-hour average: hand-made results for a campaign that never reaches Meta (a dry run)
  cron(true); gate(false);
  const H = await makeCampaign({ rule: { off_min_spend_cents: 0 } });
  const day = k => SY.addDays(T, k), rowsFor = (set, spec) => spec.map(([k, spend, rev]) => ({ date: day(k), campaign_id: H.c.id, adset_id: set.id, ad_id: '', spend_cents: spend, revenue_cents: rev, purchases: 1, leads: 0, impressions: 100, clicks: 5 }));
  await S.upsertResults([
    ...rowsFor(H.sets[0], [[-1, 1000, 3000], [-2, 1000, 500], [-3, 1000, 2500], [-5, 5000, 500]]),    // last three days: 60 on 30 = 2.0 although one day was 0.5×; an older bad day is ignored
    ...rowsFor(H.sets[1], [[-1, 1000, 500], [-2, 1000, 500], [-3, 1000, 500], [-4, 5000, 50000]]),      // last three days 0.5×; a great day before them does not save it
    ...rowsFor(H.sets[2], [[-1, 1000, 3000], [-2, 1000, 3000], [0, 5000, 0]]),                           // today's partial day is not counted (only two full days here, still 3.0×)
    ...rowsFor(H.sets[3], [[-4, 5000, 100]]),                                                            // nothing in the last three days: nothing to judge
  ]);
  const h = byPos(decisionsOf(await R.runMorningRules({ now: at(0) }), H.c));
  ck('the judgement is the average of the last 72 hours: one bad day among three still raises (2.0× over $30)', h[1].kind === 'raise_budget' && /2× over the last 3 days \(\$30 spent\)/.test(h[1].detail), h[1].detail);
  ck('an older bad day is ignored, and an older great day does not save a bad three days (0.5× turns it off)', h[2].kind === 'turn_off' && /0\.5×/.test(h[2].detail));
  ck('today’s partial day is left out', h[3].kind === 'raise_budget' && /3× over the last 3 days \(\$20 spent\)/.test(h[3].detail), h[3].detail);
  ck('with nothing spent in the window it holds and says there is nothing to judge', h[4].kind === 'hold' && /nothing to judge yet/.test(h[4].detail));
  ck('none of that reached Meta (the switch was off for this one)', h[1].dry_run === true && (await metaOf(H.sets[0].meta_adset_id)).daily_budget === '2000');
}

say('-- Lead campaigns are judged on cost per lead');
{
  await open();
  const L = await makeCampaign({ goal: 'Lead' });
  await SY.runResultsSync();
  const l = byPos(decisionsOf(await R.runMorningRules({ now: at(-3) }), L.c));
  ck('cost per lead $1.00 and $1.50 raise (at most $1.75), $2.00 holds, $3.00 and $5.00 turn off (above $2.50)', ['raise_budget', 'raise_budget', 'hold', 'turn_off', 'turn_off'].every((k, i) => l[i + 1]?.kind === k), JSON.stringify(Object.values(l).map(d => [d.adset, d.kind, d.detail.slice(0, 80)])));
  ck('and says so in cost per lead', /cost per lead \$1\.00 over the last 3 days/.test(l[1].detail) && /at or below the \$1\.75 line/.test(l[1].detail) && /above the \$2\.50 line/.test(l[4].detail), l[1].detail + ' | ' + l[4].detail);
}

say('-- Traffic gets no rules; rules that are off, a paused campaign, a draft: nothing');
{
  await open();
  const Tr = await makeCampaign({ goal: 'Traffic' }), Off = await makeCampaign({ rulesOn: false }), Pa = await makeCampaign({ status: 'paused' });
  await SY.runResultsSync();
  const run = await R.runMorningRules({ now: at(-3) });
  ck('a Traffic campaign with the switch on gets no decisions and no rows', !run.campaigns.some(x => x.id === Tr.c.id) && (await actionsOf(Tr.c)).length === 0 && Tr.rules === null);
  ck('a campaign whose rules are off, and a paused campaign, get none either', !run.campaigns.some(x => x.id === Off.c.id || x.id === Pa.c.id) && (await actionsOf(Off.c)).length === 0 && (await actionsOf(Pa.c)).length === 0);
}

say('-- the weakest ad in each set');
{
  await open();
  const W = await makeCampaign({ rule: { pause_weakest_after_days: 5 } });
  await SY.runResultsSync();
  const w = byPos(decisionsOf(await R.runMorningRules({ now: at(0) }), W.c));
  const paused = Object.entries(w).filter(([k]) => k.endsWith('a'));
  ck('after 5 days the weakest ad (ad 5) is paused in each ad set that stays on: three sets (the two turned off are skipped)', paused.length === 3 && paused.every(([, d]) => d.ad === 'Ad 5' && d.kind === 'pause_ad' && d.applied), JSON.stringify(paused.map(([k, d]) => [k, d.ad])));
  ck('with the reason in numbers, and Meta has those ads paused', /weakest ad in Ad set 1/.test(w['1a'].detail) && /0\.\d+×|1\.\d+×/.test(w['1a'].detail) && (await j('/__state')).ads.filter(a => a.status === 'PAUSED').length >= 3);
  const again = await R.runMorningRules({ now: at(1) });
  ck('only once per ad set: the next morning pauses no more ads', !decisionsOf(again, W.c).some(d => d.kind === 'pause_ad'));
  const young = await makeCampaign({ rule: { pause_weakest_after_days: 30 } }); await SY.runResultsSync();
  ck('before the days are up nothing is paused', !decisionsOf(await R.runMorningRules({ now: at(0) }), young.c).some(d => d.kind === 'pause_ad'));
}

say('-- close any ONE lock and the same decisions become a dry run: the Meta mock sees no write');
{
  const scenarios = [
    ['the jobs are paused here (OPS_LIVE not 1)', async () => { await open(); cron(false); }, /back-office jobs are paused/],
    ['the Meta safety switch is off', async () => { await open(); gate(false); }, /safety switch for Meta is off/],
    ['Make’s Ad Agent is still on (AUTO)', async () => { await open(); await setMake('AUTO'); }, /Make’s Ad Agent is still on, so nothing was changed/],
    ['Make’s Ad Agent is on in recommend-only mode', async () => { await open(); await setMake('RECOMMEND'); }, /Make’s Ad Agent is still on/],
    ['Ops can’t read Make’s setting (the tab has no Mode)', async () => { await open(); await setMake(''); }, /can’t tell whether Make’s Ad Agent is still on/],
  ];
  const expect = ['raise_budget', 'raise_budget', 'hold', 'turn_off', 'turn_off'];
  for (const [name, close, why] of scenarios) {
    const X = await makeCampaign({}); await SY.runResultsSync(); await close();
    const w0 = await mark(), run = await R.runMorningRules({ now: at(-3) }), ds = decisionsOf(run, X.c), b = byPos(ds), acts = await actionsOf(X.c);
    ck(`[${name}] the same five decisions are made`, expect.every((k, i) => b[i + 1]?.kind === k), JSON.stringify(ds.map(d => d.kind)));
    ck(`[${name}] every one is recorded as a dry run, none applied`, acts.length === 5 && acts.every(a => a.dry_run === true) && run.applied === 0 && run.would === 4 && ds.every(d => !d.applied), JSON.stringify(acts.map(a => a.dry_run)));
    ck(`[${name}] the Meta mock’s write log is empty and Meta is as it was`, (await mark()) === w0 && (await metaOf(X.sets[0].meta_adset_id)).daily_budget === '2000' && (await metaOf(X.sets[3].meta_adset_id)).status === 'ACTIVE');
    ck(`[${name}] Ops’ own budgets and ad set states are unchanged`, (await budgetOf(X.sets[0])) === 2000 && (await S.getRow('adsets', X.sets[3].id)).status === 'live');
    ck(`[${name}] the page says why, in plain words`, why.test(run.locks.text) && run.locks.text.startsWith('Dry run — ') && run.locks.open === false, run.locks.text);
    ck(`[${name}] a dry-run action has no Reverse, and pressing it says there is nothing to undo`, acts.find(a => a.kind === 'raise_budget').dry_run === true && (await R.reverseAction(acts.find(a => a.kind === 'raise_budget').id, 'Jake', X.c.id)).status === 409 && /dry run/.test((await R.reverseAction(acts.find(a => a.kind === 'raise_budget').id, 'Jake', X.c.id)).error));
    ck(`[${name}] the dry run still wrote its rows with from, to and what Reverse would restore (raise 2000 to 2400), though none can be reversed`, acts.find(a => a.kind === 'raise_budget').before.daily_budget_cents === 2000 && acts.find(a => a.kind === 'raise_budget').after.daily_budget_cents === 2400 && acts.find(a => a.kind === 'raise_budget').reverse_to.daily_budget_cents === 2000 && !R.canReverse(acts.find(a => a.kind === 'raise_budget')));
  }
  await open();
  const pv = await makeCampaign({}); await SY.runResultsSync();
  const w0 = await mark(), run = await R.runMorningRules({ now: at(-3), preview: true });
  ck('a preview with every lock open decides and says, but records nothing and changes nothing', decisionsOf(run, pv.c).length === 5 && (await actionsOf(pv.c)).length === 0 && (await mark()) === w0 && decisionsOf(run, pv.c).every(d => !d.applied));
}

say('-- Reverse puts the earlier value back, once, and refuses after a later change');
{
  await open();
  const V1 = await makeCampaign({}); await SY.runResultsSync();
  await R.runMorningRules({ now: at(-3) });
  const acts = await actionsOf(V1.c), raise = acts.find(a => a.adset_id === V1.sets[0].id && a.kind === 'raise_budget'), off = acts.find(a => a.adset_id === V1.sets[3].id && a.kind === 'turn_off');
  ck('an applied raise and an applied turn-off can be reversed (the action says so)', R.canReverse(raise) && R.canReverse(off) && !R.canReverse(acts.find(a => a.kind === 'hold')));
  const w0 = await mark(), r1 = await R.reverseAction(raise.id, 'Jake', V1.c.id);
  ck('Reverse puts the budget back: 2400 to 2000 in Meta and in Ops', r1.ok && /back to \$20/.test(r1.message) && (await metaOf(V1.sets[0].meta_adset_id)).daily_budget === '2000' && (await budgetOf(V1.sets[0])) === 2000 && (await mark()) - w0 === 1, JSON.stringify(r1));
  const after = (await actionsOf(V1.c)), done = after.find(a => a.id === raise.id), rev = after.find(a => a.kind === 'reverse' && a.adset_id === V1.sets[0].id);
  ck('the change is marked reversed by whoever pressed it, and a reversing action is recorded with from and to', !!done.reversed_at && done.reversed_by === 'Jake' && rev?.by === 'Jake' && rev.before.daily_budget_cents === 2400 && rev.after.daily_budget_cents === 2000 && !R.canReverse(done));
  const r2 = await R.reverseAction(raise.id, 'Jake', V1.c.id);
  ck('pressing it again is harmless: it says already reversed and writes nothing', r2.ok && r2.already === true && (await mark()) - w0 === 1 && (await actionsOf(V1.c)).filter(a => a.kind === 'reverse').length === 1);
  const r3 = await R.reverseAction(off.id, 'Jake', V1.c.id);
  ck('reversing a turn-off switches the ad set back on in Meta and in Ops', r3.ok && (await metaOf(V1.sets[3].meta_adset_id)).status === 'ACTIVE' && (await S.getRow('adsets', V1.sets[3].id)).status === 'live', JSON.stringify(r3));
  const grace = byPos(decisionsOf(await R.runMorningRules({ now: at(-2) }), V1.c));
  ck('and the next morning the rules leave it alone for three days, saying so (not turning it straight off again)', grace[4]?.kind === 'hold' && /turned it back on/.test(grace[4].detail) && (await metaOf(V1.sets[3].meta_adset_id)).status === 'ACTIVE', JSON.stringify(grace[4]));
  // after a later change
  const W2 = await makeCampaign({ rule: { raise_every_hours: 24 } }); await SY.runResultsSync();
  await R.runMorningRules({ now: at(-3) }); await R.runMorningRules({ now: at(-2) });
  const raises = (await actionsOf(W2.c)).filter(a => a.adset_id === W2.sets[0].id && a.kind === 'raise_budget').sort((a, b) => a.at.localeCompare(b.at));
  const w1 = await mark(), late = await R.reverseAction(raises[0].id, 'Jake', W2.c.id);
  ck('an earlier raise can’t be reversed after a later one: it says so plainly and changes nothing', raises.length === 2 && late.ok === false && late.status === 409 && /changed again since \(it is now \$28\.80\)/.test(late.error) && (await mark()) === w1 && (await budgetOf(W2.sets[0])) === 2880, JSON.stringify(late));
  await M.setBudget(W2.sets[1].meta_adset_id, { dailyBudgetCents: 3100 });   // someone changes ad set 2 in Meta by hand
  const w2 = await mark(), handed = await R.reverseAction((await actionsOf(W2.c)).filter(a => a.adset_id === W2.sets[1].id && a.kind === 'raise_budget').sort((a, b) => b.at.localeCompare(a.at))[0].id, 'Jake', W2.c.id);
  ck('a change made in Meta by hand since is noticed too (Ops asks Meta first) and nothing is undone', handed.ok === false && /in Meta has been changed again since \(it is now \$31\)/.test(handed.error) && (await mark()) === w2 && (await metaOf(W2.sets[1].meta_adset_id)).daily_budget === '3100', JSON.stringify(handed));
  // the switch off: Reverse is a dry run and reverses nothing
  gate(false);
  const w3 = await mark(), dryRev = await R.reverseAction(raises[1].id, 'Jake', W2.c.id);
  ck('with the safety switch off Reverse is a dry run: nothing is sent and it is not marked reversed', dryRev.ok && dryRev.dryRun === true && /nothing was sent to Meta/.test(dryRev.message) && (await mark()) === w3 && !(await S.getRow('actions', raises[1].id)).reversed_at);
  gate(true);
  const R4 = await R.runMorningRules({ now: at(-1) });
  ck('and a morning rule does not raise a budget somebody has changed in Meta: it holds and says so', byPos(decisionsOf(R4, W2.c))[2]?.kind === 'hold' && /someone changed it in Meta/.test(byPos(decisionsOf(R4, W2.c))[2].detail), JSON.stringify(byPos(decisionsOf(R4, W2.c))[2]));
  ck('Reverse refuses an unknown change, a change on another campaign, and a note that is not a change', (await R.reverseAction('act_nope', 'Jake', W2.c.id)).status === 404 && (await R.reverseAction(raise.id, 'Jake', W2.c.id)).status === 404 && (await R.reverseAction((await actionsOf(V1.c)).find(a => a.kind === 'hold').id, 'Jake', V1.c.id)).status === 409);
}
say('-- a Meta that refuses the change: it is recorded as not done, and nothing is marked changed');
{
  await open();
  const F = await makeCampaign({}); await SY.runResultsSync();
  await j('/__mode?rejectWrites=1');
  const run = await R.runMorningRules({ now: at(-3) }), ds = decisionsOf(run, F.c), acts = await actionsOf(F.c);
  ck('each change that Meta refused is recorded as not done, with the reason, and is not reversible', ds.filter(d => d.kind !== 'hold').every(d => d.failed && !d.applied) && run.failed === 4 && acts.filter(a => a.after?.failed).length === 4 && acts.every(a => !R.canReverse(a)) && /did not go through/.test(acts.find(a => a.after?.failed).detail));
  ck('Ops’ own record is unchanged (budget still 2000, ad set still on)', (await budgetOf(F.sets[0])) === 2000 && (await S.getRow('adsets', F.sets[3].id)).status === 'live');
  await j('/__mode?rejectWrites=0');
  const retry = await R.runMorningRules({ now: at(-3) });
  ck('and it is not tried again the same morning', decisionsOf(retry, F.c).length === 0);
}

say('-- the page and the list read the same numbers');
{
  const t = await S.campaignTree(P.c.id), v = await V.liveView(t, at(0)), s = await V.listSummary(await S.listRows('campaigns'), at(0));
  ck('the live view has five ad sets, five ads each, and a 3-day trend per ad set', v.adsets.length === 5 && v.adsets.every(a => a.ads.length === 5 && a.trend.length === 3) && v.metric === 'roas' && v.spent_cents > 0 && v.cap_cents === 150000);
  ck('the rules are written out in plain English, one line each', v.rule_lines.length === 4 && /Raise an ad set’s daily budget by 20% every 48 hours while its return on ad spend is at least 1\.5×, never above \$60 a day/.test(v.rule_lines[1]) && /Turn an ad set off when its return on ad spend falls below 1\.2×, once it has spent at least \$40/.test(v.rule_lines[2]) && /left alone/.test(v.rule_lines[3]), JSON.stringify(v.rule_lines));
  ck('Traffic’s rules read as none', V.ruleLines(null, 'Traffic')[0].includes('no automatic rules'));
  ck('what the Ad Agent did is split into today and earlier, each with a Reverse flag', v.today.length + v.earlier.length > 0 && [...v.today, ...v.earlier].every(a => typeof a.can_reverse === 'boolean'));
  ck('the list carries each campaign’s spend and return', Object.keys(s.byCampaign).length > 3 && s.byCampaign[P.c.id].spent_cents > 0 && s.byCampaign[P.c.id].metric === 'roas');
  ck('digest recipients are directors and the Ads role, once each, with an address', JSON.stringify(DG.adsRecipients([{ email: 'Jacob@x.test', director: true }, { email: 'r@x.test', roles: ['Marketing', 'Ads'] }, { email: 'f@x.test', roles: ['Social'] }, { email: '', director: true }, { email: 'jacob@x.test', director: true }])) === JSON.stringify(['jacob@x.test', 'r@x.test']));
}

say('-- the token');
{
  const all = [...out, ...answers, JSON.stringify((await j('/__log')).requests)].join('\n');
  ck('the access key appears in no output, no answer and not in the mock’s log', !all.includes(TOKEN));
  ck('and every request carried it in the header only', (await j('/__log')).requests.every(r => r.auth && !r.tokenInUrl));
}
say(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
