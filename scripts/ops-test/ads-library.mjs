// Ads PR 4 in node: the Audience library on an in-process Postgres (PGlite) and the Meta mock (:4556). `source env.sh`, run.sh running.
// (1) the Practice Report link (lib/ops/reportdata.js): with no REPORT_DATABASE_URL every function says "not connected" and nothing throws; it only ever runs a plain SELECT;
//     on a synthetic quiz (REPORT_TEST_DB=pglite, made-up people with names and emails) it returns counts and nothing else, no query mentions a personal column, no personal value
//     appears in any answer, and a mapping that points at a personal column is refused;
// (2) standing is worked out from a few campaigns of results (Proven = 2 campaigns at or above target, Promising = 1, Retired = below the floor 3 times, too early counts for nothing,
//     Traffic is not judged); the daily job writes it, is idempotent, preview records nothing, creates a row for a new audience, skips drafts / dry-run sends / Advantage+, and never calls Meta;
// (3) thresholds changed in Settings change the outcome; Bring back is recorded (who, when) and forgives the strikes; tags are editable and checked;
// (4) the library list and detail, what it buys, the archetype overlap; (5) suggestions: tag-matched first, Proven → Promising → Not tested → New test, Retired never.
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite'; delete process.env.META_ADS_TOKEN; delete process.env.REPORT_DATABASE_URL; delete process.env.REPORT_TEST_DB;
const R = await import('../../lib/ops/reportdata.js'), S = await import('../../lib/ops/adsstore.js'), L = await import('../../lib/ops/adslibrary.js'), A = await import('../../lib/ops/adsaudiences.js');
const meta = async (q = '') => (await fetch(`http://localhost:4556/__log${q}`)).json();
await meta('?reset=1');

