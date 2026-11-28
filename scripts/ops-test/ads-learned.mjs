// Ads › What we've learned (lib/ops/adslearned.js, lib/ops/adshistory.js), in node, on an in-process Postgres (PGlite) and the Meta mock (:4556, world 'history': 20 weeks, 40 ads). `source env.sh`, run.sh running.
// Nothing real: Meta is the mock, the database is PGlite, no model is asked (no key set here).
//   - the pure part: what an ad looks like (creative measures, never its words), the buckets, reliability labels, groups with spend / purchases / return / cost per sign-up / counts of ads and campaigns,
//     findings that are checked (wrong number, a reason, advice, an ad that isn't in the group, a number that doesn't exist: all refused), Newer / Still true / No longer true
//   - the weeks: the plan, which weeks are pending, give up after three tries
//   - the import over several runs: no key = nothing asked and no table; ?preview asks for the campaign list only and makes no table; a rate limit once stops the run and the next run resumes;
//     eight weeks a run, newest first; paging; progress; the same results whatever the page size; nothing written to Meta; the key never in a URL; no copy and no marker anywhere in what is kept
//   - a re-read after the history changed: older statements "No longer true", new ones "Newer", the rest "Still true"
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite'; delete process.env.ANTHROPIC_API_KEY;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import('../../lib/ops/adslearned.js'), V = await import('../../lib/ops/insightsverify.js');

console.log('-- what an ad looks like: its measures, never its words');
const SECRET = 'MARKER-COPY-7731 write to marker.buyer@example.invalid';
const plain = L.creativeFeatures({ title: 'Is this the practice you have been missing?', body: SECRET + ' ' + 'x'.repeat(100), call_to_action_type: 'LEARN_MORE', image_hash: 'h1' });
ck('a plain creative: picture, medium-length words (about 160 characters), a question headline, the button', plain.format === 'image' && plain.copy === 'medium' && plain.headline === 'question' && plain.cta === 'LEARN_MORE', JSON.stringify(plain));
ck('only measures are kept: no word of the copy or the headline, no email', !/MARKER|marker\.buyer|practice you have been/.test(JSON.stringify(plain)));
const video = L.creativeFeatures({ object_story_spec: { video_data: { message: 'Short.', title: '7 weeks with the goddess', call_to_action: { type: 'SIGN_UP' } } } });
ck('a video ad (words and button inside the story): video, short copy, a headline that starts with a number, Sign up', video.format === 'video' && video.copy === 'short' && video.headline === 'number' && video.cta === 'SIGN_UP', JSON.stringify(video));
const car = L.creativeFeatures({ object_story_spec: { link_data: { message: 'x'.repeat(400), name: 'How to sit with the dark mother', child_attachments: [{}, {}] } } });
ck('a carousel with long copy and a "how to" headline', car.format === 'carousel' && car.copy === 'long' && car.headline === 'howto', JSON.stringify(car));
const feed = L.creativeFeatures({ asset_feed_spec: { bodies: [{ text: 'a'.repeat(100) }, { text: 'b'.repeat(140) }], titles: [{ text: 'Begin the course' }], call_to_action_types: ['SHOP_NOW'], ad_formats: ['SINGLE_VIDEO'], videos: [{ video_id: '1' }] } });
ck('an Ops-style creative (a set of alternatives): video, copy length averaged (120), a short headline, Shop now', feed.format === 'video' && feed.copy_chars === 120 && feed.copy === 'short' && feed.headline === 'short' && feed.cta === 'SHOP_NOW', JSON.stringify(feed));
ck('an empty creative is "unknown" and "none", never a guess', L.creativeFeatures(null).format === 'unknown' && L.creativeFeatures({}).copy === 'none' && L.creativeFeatures({}).headline === 'none');
ck('copy length buckets: 124 short, 125 medium, 300 medium, 301 long', L.copyBucket(124) === 'short' && L.copyBucket(125) === 'medium' && L.copyBucket(300) === 'medium' && L.copyBucket(301) === 'long');
ck('audience kinds: lookalike (by name), warm list, Advantage+, interests, broad, unknown', L.audienceKind({ custom_audiences: [{ name: 'Lookalike 1% of buyers' }] }) === 'lookalike' && L.audienceKind({ custom_audiences: [{ name: 'Email list' }] }) === 'warm'
  && L.audienceKind({ targeting_automation: { advantage_audience: 1 } }) === 'advantage' && L.audienceKind({ flexible_spec: [{ interests: [{ id: '1' }] }] }) === 'interest' && L.audienceKind({ age_min: 25 }) === 'broad' && L.audienceKind(undefined) === 'unknown');
