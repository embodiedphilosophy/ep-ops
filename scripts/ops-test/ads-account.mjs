// The Ads account view (lib/ops/adsaccount.js: every campaign in the REAL ad account, read only) in node on an in-process Postgres (PGlite) and the Meta mock (:4556, world 'account').
// `source env.sh`, run.sh running. Nothing real: Meta is the mock, the database is PGlite.
//   - no key / no ad account: "not connected" with the words, no request to Meta
//   - the account world: every campaign listed (made in Ops or not), status in plain words, budgets, dates, the last 7 and 30 whole days (exact sums), return (purchase) and cost per lead (lead),
//     "Needs a look" reasons from the safety net's own checks, sorted by 30-day spend, totals equal to the sum of the rows
//   - "Made in Ops" matches only a Meta id in ads_campaigns, works with NO tables (and makes none), a dry-run id never matches
//   - the number of calls to Meta: a fresh look = account + campaigns + ad sets + results (4), none from the 5-minute memory, Refresh once a minute per person, paging safe
//   - Meta trouble never throws: a rate limit, a key that may not read, a Meta error (the last good look stays, with the plain reason), results or ad sets failing alone (partial), an empty account
//   - Meta saw only reads (never a write), the key never in a URL, the answer or the app's log, Meta's own wording never shown
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite';
const KEY = 'mock-ads-token-for-the-account-test';
const metaOn = (on, account = true) => { for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'META_PAGE_ID', 'META_ADS_LIVE']) delete process.env[k]; if (on) Object.assign(process.env, { META_ADS_TOKEN: KEY, ...(account ? { META_AD_ACCOUNT_ID: 'act_MOCK1' } : {}) }); };
const logs = []; for (const k of ['log', 'error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const t = a.map(String).join(' '); if (!/^(ok |FAIL|--)/.test(t)) logs.push(t); o(...a); }; }
const MT = 'http://localhost:4556';
const meta = async (q = '') => (await fetch(`${MT}/__log${q}`)).json();
const mmode = q => fetch(`${MT}/__mode?${q}`), world = n => fetch(`${MT}/__world?name=${n}`);
const count = async () => (await meta()).total;
const allReq = [], rs = async () => { allReq.push(...(await meta()).requests); await meta('?reset=1'); };   // keeps what Meta saw across the resets
await fetch(`${MT}/__reset`);

const V = await import('../../lib/ops/adsaccount.js'), M = await import('../../lib/ops/adsaccountmath.js'), S = await import('../../lib/ops/adsstore.js'), Q = await import('../../lib/ops/adsdb.js');
const table = async () => (await Q.adsQuery("SELECT to_regclass('ads_campaigns') AS t"))[0].t;
const by = (v, id) => v.rows.find(r => r.id === id);
const sumOf = (rows, k, f) => rows.reduce((n, r) => n + (r[k]?.[f] || 0), 0);
const seen = [];
const view = async (o = {}) => { const v = await V.accountView(o); seen.push(JSON.stringify(v)); return v; };

console.log('-- no key, and a key with no ad account: not connected, and Meta is not asked');
metaOn(false); V.forgetAccountCache();
let v = await view({ who: 'a' });
ck('no key: "not connected", the words name the setting, no rows, nothing asked of Meta', v.status.state === 'not_connected' && /META_ADS_TOKEN/.test(v.status.message) && /isn’t connected yet/.test(v.status.message) && !v.rows.length && v.totals === null && (await count()) === 0, JSON.stringify(v.status));
metaOn(true, false); V.forgetAccountCache();
v = await view({ who: 'a' });
ck('a key but no ad account: not connected, names META_AD_ACCOUNT_ID, no request', v.status.state === 'not_connected' && /META_AD_ACCOUNT_ID/.test(v.status.message) && (await count()) === 0, JSON.stringify(v.status));

console.log('-- the account: every campaign, however it was made');
metaOn(true); V.forgetAccountCache(); await world('account'); await rs();
v = await view({ who: 'jacob' });
const log1 = (await meta()).requests;
ck('a fresh look asks Meta four things (the account, the campaigns, the ad sets, a month of results) and only reads', log1.length === 4 && log1.every(r => r.method === 'GET' && !r.write && r.auth && !r.tokenInUrl), JSON.stringify(log1.map(r => r.path)));
ck('the four are the account, campaigns, adsets and campaign-level insights', ['act_MOCK1', 'act_MOCK1/campaigns', 'act_MOCK1/adsets', 'act_MOCK1/insights'].every(p => log1.some(r => r.path === p)) && log1.find(r => r.path.endsWith('/insights')).query.level === 'campaign');
ck('state ok, "as of" given, not from memory, no Ads table was made by looking', v.status.state === 'ok' && !!v.status.as_of && v.status.cached === false && (await table()) == null);
ck('eleven campaigns, none of them made in Ops (there are no tables yet)', v.rows.length === 11 && v.rows.every(r => r.made_in_ops === false && r.ops_id === ''), String(v.rows.length));
ck('sorted by the last 30 days\' spend, biggest first', v.rows.every((r, i) => i === 0 || v.rows[i - 1].d30.spend_cents >= r.d30.spend_cents));
const ok1 = by(v, 'W_OK1'), ok2 = by(v, 'W_OK2');
ck('a healthy purchase campaign: exact 7 and 30 whole days ($350 and $1,500), purchases, return 2.00×', ok1.d7.spend_cents === 35000 && ok1.d30.spend_cents === 150000 && ok1.d7.results === 14 && ok1.d30.results === 60 && ok1.d7.ret.type === 'roas' && Math.abs(ok1.d7.ret.value - 2) < 1e-9 && ok1.kind === 'purchase', JSON.stringify(ok1.d7));
ck('a lead campaign: leads and cost per lead ($2.00), not a return', ok2.kind === 'lead' && ok2.d7.results === 105 && ok2.d7.ret.type === 'cpl' && ok2.d7.ret.value === 200, JSON.stringify(ok2.d7));
ck('status in plain words: Active, Paused, Archived, and a paused one past its end date is Ended', by(v, 'W_OK1').status_word === 'Active' && by(v, 'W_PAUSED').status_word === 'Paused' && by(v, 'W_ARCH').status_word === 'Archived' && by(v, 'W_ENDED').status_word === 'Ended' && by(v, 'W_PAST').status_word === 'Active');
ck('budgets: daily, lifetime, none', by(v, 'W_PAST').budget?.kind === 'daily' && by(v, 'W_PAST').budget.cents === 5000 && by(v, 'W_ZERO').budget?.kind === 'lifetime' && by(v, 'W_ZERO').budget.cents === 90000, JSON.stringify([by(v, 'W_PAST').budget, by(v, 'W_ZERO').budget]));
ck('a campaign with its budget on its ad sets shows their total, saying so; one with no budget at all shows none', by(v, 'W_SETS').budget?.on_ad_sets === true && by(v, 'W_SETS').budget.cents === 1500 && ok1.budget === null, JSON.stringify([by(v, 'W_SETS').budget, ok1.budget]));
ck('dates: a start date, an end date, and "no end date" when there is none', /^\d{4}-\d{2}-\d{2}$/.test(by(v, 'W_PAST').start) && /^\d{4}-\d{2}-\d{2}$/.test(by(v, 'W_PAST').end) && by(v, 'W_OPEN').end === '' && by(v, 'W_OPEN').no_end === true && ok1.no_end === false);
ck('too little spend gives no return: the archived one spent nothing', by(v, 'W_ARCH').d30.spend_cents === 0 && by(v, 'W_ARCH').d30.ret === null && by(v, 'W_PAUSED').d7.ret === null);
console.log('-- "Needs a look": the safety net\'s own checks, one plain reason each');
const needs = id => by(v, id).needs.join(' | ');
ck('running past its end time', /Still running after its end time/.test(needs('W_PAST')), needs('W_PAST'));
ck('no end date and no cap', /Running with no end date and no spending cap/.test(needs('W_OPEN')), needs('W_OPEN'));
ck('spending with nothing to show (3 days, the Settings thresholds)', /nothing to show/.test(needs('W_ZERO')), needs('W_ZERO'));
ck('a return under the floor', /Return 0\.60×/.test(needs('W_LOW')), needs('W_LOW'));
ck('healthy, paused, finished and archived campaigns need no look', ['W_OK1', 'W_OK2', 'w_ops', 'W_PAUSED', 'W_ENDED', 'W_ARCH'].every(id => by(v, id).needs.length === 0), ['W_OK1', 'W_OK2', 'w_ops', 'W_PAUSED', 'W_ENDED', 'W_ARCH'].map(id => id + ':' + needs(id)).join(' ; '));
ck('no campaign is called a spike (that is the hourly safety net\'s job)', v.rows.every(r => !r.needs.some(n => /so far today/.test(n))));
console.log('-- totals equal the sum of the rows');
const T = v.totals, P = v.rows.filter(r => r.kind === 'purchase'), L = v.rows.filter(r => r.kind === 'lead');
ck('total spend 7 and 30 days = the sum of the rows', T.d7.spend_cents === sumOf(v.rows, 'd7', 'spend_cents') && T.d30.spend_cents === sumOf(v.rows, 'd30', 'spend_cents') && T.campaigns === v.rows.length, JSON.stringify(T));
ck('purchases come from purchase campaigns, leads from lead campaigns', T.d30.purchases === P.reduce((n, r) => n + r.d30.purchases, 0) && T.d30.leads === L.reduce((n, r) => n + r.d30.leads, 0) && T.d30.leads === 450);
const rev = P.reduce((n, r) => n + r.d30.revenue_cents, 0), sp = P.reduce((n, r) => n + r.d30.spend_cents, 0);
ck('the blended return is the money back over the money spent, purchase campaigns only', Math.abs(T.d30.roas - rev / sp) < 1e-9 && T.d30.purchase_spend_cents === sp, `${T.d30.roas} vs ${rev / sp}`);
ck('the same sum on the page (sumRows) agrees with the answer, and on any filtered list', JSON.stringify(M.sumRows(v.rows)) === JSON.stringify(T) && M.sumRows(v.rows.filter(r => r.needs.length)).campaigns === v.rows.filter(r => r.needs.length).length);

console.log('-- the five-minute memory, and Refresh once a minute per person');
const n0 = await count();
v = await view({ who: 'jacob' });
ck('looking again costs nothing: from memory, no request', v.status.cached === true && (await count()) === n0);
const t0 = Date.now();
v = await view({ refresh: true, who: 'jacob', now: new Date(t0) });
ck('Refresh asks Meta again (four more reads) and is not from memory', (await count()) === n0 + 4 && v.status.cached === false && !v.status.refresh_wait);
v = await view({ refresh: true, who: 'jacob', now: new Date(t0 + 20000) });
ck('Refresh again inside a minute by the same person: answered from memory, told how long to wait, no request', (await count()) === n0 + 4 && v.status.refresh_wait > 0 && v.status.refresh_wait <= 60 && v.rows.length === 11, JSON.stringify(v.status));
v = await view({ refresh: true, who: 'rebecka', now: new Date(t0 + 20000) });
ck('another person may refresh at once (the rule is per person)', (await count()) === n0 + 8 && !v.status.refresh_wait);
v = await view({ refresh: true, who: 'jacob', now: new Date(t0 + 61000) });
ck('after a minute the first person may refresh again', (await count()) === n0 + 12 && !v.status.refresh_wait);
V.forgetAccountCache();
v = await view({ who: 'jacob', now: new Date(Date.now() + 6 * 60e3) }); const afterTtl = await count();
ck('after five minutes the memory has expired and Meta is asked again', afterTtl === n0 + 16, String(afterTtl - n0));

console.log('-- "Made in Ops": only a Meta id in ads_campaigns, and no table is ever made by looking');
V.forgetAccountCache(); await rs();
ck('still no Ads tables', (await table()) == null);
await S.createRow('campaigns', { name: 'Kali Winter (Ops)', meta_campaign_id: 'w_ops', status: 'live', goal: 'Purchase' });
await S.createRow('campaigns', { name: 'Never sent', meta_campaign_id: 'dryrun-campaign-1', status: 'draft' });
await S.createRow('campaigns', { name: 'No id', meta_campaign_id: '', status: 'draft' });
await S.createRow('campaigns', { name: 'Not in this account', meta_campaign_id: 'W_NOPE', status: 'live' });
v = await view({ who: 'jacob' });
ck('with tables: only the campaign whose Meta id is in ads_campaigns is "Made in Ops", with its Ops page', v.rows.filter(r => r.made_in_ops).map(r => r.id).join() === 'w_ops' && /^cmp_/.test(by(v, 'w_ops').ops_id), v.rows.filter(r => r.made_in_ops).map(r => r.id).join());
ck('a dry-run id, an empty id and an id that is not in the account match nothing', v.rows.filter(r => r.made_in_ops).length === 1);
const n1 = await count(); v = await view({ who: 'jacob' });
ck('the Ops match is read each time (no Meta call): nothing asked of Meta on the repeat', (await count()) === n1);

console.log('-- paging: a long account reads in pages and gives the same answer');
const before = JSON.stringify(v.rows.map(r => [r.id, r.d30.spend_cents, r.d7.results]));
await mmode('pageSize=25'); await rs();
v = await view({ refresh: true, who: 'pager', now: new Date(Date.now() + 120000) });
ck('in pages of 25: more calls, the same eleven campaigns, the same numbers, the same totals', (await count()) > 4 && v.rows.length === 11 && JSON.stringify(v.rows.map(r => [r.id, r.d30.spend_cents, r.d7.results])) === before && JSON.stringify(M.sumRows(v.rows)) === JSON.stringify(v.totals), `${await count()} calls; ${v.rows.length} rows; ${v.status.state} ${v.status.message} ${JSON.stringify(v.status.notes)}`);
await mmode('pageSize=3'); await rs();
v = await view({ refresh: true, who: 'pager2', now: new Date(Date.now() + 240000) });
ck('far too many pages: it stops at a safe number, says the numbers may be short, and still answers', v.status.state === 'partial' && v.status.notes.some(n => /more results than could be read/.test(n)) && (await count()) <= 4 + 3 * 40 && v.rows.length === 11);
await mmode('pageSize=0');

console.log('-- Meta in trouble: never a throw, a plain reason, the last good look kept');
V.forgetAccountCache(); await rs();
let good = await view({ who: 'jacob' });
ck('(a good look first)', good.status.state === 'ok' && good.rows.length === 11);
const trouble = async (q, cls, label) => {
  await mmode(q); await rs();
  const r = await view({ refresh: true, who: `t-${label}`, now: new Date() });
  await mmode(q.replace('=1', '=0'));
  return r;
};
v = await trouble('rateLimitReads=1', 'rate_limit', 'rl');
ck('a rate limit: state error, reason rate_limit, "slow down" in plain words, only one request made (no hammering)', v.status.state === 'error' && v.status.reason === 'rate_limit' && /slow down/.test(v.status.message) && (await count()) === 1, JSON.stringify(v.status));
ck('the last good look is still shown, marked as an older look', v.status.stale === true && v.rows.length === 11 && v.totals.campaigns === 11);
ck('Meta\'s own words are never shown', !/\(mock\)|Too many calls/.test(JSON.stringify(v)));
const n2 = await count(); v = await view({ who: 'jacob' });
ck('the failure is remembered for a minute: opening the page again asks Meta nothing', (await count()) === n2 && v.status.state === 'error');
V.forgetAccountCache();
v = await trouble('rateLimitReads=1', 'rate_limit', 'rl2');
ck('a rate limit with nothing seen before: an error, no rows, no totals', v.status.state === 'error' && v.rows.length === 0 && v.totals === null && v.status.stale === false);
V.forgetAccountCache();
v = await trouble('permissionReads=1', 'permission', 'perm');
ck('a key that may not read: reason permission, says to check the key, no secret, one request', v.status.state === 'error' && v.status.reason === 'permission' && /access key/.test(v.status.message) && !new RegExp(KEY).test(JSON.stringify(v)) && (await count()) === 1);
V.forgetAccountCache();
v = await trouble('failReads=1', 'other', 'other');
ck('Meta down (another error): reason other, a plain sentence, nothing thrown', v.status.state === 'error' && v.status.reason === 'other' && /Try again/.test(v.status.message) && !/\(mock\)/.test(JSON.stringify(v)));
ck('classes: a timeout, a network problem, a rate-limit code, a refused key', V.classify({ timeout: true }) === 'timeout' && V.classify({ network: true }) === 'network' && V.classify({ code: 613 }) === 'rate_limit' && V.classify({ code: 190 }) === 'permission' && V.classify({ status: 403 }) === 'permission' && V.classify({ notConnected: true }) === 'not_connected' && V.classify({ code: 1 }) === 'other');
V.forgetAccountCache();
await mmode('failInsights=1'); v = await view({ who: 'jacob' }); await mmode('failInsights=0');
ck('only the results failing: partial, a note says so, the campaigns are still listed with "—", the date-based reasons still stand', v.status.state === 'partial' && v.status.notes.some(n => /Spending and results couldn’t be read/.test(n)) && v.rows.length === 11 && v.rows.every(r => r.d7 === null && r.d30 === null) && /end time/.test(needs('W_PAST')) && !/nothing to show/.test(needs('W_ZERO')), JSON.stringify(v.status.notes));
ck('and the totals are zeros, not a crash', v.totals.d30.spend_cents === 0 && v.totals.d30.roas === null);
V.forgetAccountCache();
await mmode('failAdsets=1'); v = await view({ who: 'jacob' }); await mmode('failAdsets=0');
ck('only the ad sets failing: partial, a note, and no false "no end date" warnings', v.status.state === 'partial' && v.status.notes.some(n => /Ad set details/.test(n)) && by(v, 'W_OPEN').needs.length === 0 && /end time/.test(needs('W_PAST')) && /nothing to show/.test(needs('W_ZERO')), JSON.stringify(v.status.notes) + needs('W_OPEN'));
V.forgetAccountCache(); await world('empty');
v = await view({ who: 'jacob' });
ck('an account with no campaigns: ok, no rows, totals of nothing', v.status.state === 'ok' && v.rows.length === 0 && v.totals.campaigns === 0 && v.totals.d30.spend_cents === 0);

console.log('-- Meta only ever read, and no secret anywhere');
await rs();
const total = { requests: allReq };
ck('every request Meta saw in this run was a GET (no write of any kind)', total.requests.every(r => r.method === 'GET' && !r.write));
ck('the key was only ever a Bearer header, never in an address', total.requests.every(r => r.auth && !r.tokenInUrl) && allReq.length > 0);
ck('the key is in no answer, and not in anything the process printed', !seen.some(s => s.includes(KEY)) && !logs.some(l => l.includes(KEY)));
ck('the ad account number is in no printed line', !logs.some(l => /act_MOCK1/.test(l)));
console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