console.log('-- the Practice Report link: not connected');
const off = [await R.archetypeCounts(), await R.answerCounts('stuck'), await R.archetypesByAd(), R.reportStatus(), R.answerCategories()];
ck('with no REPORT_DATABASE_URL every function answers {connected:false} and nothing throws', off.every(o => o.connected === false) && /isn’t connected yet/.test(off[0].reason) && /REPORT_DATABASE_URL/.test(off[0].todo), JSON.stringify(off[0]));
ck('and there is no database call: the "connected" check is false', R.reportConfigured() === false);
for (const v of ['DELETE FROM t', 'UPDATE t SET a = 1', 'SELECT 1; DROP TABLE t', 'INSERT INTO t VALUES (1)', 'drop table t', 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x', 'select pg_sleep(1); select 2'])
  ck(`the read-only door refuses: ${v.slice(0, 40)}`, (() => { try { R.assertReadOnly(v); return false; } catch { return true; } })());
ck('and lets a plain SELECT through', R.assertReadOnly('SELECT a, COUNT(*) FROM t GROUP BY a') === 'SELECT a, COUNT(*) FROM t GROUP BY a');

console.log('-- the Practice Report link: a synthetic quiz (made-up people)');
process.env.REPORT_TEST_DB = 'pglite';
const arch = await R.archetypeCounts(), ans = await R.answerCounts('stuck'), ad = await R.archetypesByAd(), cats = R.answerCategories();
ck('connected, with the archetype counts biggest first (60 results)', arch.connected && arch.ok && arch.total === 60 && arch.archetypes[0].archetype === 'The Contemplative' && arch.archetypes[0].count === 30 && arch.archetypes.length === 3, JSON.stringify(arch));
ck('counts per answer category, from the quiz’s own questions', ans.ok && ans.label === 'What they get stuck on' && ans.total === 60 && ans.answers.every(a => ['time', 'doubt', 'isolation'].includes(a.answer)) && cats.categories.length === 3);
ck('an unknown question is said plainly, not guessed', (await R.answerCounts('nope')).ok === false);
ck('arrivals from an ad, by the campaign tag and archetype (20 of the 60 came from kali-winter-2027)', ad.ok && ad.rows.length > 0 && ad.rows.every(r => r.campaign === 'kali-winter-2027') && ad.rows.reduce((n, r) => n + r.count, 0) === 20 && ad.hasContent === true, JSON.stringify(ad.rows));
const since = new Date(Date.now() - 5 * 86400e3).toISOString().slice(0, 10), recent = await R.archetypeCounts({ since });
ck('a period narrows the counts', recent.ok && recent.total > 0 && recent.total < 60);
const everything = JSON.stringify([arch, ans, ad, cats, recent, R.reportStatus()]), queries = R.reportQueryLog();
ck('no personal value appears in any answer (no name, no email)', !/Synthetic Person|synthetic\.person|example\.invalid|@/.test(everything));
ck('every query is a plain SELECT of one column and a count, grouped, and none names a personal column', queries.length >= 4 && queries.every(q => /^SELECT /.test(q) && /COUNT\(\*\)/.test(q) && /GROUP BY/.test(q) && !/full_name|email|name\b|\*/i.test(q.replace(/COUNT\(\*\)/g, ''))), queries[0]);
ck('every column a query uses is in REPORT_SCHEMA (nothing else is ever selected)', queries.every(q => (q.match(/"[a-z_]+"/g) || []).every(c => [R.REPORT_SCHEMA.table, R.REPORT_SCHEMA.archetype, R.REPORT_SCHEMA.takenAt, R.REPORT_SCHEMA.utmSource, R.REPORT_SCHEMA.utmCampaign, R.REPORT_SCHEMA.utmContent, ...Object.values(R.REPORT_SCHEMA.categories).map(x => x.column)].includes(c.replace(/"/g, '')))));
const keep = R.REPORT_SCHEMA.archetype; R.REPORT_SCHEMA.archetype = 'email';
const refused = await R.archetypeCounts(); R.REPORT_SCHEMA.archetype = keep;
ck('a mapping that points at a personal column is refused, and nothing is read', refused.ok === false && !/@/.test(JSON.stringify(refused)));
const ideas = L.audienceIdeas(arch);
ck('new audience ideas are plain sentences with the count behind them, and say when the group is too small for a lookalike', ideas.length === 3 && /^A lookalike of people who got “The Contemplative” \(30 people\)/.test(ideas[0].text) && /small group/.test(ideas[0].text) && ideas[0].enough === false && L.audienceIdeas({ ok: true, archetypes: [{ archetype: 'X', count: 250 }] })[0].enough === true && L.audienceIdeas(off[0]).length === 0);

console.log('-- standing, from results');
const th = L.DEFAULT_THRESHOLDS;
ck('the starting thresholds are 2, 1, 3, $40 and 3 days', th.proven_after === 2 && th.promising_after === 1 && th.retire_after === 3 && th.min_spend_cents === 4000 && th.min_days === 3);
const j = (o, extra = {}) => L.judge({ goal: 'Purchase', rule: { metric: 'roas', raise_threshold: 1.5, off_threshold: 1.2 }, spend: 8000, revenue: 8000 * o, days: 4, ...extra }, th).outcome;
ck('return: 1.5× or more is above target, between is below target, under 1.2× is below the floor', j(1.5) === 'above target' && j(2.4) === 'above target' && j(1.3) === 'below target' && j(1.2) === 'below target' && j(1.19) === 'below floor' && j(0.4) === 'below floor');
ck('too little spend or too few days is too early (counts for nothing); Traffic is not judged', j(2, { spend: 3999 }) === 'too early' && j(2, { days: 2 }) === 'too early' && j(2, { spend: 0 }) === 'too early' && L.judge({ goal: 'Traffic', spend: 9999, days: 9 }, th).outcome === 'not judged');
const lead = (cpl, extra = {}) => L.judge({ goal: 'Lead', rule: { metric: 'cpl', raise_threshold: 1.5, off_threshold: 2.5 }, spend: 7500, leads: Math.round(7500 / (cpl * 100)), days: 4, ...extra }, th).outcome;
ck('cost per lead: at most $1.50 is above target, more than $2.50 is below the floor, no leads at all is below the floor', lead(1) === 'above target' && lead(1.5) === 'above target' && lead(2) === 'below target' && lead(3) === 'below floor' && lead(2.5) === 'below target' && L.judge({ goal: 'Lead', rule: { metric: 'cpl', raise_threshold: 1.5, off_threshold: 2.5 }, spend: 8000, leads: 0, days: 4 }, th).outcome === 'below floor');
ck('with no rules saved the goal’s defaults are used (1.5× / $1.50)', L.judge({ goal: 'Purchase', rule: null, spend: 8000, revenue: 8000 * 1.6, days: 4 }, th).outcome === 'above target');
const o = x => ({ outcome: x, spend_cents: 9000 });
const st = (outs, ov = {}, t = th) => L.standingOf(outs.map(o), ov, t).standing;
ck('Proven = above target twice; Promising = once; Not tested = none yet', st(['above target', 'above target']) === 'Proven' && st(['above target', 'below target']) === 'Promising' && st([]) === 'Not tested' && st(['too early', 'below target']) === 'Not tested');
ck('Retired = below the floor three times; two strikes is not enough', st(['below floor', 'below floor', 'below floor']) === 'Retired' && st(['below floor', 'below floor', 'above target']) === 'Promising');
ck('Bring back forgives the strikes so far, and new ones count again', st(['below floor', 'below floor', 'below floor'], { strikes_forgiven: 3 }) === 'Not tested' && st(['below floor', 'below floor', 'below floor', 'below floor'], { strikes_forgiven: 3 }) === 'Not tested' && st(['below floor', 'below floor', 'below floor', 'below floor'], { strikes_forgiven: 3 }, { ...th, retire_after: 1 }) === 'Retired');

console.log('-- nothing in the database yet');
ck('before anything is saved the Ads tables do not exist', (await S.adsTablesExist()) === false);
const none = await L.runLibraryUpdate();
ck('the daily job says "No campaigns yet." and creates no table', none.note === 'No campaigns yet.' && none.audiences.created === 0 && (await S.adsTablesExist()) === false, JSON.stringify(none));
const nonePrev = await L.runLibraryUpdate({ preview: true }), lst = await L.libraryList();
ck('so does the preview, and the library page reads as empty without making a table', nonePrev.note === 'No campaigns yet.' && lst.exists === false && lst.rows.length === 0 && (await L.getThresholds()).proven_after === 2 && (await S.adsTablesExist()) === false);

console.log('-- campaigns with results');
const DAYS = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
const SPEND = 2000;   // $20 a day for four days: $80 an ad set
const tgt = (id, name) => ({ geo_locations: { countries: ['US'] }, age_min: 25, age_max: 65, flexible_spec: [{ interests: [{ id, name }] }], _detail: `People interested in ${name}` });
const results = [];
async function campaign(name, goal, sets, extra = {}) {
  const c = await S.createRow('campaigns', { name, goal, structure: 'test', status: 'live', meta_campaign_id: `meta-${name}`, utm: { utm_campaign: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, ...extra });
  if (goal !== 'Traffic') await S.createRow('rules', { campaign_id: c.id, metric: goal === 'Lead' ? 'cpl' : 'roas', raise_threshold: 1.5, off_threshold: goal === 'Lead' ? 2.5 : 1.2 });
  const made = [];
  for (const [i, s] of sets.entries()) {
    const a = await S.createRow('adsets', { campaign_id: c.id, position: i + 1, audience_id: s.lib || '', audience_name: s.name, targeting: s.targeting || tgt(String(100 + i), s.name.replace('Interests · ', '')), meta_adset_id: `metaset-${name}-${i}`, daily_budget_cents: SPEND });
    made.push(a);
    for (const d of s.days || DAYS) results.push({ date: d, campaign_id: c.id, adset_id: a.id, ad_id: '', spend_cents: s.spend ?? SPEND, revenue_cents: Math.round((s.spend ?? SPEND) * (s.roas || 0)), leads: s.cpl ? Math.round((s.spend ?? SPEND) / (s.cpl * 100)) : 0 });
  }
  return { c, made };
}
// the library already holds four audiences from an earlier hand-made list
const aud = {};
for (const n of ['Interests · Meditation', 'Interests · Yoga', 'Interests · Mindfulness', 'Interests · Tantra', 'Interests · Buddhism']) aud[n] = await S.createRow('audiences', { name: n, source: 'interest', meta_settings: { targeting: tgt(n.slice(-4), n.slice(12)) }, tags: ['kali'] });
const ids = Object.fromEntries(Object.entries(aud).map(([k, v]) => [k, v.id]));
await campaign('Kali Winter 2027', 'Purchase', [
  { name: 'Interests · Meditation', lib: ids['Interests · Meditation'], roas: 2.4 }, { name: 'Interests · Yoga', lib: ids['Interests · Yoga'], roas: 1.8 }, { name: 'Interests · Mindfulness', lib: ids['Interests · Mindfulness'], roas: 1.3 },
  { name: 'Interests · Tantra', lib: ids['Interests · Tantra'], roas: 0.8 }, { name: 'Interests · Buddhism', lib: ids['Interests · Buddhism'], roas: 0.4 }]);
await campaign('Pilgrimage 2027', 'Purchase', [
  { name: 'Interests · Meditation', lib: ids['Interests · Meditation'], roas: 1.6 }, { name: 'Interests · Yoga', lib: ids['Interests · Yoga'], roas: 0.9 }, { name: 'Interests · Tantra', lib: ids['Interests · Tantra'], roas: 0.7 },
  { name: 'Interests · Buddhism', lib: ids['Interests · Buddhism'], roas: 0.5 }, { name: 'Interests · Ayurveda', roas: 2.0 }]);   // Ayurveda is not in the library yet
await campaign('Sādhana Spring 2027', 'Purchase', [
  { name: 'Interests · Tantra', lib: ids['Interests · Tantra'], roas: 0.6 }, { name: 'Interests · Buddhism', lib: ids['Interests · Buddhism'], roas: 0.3 }, { name: 'Interests · Mindfulness', lib: ids['Interests · Mindfulness'], roas: 1.0, spend: 500 },   // spent $5 each day: $20, too early
  { name: 'Interests · Yoga', lib: ids['Interests · Yoga'], roas: 1.7, days: DAYS.slice(0, 2) }]);   // good, but only two days
await campaign('Practice Report quiz', 'Lead', [{ name: 'Interests · Meditation', lib: ids['Interests · Meditation'], cpl: 1.1 }, { name: 'Interests · Mindfulness', lib: ids['Interests · Mindfulness'], cpl: 3.2 }]);
await campaign('Warm-up traffic', 'Traffic', [{ name: 'Interests · Yoga', lib: ids['Interests · Yoga'], roas: 5 }]);
await campaign('Advantage test', 'Purchase', [{ name: 'Advantage+ audience', roas: 9 }], { structure: 'advantage' });
await campaign('Dry run only', 'Purchase', [{ name: 'Interests · Reiki', roas: 9 }], { meta_campaign_id: 'dryrun-abc' });
await campaign('Still a draft', 'Purchase', [{ name: 'Interests · Qigong', roas: 9 }], { status: 'draft' });
await S.upsertResults(results);
const countRows = async () => ({ a: (await S.listRows('audiences')).length, r: (await S.listRows('audience_results')).length });
const before = await countRows(), snap = JSON.stringify(await S.listRows('audiences'));
const prev = await L.runLibraryUpdate({ preview: true });
ck('the preview works everything out and records nothing', prev.preview === true && prev.audiences.created === 1 && prev.results.written > 0 && JSON.stringify(await countRows()) === JSON.stringify(before) && JSON.stringify(await S.listRows('audiences')) === snap, JSON.stringify(prev));
const run1 = await L.runLibraryUpdate();
const byName = async () => Object.fromEntries((await S.listRows('audiences')).map(a => [a.name, a]));
let lib = await byName();
ck('the job counted the 6 campaigns that are really in Meta (not the draft, not the dry-run send), and made one new library row (Ayurveda)', run1.campaigns === 6 && run1.audiences.created === 1 && !!lib['Interests · Ayurveda'] && !lib['Interests · Reiki'] && !lib['Interests · Qigong'] && !lib['Advantage+ audience'] && Object.keys(lib).length === 6, JSON.stringify(run1));
ck('Meditation is Proven (above target in Kali and Pilgrimage, and in the cost-per-lead campaign: 3 campaigns)', lib['Interests · Meditation'].standing === 'Proven' && lib['Interests · Meditation'].wins === 3 && lib['Interests · Meditation'].campaigns_count === 3, JSON.stringify(lib['Interests · Meditation']));
ck('Yoga is Promising (above target once, 0.9 is a strike, the 1.7 on two days is too early, Traffic is not judged but counts as a campaign it ran in)', lib['Interests · Yoga'].standing === 'Promising' && lib['Interests · Yoga'].wins === 1 && lib['Interests · Yoga'].strikes === 1 && lib['Interests · Yoga'].campaigns_count === 4, JSON.stringify(lib['Interests · Yoga']));
ck('Tantra is Retired: below the floor in all three campaigns', lib['Interests · Tantra'].standing === 'Retired' && lib['Interests · Tantra'].strikes === 3 && !!lib['Interests · Tantra'].retired_at);
ck('Buddhism is Retired too (0.4, 0.5, 0.3)', lib['Interests · Buddhism'].standing === 'Retired');
ck('Mindfulness is Not tested: below target once, a $5-a-day set is too early, and a $3.33 lead is a strike but only one', lib['Interests · Mindfulness'].standing === 'Not tested' && lib['Interests · Mindfulness'].strikes === 1 && lib['Interests · Mindfulness'].wins === 0);
ck('the new Ayurveda row has its Meta settings saved (exactly, without the ad set’s own notes), is tagged from the campaign name and is Promising (2.0×, once)', lib['Interests · Ayurveda'].standing === 'Promising' && lib['Interests · Ayurveda'].meta_settings.targeting.flexible_spec[0].interests[0].name === 'Ayurveda' && !('_detail' in lib['Interests · Ayurveda'].meta_settings.targeting) && lib['Interests · Ayurveda'].tags.includes('pilgrimage') && lib['Interests · Ayurveda'].source === 'interest', JSON.stringify(lib['Interests · Ayurveda']));
ck('best result is the highest return (Meditation 2.4×) and, for a lead campaign, the lowest cost per lead', lib['Interests · Meditation'].best_result.roas === 2.4 && lib['Interests · Meditation'].best_result.cpl_cents === 111, JSON.stringify(lib['Interests · Meditation'].best_result));
const rs = await S.listRows('audience_results', { audience_id: ids['Interests · Tantra'] });
ck('each campaign is kept as a result row with the ad set, the money and the verdict', rs.length === 3 && rs.every(r => r.outcome === 'below floor' && r.spend_cents === 8000 && r.roas < 1.2 && r.adset_id));
ck('Meta was not called by the job (the mock saw no request at all)', (await meta()).total === 0);
const shot = async () => JSON.stringify([await S.listRows('audiences'), await S.listRows('audience_results')]);   // with updated_at: any write at all shows
const s1 = await shot(), again = await L.runLibraryUpdate(), s2 = await shot();
ck('running it again changes nothing at all (idempotent: no row written, not even an updated_at)', again.audiences.created === 0 && again.audiences.changed === 0 && again.results.written === 0 && again.changes.length === 0 && s1 === s2, JSON.stringify(again));

console.log('-- thresholds (Settings)');
const logged = [];
const log = (...a) => { logged.push(a); };
let r = await L.saveThresholds({ proven_after: 3 }, 'Jacob', log);
ck('a director saves a new value: it is kept and put on the Change Log with who, what, from and to', r.proven_after === 3 && r.changed.length === 1 && logged.length === 1 && logged[0][0] === 'Jacob' && logged[0][3] === 'Campaigns at or above target for Proven' && logged[0][4] === 2 && logged[0][5] === 3, JSON.stringify(logged));
await L.runLibraryUpdate(); lib = await byName();
ck('with Proven needing 3 campaigns Meditation is still Proven (3 wins) but at 4 it is only Promising', lib['Interests · Meditation'].standing === 'Proven' && (await L.saveThresholds({ proven_after: 4 }, 'Jacob', log)).proven_after === 4 && (await L.runLibraryUpdate(), (await byName())['Interests · Meditation'].standing === 'Promising'));
await L.saveThresholds({ proven_after: 2 }, 'Jacob', log); await L.runLibraryUpdate();
ck('put back to 2 it is Proven again, with no other audience moved', (await byName())['Interests · Meditation'].standing === 'Proven' && (await byName())['Interests · Yoga'].standing === 'Promising');
await L.saveThresholds({ retire_after: 4 }, 'Jacob', log); await L.runLibraryUpdate(); lib = await byName();
ck('retiring after 4 strikes leaves Tantra and Buddhism (3 each) Not tested', lib['Interests · Tantra'].standing === 'Not tested' && lib['Interests · Tantra'].retired_at === null && lib['Interests · Buddhism'].standing === 'Not tested');
await L.saveThresholds({ retire_after: 3 }, 'Jacob', log); await L.runLibraryUpdate();
await L.saveThresholds({ min_spend_cents: 10000 }, 'Jacob', log); await L.runLibraryUpdate(); lib = await byName();
ck('a minimum spend of $100 means $80 ad sets are too early: nothing is above target any more', lib['Interests · Meditation'].standing === 'Not tested' && lib['Interests · Tantra'].standing === 'Not tested' && lib['Interests · Tantra'].strikes === 0);
await L.saveThresholds({ min_spend_cents: 4000 }, 'Jacob', log); await L.saveThresholds({ min_days: 5 }, 'Jacob', log); await L.runLibraryUpdate();
ck('a minimum of 5 days also leaves four-day sets too early', (await byName())['Interests · Meditation'].standing === 'Not tested');
await L.saveThresholds({ min_days: 3 }, 'Jacob', log); await L.runLibraryUpdate();
const nlog = logged.length; await L.saveThresholds({ min_days: 3 }, 'Jacob', log);
ck('back at the starting values the same standings come back, and saving the same values logs nothing', (await byName())['Interests · Meditation'].standing === 'Proven' && (await byName())['Interests · Tantra'].standing === 'Retired' && logged.length === nlog);
const refuse = async v => { try { await L.saveThresholds(v, 'Jacob', log); return null; } catch (e) { return e; } };
ck('nonsense is refused in plain words: a word, a negative, too many, Promising above Proven; unknown fields are ignored', /whole number/.test((await refuse({ retire_after: 'lots' }))?.message) && /whole number/.test((await refuse({ min_days: -1 }))?.message) && /whole number/.test((await refuse({ retire_after: 500 }))?.message) && /Promising/.test((await refuse({ promising_after: 5 }))?.message) && (await L.saveThresholds({ shoe_size: 9 }, 'Jacob', log)).changed.length === 0);

console.log('-- Bring back and tags');
const bb0 = await L.bringBack(ids['Interests · Meditation'], 'Rebecka');
ck('only a Retired audience can be brought back', bb0.ok === false && bb0.status === 409);
const t0 = new Date('2026-12-01T15:00:00Z'), bb = await L.bringBack(ids['Interests · Tantra'], 'Rebecka Lind', t0);
let tan = (await byName())['Interests · Tantra'];
ck('Bring back returns it to the library, recorded with who and when, strikes forgiven', bb.ok && tan.standing === 'Not tested' && tan.retired_at === null && tan.override.by === 'Rebecka Lind' && tan.override.at === t0.toISOString() && tan.override.strikes_forgiven === 3, JSON.stringify(tan.override));
await L.runLibraryUpdate(); await L.runLibraryUpdate();
ck('the next morning updates do not retire it again (the old strikes stay forgiven)', (await byName())['Interests · Tantra'].standing === 'Not tested' && (await byName())['Interests · Tantra'].override.by === 'Rebecka Lind');
const settle = async () => { await S.upsertResults(results.splice(0)); };
await campaign('Wisdom School Autumn', 'Purchase', [{ name: 'Interests · Tantra', lib: ids['Interests · Tantra'], roas: 0.5 }]); await settle(); await L.runLibraryUpdate();
tan = (await byName())['Interests · Tantra'];
ck('one new strike counts (1 of 3), so it is not Retired yet', tan.standing === 'Not tested' && tan.strikes === 4);
await L.saveThresholds({ retire_after: 1 }, 'Jacob', log); await L.runLibraryUpdate();
ck('and with retiring after 1 strike that new strike retires it again (only the new one counts)', (await byName())['Interests · Tantra'].standing === 'Retired');
await L.saveThresholds({ retire_after: 3 }, 'Jacob', log); await L.runLibraryUpdate();

const tg = await L.setTags(ids['Interests · Yoga'], ['  Kali ', 'tantra', 'Enrollment', 'tantra']);
ck('tags are tidied (lower case, no repeats) and saved', JSON.stringify(tg.tags) === JSON.stringify(['kali', 'tantra', 'enrollment']) && JSON.stringify((await S.getRow('audiences', ids['Interests · Yoga'])).tags) === JSON.stringify(['kali', 'tantra', 'enrollment']));
ck('a comma-separated list works too', JSON.stringify((await L.setTags(ids['Interests · Yoga'], 'kali, wisdom school')).tags) === JSON.stringify(['kali', 'wisdom school']));
const bt = async t => { try { await L.setTags(ids['Interests · Yoga'], t); return null; } catch (e) { return e; } };
ck('a tag that is too long or has odd characters, or more than twelve tags, is refused in plain words', /short word or two/.test((await bt(['x'.repeat(40)]))?.message) && /short word or two/.test((await bt(['<b>']))?.message) && /Twelve/.test((await bt(Array.from({ length: 13 }, (_, i) => `tag ${i}`)))?.message));
await L.runLibraryUpdate();
ck('the job never touches a person’s tags', JSON.stringify((await byName())['Interests · Yoga'].tags) === JSON.stringify(['kali', 'wisdom school']));

console.log('-- the library list and one audience');
const list = await L.libraryList();
ck('the library page reads the whole library', list.exists && list.rows.length === 6);
const order = list.rows.map(x => x.standing), rank = { Proven: 0, Promising: 1, 'Not tested': 2, Retired: 3 };
ck('sorted by standing, and the counts add up', order.every((x, i) => !i || rank[order[i - 1]] <= rank[x]) && Object.values(list.counts).reduce((n, v) => n + v, 0) === list.rows.length && list.tags.includes('kali') && list.tags.includes('wisdom school'), JSON.stringify(list.counts));
const med = await L.libraryDetail(ids['Interests · Meditation']);
ck('one audience shows its result in every campaign it ran in, against that campaign’s own target and floor', med.results.length === 3 && med.results.find(x => x.campaign === 'Kali Winter 2027').value === '2.4×' && /target 1\.5×, floor 1\.2×/.test(med.results.find(x => x.campaign === 'Kali Winter 2027').target) && /\$1\.11 a lead/.test(med.results.find(x => x.campaign === 'Practice Report quiz').value) && /target \$1\.50 a lead, floor \$2\.50/.test(med.results.find(x => x.campaign === 'Practice Report quiz').target), JSON.stringify(med.results));
ck('and says in plain words what it does and doesn’t buy, from the numbers and the tags', med.says.some(l => /met its target in 3 of 3 judged campaigns/.test(l) && /Kali Winter 2027 \(2\.4×\)/.test(l)) && med.says.some(l => /By goal: Purchase 2 of 2, Lead 1 of 1/.test(l)) && med.says.some(l => /Tagged for: kali/.test(l)), JSON.stringify(med.says));
const mind = await L.libraryDetail(ids['Interests · Mindfulness']);
ck('an audience that fell short says where: “below the floor in Practice Report quiz”', mind.says.some(l => /fell below the floor in Practice Report quiz \(\$3\.33 a lead\)/.test(l)) && mind.says.some(l => /between the target and the floor in Kali Winter 2027/.test(l)), JSON.stringify(mind.says));
ck('its exact Meta settings are there as saved (the interest and the ages)', med.settings.flexible_spec[0].interests[0].name === 'Meditation' && med.settings.age_min === 25 && (await L.libraryDetail('aud_nope')) === null);
const kali = med.results.find(x => x.campaign === 'Kali Winter 2027');

console.log('-- the overlap with quiz archetypes');
const byAd = await R.archetypesByAd({}), none2 = L.overlapOf({ results: [{ utm_campaign: 'some-other', adset_id: 'x' }] }, byAd);
ck('with no matching link tag it shows nothing rather than guess', none2.state === 'none');
const camp = L.overlapOf({ results: [{ utm_campaign: 'kali-winter-2027', adset_id: 'x' }] }, byAd);
ck('with the campaign’s tag it shows the archetype mix of the 20 people who arrived from it, at campaign level, with shares', camp.state === 'ok' && camp.level === 'campaign' && camp.total === 20 && camp.rows.reduce((n, x) => n + x.count, 0) === 20 && camp.rows.every(x => x.share > 0));
const fine = L.overlapOf({ results: [{ utm_campaign: 'kali-winter-2027', adset_id: 'ast_7' }] }, { ...byAd, rows: [...byAd.rows, { campaign: 'kali-winter-2027', content: 'ast_7', archetype: 'The Scholar', count: 4 }] });
ck('when the links carry the ad set, only that ad set’s visitors count', fine.state === 'ok' && fine.level === 'ad set' && fine.total === 4 && fine.rows[0].archetype === 'The Scholar');
ck('not connected and a failed read are said, not hidden', L.overlapOf({ results: [] }, off[2]).state === 'not_connected' && L.overlapOf({ results: [] }, { connected: true, ok: false, error: 'x' }).state === 'error');

console.log('-- suggestions for a new campaign (PR 2’s, now from the library)');
const lib2 = {};
for (const [n, standing, tags, best] of [['S · Proven kali', 'Proven', ['kali'], { roas: 3 }], ['S · Promising kali', 'Promising', ['kali'], { roas: 1.6 }], ['S · Untested kali', 'Not tested', ['kali'], {}], ['S · Retired kali', 'Retired', ['kali'], {}],
  ['S · Proven other', 'Proven', ['cooking'], { roas: 9 }], ['S · Promising type', 'Promising', ['enrollment'], {}]]) lib2[n] = await S.createRow('audiences', { name: n, standing, tags, best_result: best, meta_settings: { targeting: tgt('9', n) } });
process.env.META_ADS_TOKEN = 'mock-token-for-library'; process.env.META_AD_ACCOUNT_ID = 'act_MOCK1';
let sg = (await A.suggestAudiences({ topic: 'Kali Winter 2027', types: '' })).candidates, nm = sg.map(c => c.name);
const iS = n => nm.indexOf(n);
ck('matched on the topic’s tags first, Proven → Promising → Not tested', iS('S · Proven kali') < iS('S · Promising kali') && iS('S · Promising kali') < iS('S · Untested kali'), nm.slice(0, 8).join(' | '));
ck('those that do not match follow, in the same order, and before any Meta interest', iS('S · Untested kali') < iS('S · Proven other') && iS('S · Proven other') < iS('S · Promising type') && sg.findLastIndex(c => c.key.startsWith('lib:')) < sg.findIndex(c => c.key.startsWith('int:')));
await S.createRow('audiences', { name: 'Hinduism, the long way', standing: 'Retired', tags: [], meta_settings: { targeting: tgt('6003195797498', 'Hinduism') } });
sg = (await A.suggestAudiences({ topic: 'Kali Winter 2027', types: '' })).candidates; nm = sg.map(c => c.name);
ck('a Retired audience is never suggested', !nm.includes('S · Retired kali') && !nm.includes('Interests · Buddhism') && !nm.includes('Hinduism, the long way'));
ck('and the same interest is not offered again as a fresh “New test” (by its Meta id, or by name), Retired or not', !sg.some(c => c.key === 'int:6003195797498') && nm.filter(n => n === 'Interests · Meditation').length === 1 && nm.filter(n => n === 'Interests · Yoga').length === 1, nm.join(' | '));
ck('Proven ones carry their past result, the rest are “New test”; Meta interests come last, also “New test”', sg.find(c => c.name === 'S · Proven kali').label === 'Proven' && /3\.0×/.test(sg.find(c => c.name === 'S · Proven kali').result) && sg.find(c => c.name === 'S · Promising kali').label === 'New test' && sg.filter(c => c.key.startsWith('int:')).length > 0 && sg.findLastIndex(c => c.key.startsWith('lib:')) < sg.findIndex(c => c.key.startsWith('int:')));
sg = (await A.suggestAudiences({ topic: 'Something unrelated', types: 'Enrollment SS' })).candidates;
ck('the course type matches tags too: an Enrollment launch is offered the “enrollment” audience first', sg[0].name === 'S · Promising type', sg.slice(0, 3).map(c => c.name).join(' | '));
ck('the Meta mock saw only reads while suggestions were made', (await meta()).requests.every(x => !x.write));

console.log('-- a table made before this pull request gets the new columns');
const { adsQuery } = await import('../../lib/ops/adsdb.js');
await adsQuery('ALTER TABLE ads_audiences DROP COLUMN wins, DROP COLUMN strikes, DROP COLUMN override'); await adsQuery('DROP TABLE ads_settings'); S.forgetAdsTables();
await S.ensureAdsTables();
const old = (await S.listRows('audiences'))[0];
ck('ensureAdsTables adds the audience columns (wins, strikes, override) and the settings table to a database made earlier, keeping its rows', 'wins' in old && 'strikes' in old && old.override && typeof old.override === 'object' && (await S.listRows('audiences')).length === 13 && (await S.listRows('settings')).length === 0);

console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