ck('goals: sales, leads, traffic, other; budget sizes; seasons', L.goalOf('OUTCOME_SALES') === 'sales' && L.goalOf('LEAD_GENERATION') === 'leads' && L.goalOf('OUTCOME_TRAFFIC') === 'traffic' && L.goalOf('OUTCOME_AWARENESS') === 'other'
  && L.budgetBucket(1999) === 'small' && L.budgetBucket(2000) === 'middle' && L.budgetBucket(5000) === 'large' && L.budgetBucket(0) === 'none' && L.seasonOf('2026-01-15') === 'winter' && L.seasonOf('2026-04-01') === 'spring' && L.seasonOf('2026-07-01') === 'summer' && L.seasonOf('2026-10-31') === 'autumn');
ck('the offer is the topic in the campaign name', L.offerOf('Kali: winter enrollment [E034]').offer_label === 'Kali' && L.offerOf('Kali Winter 2027').offer === L.offerOf('Kali: spring enrollment').offer);

console.log('-- groups, reliability and the 1.5× line');
const mk = (i, f, spend, rev, buys, camp, leads = 0) => ({ ad_id: 'a' + i, name: 'Ad ' + i, campaign_id: camp, campaign_name: 'Kali: winter', adset_name: 'S', spend_cents: spend, revenue_cents: rev, purchases: buys, leads,
  f: { goal: 'sales', offer: 'kali', offer_label: 'Kali', audience: 'warm', format: 'video', copy: 'short', headline: 'question', cta: 'LEARN_MORE', season: 'winter', budget: 'small', ...f } });
const ads = [];
for (let i = 0; i < 6; i++) ads.push(mk(i, {}, 30000, 90000, 8, i % 3 ? 'c1' : 'c2'));                           // video: 3.0× on $1,800 (enough, ahead)
for (let i = 6; i < 12; i++) ads.push(mk(i, { format: 'image', audience: 'broad' }, 30000, 20000, 3, i % 2 ? 'c1' : 'c2'));   // image: 0.67× on $1,800 (enough, behind)
ads.push(mk(20, { format: 'carousel' }, 1000, 0, 0, 'c1'));                                                             // carousel: $10, nothing: too little
ads.push(mk(21, { format: 'carousel', audience: 'interest' }, 9000, 0, 0, 'c1'));                                      // carousel again: $100, no purchases: still too little (under the minimum spend and purchases for an early sign)
ads.push(mk(30, { goal: 'leads', format: 'video' }, 20000, 0, 0, 'c1', 60)); ads.push(mk(31, { goal: 'leads', format: 'image' }, 20000, 0, 0, 'c2', 10)); ads.push(mk(32, { goal: 'leads', format: 'image' }, 20000, 0, 0, 'c3', 12)); ads.push(mk(33, { goal: 'leads', format: 'image' }, 20000, 0, 0, 'c3', 12));
const U = id => 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=MOCK1&selected_campaign_ids=' + id;
const R = L.analyse(ads, { urlFor: U, period: { text: 'Jan to Nov' } });
const find = label => R.findings.find(f => f.label === label && f.kind === 'purchase'), vid = find('Video ads'), img = find('Single-image ads');
ck('video ads came out ahead of the line: 3.00× on $1,800, 48 purchases, 6 ads, in 2 campaigns', !!vid && vid.side === 'ahead' && vid.reliability === 'enough' && vid.ads === 6 && vid.campaigns === 2 && /returned 3\.00× on \$1,800 spent \(48 purchases across 6 ads in 2 campaigns\), ahead of the 1\.5× line\./.test(vid.text), JSON.stringify([vid?.side, vid?.reliability, vid?.ads, vid?.campaigns]));
ck('single-image ads came out behind it, in plain words, with the same wording', !!img && img.side === 'behind' && /returned 0\.67× on \$1,800/.test(img.text) && /behind the 1\.5× line/.test(img.text), img?.text);
ck('a group with a tiny spend is not a finding: it is in "not enough to say"', !find('Carousel ads') && R.notEnough.some(g => g.label === 'Carousel ads' && g.spend_cents === 10000 && g.count === 0));
ck('the totals are kept: sales ads $3,700 spent, sign-up ads $800 for 94 sign-ups', R.totals.purchase.spend_cents === 370000 && R.totals.lead.spend_cents === 80000 && R.totals.lead.leads === 94);
ck('sign-up groups are judged against the average cost per sign-up, not the 1.5× line', R.findings.filter(f => f.kind === 'lead').every(f => /a sign-up on/.test(f.text) && /(lower|higher) than the \$[\d.]+ across all sign-up ads\.$/.test(f.text)) && R.findings.some(f => f.kind === 'lead'));
ck('every finding lists the ads behind it, each with an Ads Manager link, and a count of the rest', R.findings.every(f => f.sources.length > 0 && f.sources.every(s => s.url.startsWith('https://adsmanager.facebook.com/')) && f.sources.length + f.more === f.member_ids.length));
const lone = L.analyse([mk(1, {}, 60000, 200000, 40, 'c1'), mk(2, {}, 60000, 200000, 40, 'c1'), mk(3, {}, 60000, 200000, 40, 'c1')], { urlFor: U, period: { text: 'x' } });
ck('plenty of spend in ONE campaign is only an early sign, never "enough to read"', lone.findings.length > 0 && lone.findings.every(f => f.reliability === 'early'), JSON.stringify(lone.findings.map(f => f.reliability)));
const dud = L.analyse([1, 2, 3].map(i => mk(i, {}, 25000, 0, 0, 'c' + (i % 2 + 1))), { urlFor: U, period: { text: 'x' } });
ck('plenty spent with NOTHING bought is a "behind" finding that is enough to read (falling short is itself the finding)', dud.findings.length > 0 && dud.findings.every(f => f.side === 'behind' && f.reliability === 'enough' && /returned 0\.00×/.test(f.text)), dud.findings[0]?.text);
ck('thresholds are stricter than the weekly read: $500, 15 purchases, 3 ads, 2 campaigns for "enough"; $50 and 5 purchases for an early sign', L.ENOUGH.spend_cents === 50000 && L.ENOUGH.purchases === 15 && L.ENOUGH.ads === 3 && L.ENOUGH.campaigns === 2 && L.EARLY.spend_cents === V.MIN_SPEND_CENTS && L.EARLY.purchases === V.MIN_PURCHASES && L.ENOUGH.leads === 30 && L.EARLY.leads === V.MIN_LEADS);
ck('a return of 1.496 is shown and judged as 1.50 (the same number): never "1.50× behind the 1.50× line"', L.judgeGroup('purchase', { ret: 1.496, spend_cents: 100000, purchases: 30, ads: 4, campaigns: 3 }).side === 'ahead' && L.judgeGroup('purchase', { ret: 1.494, spend_cents: 100000, purchases: 30, ads: 4, campaigns: 3 }).side === 'behind');

console.log('-- the check: every statement is verified, and a bad one is refused');
const by = f => new Map(f.metrics.map(m => [m.id, m]));
const metrics = new V.Metrics(); const ctx = { urlFor: U, period: { text: 'x' }, targetId: null };
const grp = L.groupAds(ads).groups.find(g => g.id === 'purchase:format:video'), f0 = L.findingFor(grp, metrics, ctx), byId = new Map(metrics.list.map(m => [m.id, m]));
ck('the plain statement code writes passes the check', L.verifyFinding(f0, byId) === '', L.verifyFinding(f0, byId));
const t = (patch) => L.verifyFinding({ ...f0, ...patch }, byId);
ck('a wrong number is refused', t({ text: f0.text.replace('3.00×', '3.40×') }) !== '');
ck('a number in the text that no cited metric holds is refused', t({ text: f0.text.replace('48 purchases', '49 purchases') }) !== '');
ck('a reason ("because") or advice ("should", "so") is refused', t({ text: f0.text.replace('returned', 'returned well because of the picture, so it returned') }) !== '' && t({ text: f0.text.replace('ahead of', 'ahead of and should get more money against') }) !== '');
ck('a cited number that does not exist is refused', t({ ids: [...f0.ids, 'm999'] }) !== '' && t({ ids: [] }) !== '');
ck('a statement about another group (it must start with its own group) is refused', t({ text: 'Other ads ' + f0.text.replace(f0.label + ' ', '') }) !== '');
ck('saying "behind" about a group that is ahead (and the reverse) is refused', t({ text: f0.text.replace('ahead of', 'behind') }) !== '' && L.verifyFinding({ ...f0, side: 'behind' }, byId) !== '');
ck('an ad that is not in the group, a link that is not Ads Manager, or no ads at all is refused', t({ sources: [{ ...f0.sources[0], ad_id: 'zzz' }] }) !== '' && t({ sources: [{ ...f0.sources[0], url: 'https://example.invalid/' }] }) !== '' && t({ sources: [] }) !== '');
ck('a sum of two cited numbers is refused (48 + 6 = 54)', t({ text: f0.text.replace('48 purchases', '54 purchases') }) !== '');

console.log('-- re-reading: Newer, Still true, No longer true');
const S1 = L.statusFor([{ key: 'a' }, { key: 'b' }], [], 1);
ck('the first read: everything is Newer', S1.now.every(f => f.status === 'newer' && f.first_read === 1) && S1.gone.length === 0);
const S2 = L.statusFor([{ key: 'b' }, { key: 'c' }], S1.now, 2);
ck('the next read: b is Still true, c is Newer, a is No longer true', S2.now.find(f => f.key === 'b').status === 'still_true' && S2.now.find(f => f.key === 'c').status === 'newer' && S2.gone.map(f => f.key + ':' + f.status).join() === 'a:no_longer_true');
ck('Still true remembers when it was first seen', S2.now.find(f => f.key === 'b').first_read === 1);

console.log('-- the weeks');
const H = await import('../../lib/ops/adshistory.js'), Q = await import('../../lib/ops/adsdb.js');
const plan = H.planFor('2026-07-01', '2026-11-28');
ck('the plan runs from the Monday of the first campaign to the last whole week', plan.from === '2026-06-29' && plan.to === '2026-11-16' && plan.total === 21, JSON.stringify(plan));
ck('with no campaign there is no plan, and the plan never goes back more than 156 weeks', H.planFor('', '2026-11-28') === null && H.planFor('2001-01-01', '2026-11-28').total === 156);
const rows = [{ week_start: '2026-11-16', status: 'done', attempts: 0, read_at: new Date().toISOString() }, { week_start: '2026-11-09', status: 'done', attempts: 0, read_at: new Date(Date.now() - 30 * 3600e3).toISOString() }, { week_start: '2026-11-02', status: 'failed', attempts: 2 }, { week_start: '2026-10-26', status: 'failed', attempts: 3 }, { week_start: '2026-06-29', status: 'done', attempts: 0, read_at: new Date(Date.now() - 90 * 24 * 3600e3).toISOString() }];
const todo = H.pendingWeeks(plan, rows, '2026-11-28', Date.now()).map(x => x.week + (x.fresh ? '' : '*'));
ck('pending: missing weeks (newest first), a failed one with tries left, a recent week not read for a day (*); not a fresh recent week, not an old finished one, not one given up after three tries', !todo.includes('2026-11-16') && todo[0] === '2026-11-09*' && todo.includes('2026-11-09*') && todo.includes('2026-11-02') && !todo.includes('2026-10-26') && !todo.includes('2026-06-29*') && todo.includes('2026-07-06'), todo.join());
ck('progress counts finished weeks and those given up', JSON.stringify(H.progressOf(plan, rows)) === JSON.stringify({ done: 3, total: 21, gave_up: 1, left: 17 }), JSON.stringify(H.progressOf(plan, rows)));

console.log('-- the import, over several runs (the Meta mock, world "history")');
const MT = 'http://localhost:4556';
const meta = async (q = '') => (await fetch(`${MT}/__log${q}`)).json();
const mmode = q => fetch(`${MT}/__mode?${q}`);
const keyOn = on => { for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_ADS_LIVE']) delete process.env[k]; if (on) Object.assign(process.env, { META_ADS_TOKEN: 'mock-ads-token-for-the-history-test', META_AD_ACCOUNT_ID: 'act_MOCK1' }); };
const table = async () => (await Q.adsQuery("SELECT to_regclass('ads_history_weeks') AS t"))[0].t;
await fetch(`${MT}/__reset`); await fetch(`${MT}/__world?name=history`);
keyOn(false);
let r = await H.runHistory({});
ck('with no Meta key it says so, asks Meta nothing and makes no table', r.notConnected === true && /META_ADS_TOKEN/.test(r.note) && (await meta()).total === 0 && (await table()) == null);
let v = await H.historyView();
ck('and the page data is empty but fine (not connected, nothing read)', v.exists === false && v.meta.connected === false && v.working.length === 0 && v.coverage === null);
keyOn(true);
r = await H.runHistory({ preview: true });
let log = await meta('?reset=1');
ck('a preview asks for the campaign list only, says how many weeks there are, and keeps nothing (no table)', r.preview === true && r.weeks.total === 20 && /Would read up to 8 of the 20 weeks/.test(r.note) && log.requests.length === 1 && /\/campaigns$/.test(log.requests[0].path) && (await table()) == null, JSON.stringify([r, log.requests.map(x => x.path)]));
await mmode('rateLimitInsightsOnce=1'); await mmode('pageSize=7');
r = await H.runHistory({});
log = await meta('?reset=1');
ck('run 1: Meta says "too many requests" on the first week: the run stops at once, says so in plain words, and has read no week', r.rate_limited === true && r.weeks.read === 0 && /slow down/.test(r.note) && log.requests.filter(x => /\/insights$/.test(x.path)).length === 1, JSON.stringify(r));
ck('the ads were already read and kept (the next run does not read them again), and the page shows 0 of 20 weeks and "importing"', r.structure === true && (await table()) != null);
v = await H.historyView();
ck('the page data: 0 of 20 weeks, importing, and a note that Meta asked us to slow down', v.exists === true && v.coverage.weeks_done === 0 && v.coverage.weeks_total === 20 && v.coverage.importing === true && v.coverage.slowed === true, JSON.stringify(v.coverage));
r = await H.runHistory({});
log = await meta('?reset=1');
const insightsAsked = log.requests.filter(x => /\/insights$/.test(x.path));
ck('run 2 resumes: 8 weeks, newest first, in pages of 7; the ads are not read again', r.weeks.read === 8 && r.weeks.left === 12 && r.structure === false && !log.requests.some(x => /\/ads$/.test(x.path)) && insightsAsked.some(x => x.query.after), JSON.stringify(r.weeks));
const asked = [...new Set(insightsAsked.map(x => JSON.parse(x.query.time_range).since))];
ck('it read the eight most recent whole weeks, one week at a time, ad by ad, over Monday to Sunday', asked.length === 8 && asked.every(d => new Date(d + 'T12:00:00Z').getUTCDay() === 1) && asked[0] === V.addDays(V.mondayOf(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })), -7) && asked.join() === [...asked].sort().reverse().join(), asked.join());
ck('every request asked level=ad, never a write', insightsAsked.every(x => x.query.level === 'ad') && log.requests.every(x => !x.write && !x.tokenInUrl && x.auth));
v = await H.historyView();
ck('the page data is "Read 8 of 20 weeks" and the statements so far are provisional (no Newer / Still true labels yet)', v.coverage.weeks_done === 8 && v.coverage.importing === true && v.read_no === 0 && [...v.working, ...v.not_working].every(f => f.status === ''), JSON.stringify([v.coverage.weeks_done, v.read_no]));
r = await H.runHistory({});
ck('run 3: 8 more weeks (16 of 20)', r.weeks.read === 8 && r.weeks.left === 4);
r = await H.runHistory({}); await meta('?reset=1');
ck('run 4: the last 4 weeks, and then everything is read (20 of 20); the first full read counts as read number 1', r.weeks.read === 4 && r.weeks.left === 0 && r.analysed === true, JSON.stringify(r));
v = await H.historyView();
ck('the page data: all 20 weeks read, not importing, read number 1, every statement Newer', v.coverage.weeks_done === 20 && v.coverage.importing === false && v.read_no === 1 && [...v.working, ...v.not_working].length > 5 && [...v.working, ...v.not_working].every(f => f.status === 'newer'));
r = await H.runHistory({});
log = await meta('?reset=1');
ck('run 5: nothing to do (everything is read and fresh): no results asked from Meta, nothing re-analysed', r.weeks.read === 0 && r.analysed === false && !log.requests.some(x => /\/insights$/.test(x.path)));
await mmode('pageSize=0');

console.log('-- what was kept');
const count = async sql => Number((await Q.adsQuery(sql))[0].n);
ck('40 ads and 20 weeks are kept', (await count('SELECT COUNT(*) AS n FROM ads_history_ads')) === 40 && (await count('SELECT COUNT(*) AS n FROM ads_history_weeks WHERE status = \'done\'')) === 20);
const wk = (await Q.adsQuery("SELECT week_start, ad_rows FROM ads_history_weeks ORDER BY week_start DESC LIMIT 1"))[0];
const since = wk.week_start instanceof Date ? wk.week_start.toISOString().slice(0, 10) : String(wk.week_start).slice(0, 10);
const direct = await (await fetch(`${MT}/v21.0/act_MOCK1/insights?level=ad&limit=500&time_range=${encodeURIComponent(JSON.stringify({ since, until: new Date(Date.parse(since + 'T12:00:00Z') + 6 * 864e5).toISOString().slice(0, 10) }))}`, { headers: { Authorization: 'Bearer x' } })).json();
ck('paging lost nothing: the newest week has as many ad rows as Meta gives unpaged', direct.data.filter(x => Number(x.spend) > 0).length === Number(wk.ad_rows), `${direct.data.length} vs ${wk.ad_rows}`);
const dump = JSON.stringify(await Q.adsQuery("SELECT row_to_json(t) FROM (SELECT * FROM ads_history_ads) t")) + JSON.stringify(await Q.adsQuery('SELECT row_to_json(t) FROM (SELECT * FROM ads_history_findings) t')) + JSON.stringify(await Q.adsQuery('SELECT row_to_json(t) FROM (SELECT * FROM ads_settings) t')) + JSON.stringify(await Q.adsQuery('SELECT row_to_json(t) FROM (SELECT * FROM ads_history_results) t')) + JSON.stringify(v);
ck('no word of any ad, no marker and no email is in anything kept or shown (the mock put them in every ad\'s words)', !/MARKER-COPY|marker\.buyer|example\.invalid|Words about the practice|Is this the practice|dark mother/.test(dump));
ck('ad, campaign and ad set names are kept (those are allowed)', /Ad 1 · Kali/.test(dump) && /Kali: winter enrollment/.test(dump));
const fts = [...v.working, ...v.not_working];
const allOk = fts.every(f => V.verifyClaim(f.text, f.metrics.map(m => m.id), new Map(f.metrics.map(m => [m.id, m])), [f.label]) === '');
ck('re-checked here, independently, every statement kept rests on its own numbers (and none gives a reason or advice)', allOk && fts.every(f => !V.reasoningWord(f.text)));
ck('both sides are there: some groups ahead of the line and some behind it (video, the warm list ahead; carousel, no narrowing behind)', v.working.some(f => f.label === 'Video ads') && v.working.some(f => /already know EP/.test(f.label)) && v.not_working.some(f => f.label === 'Carousel ads') && v.not_working.some(f => /no audience narrowing/.test(f.label)), v.working.map(f => f.label).join(' | '));
ck('a group with too little behind it is listed as not enough to say (the barely-run campaign)', v.not_enough.some(g => /Yoga Sutras/.test(g.label)) && !fts.some(f => /Yoga Sutras/.test(f.label)), JSON.stringify(v.not_enough.map(g => g.label)));
ck('with no model key every statement is the plain one code wrote (the key is not set in this test)', fts.every(f => f.by === 'code') && v.phrasing === 'no_key');
ck('the account\'s own totals are in the data: sales ads and sign-up ads', v.totals.purchase.ads === 29 && v.totals.lead.ads === 10 && v.totals.purchase.ret > 1);
const all = (await meta()).requests;
ck('Meta saw only reads, the key was never in a URL', all.length === 0 || all.every(x => !x.write && !x.tokenInUrl));
const src = fs.readFileSync(path.join(here, '../../lib/ops/adshistory.js'), 'utf8'), imp = src.match(/import \{([^}]*)\} from '\.\/meta-ads\.js'/)[1].split(',').map(x => x.trim());
ck('the history reader imports only read functions from the Meta client (no write, no status change, no budget, no audience upload)', imp.every(n => /^(hasToken|adsMode|listAll\w+|getAdInsightsForRange|managerUrl|RATE_LIMIT_CODES)$/.test(n)) && !/\b(write|setStatus|setBudget|createCampaign|createAd|createAdSet|addAudienceUsers|createLookalike|createCustomAudience|uploadAdImage)\b/.test(src.replace(/\/\/.*$/gm, '')), imp.join());

console.log('-- a re-read after the history changed');
await mmode('histFlip=1');
await Q.adsQuery('DELETE FROM ads_history_weeks');
let n = 0; do { r = await H.runHistory({}); n++; } while (r.weeks.left > 0 && n < 6);
v = await H.historyView();
const gone = v.gone, newer = [...v.working, ...v.not_working].filter(f => f.status === 'newer'), still = [...v.working, ...v.not_working].filter(f => f.status === 'still_true');
ck('read number 2 was made once everything was read again (three runs)', v.read_no === 2 && n === 3, JSON.stringify([v.read_no, n]));
ck('"Video ads are ahead" and "the warm list is ahead" are No longer true (they turned out badly)', gone.some(f => f.label === 'Video ads' && f.side === 'ahead') && gone.some(f => /already know EP/.test(f.label) && f.side === 'ahead') && gone.every(f => f.status_text === 'No longer true'), gone.map(f => f.label).join(' | '));
ck('and "Video ads are behind" is Newer', newer.some(f => f.label === 'Video ads' && f.side === 'behind'), newer.map(f => f.label).join(' | '));
ck('what did not change is Still true (carousel ads behind) and keeps the date it was first seen', still.some(f => f.label === 'Carousel ads' && f.side === 'behind') && still.every(f => f.first_seen), still.map(f => f.label).join(' | '));
ck('No longer true statements are not in the working list or the not-working list', ![...v.working, ...v.not_working].some(f => f.status === 'no_longer_true'));
await mmode('histFlip=0');

console.log('-- Meta trouble never throws');
await mmode('permissionReads=1');
r = await H.runHistory({ now: new Date() });
ck('a key that may not read: a plain note, no throw, and what was read before stays', r.weeks.read === 0 && /didn’t accept the ads access key/.test(r.note) && (v2 => v2.working.length + v2.not_working.length > 0)(await H.historyView()), r.note);
await mmode('permissionReads=0'); await mmode('failReads=1');
r = await H.runHistory({});
ck('Meta down: a plain note, no throw', /error|try again/i.test(r.note) && r.weeks.read === 0, r.note);
await mmode('failReads=0');
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
