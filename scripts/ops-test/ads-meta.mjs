// Ads PR 1: the Meta client (lib/ops/meta-ads.js) against the Meta mock (meta-mock.mjs, :4556), and the Ads store (lib/ops/adsstore.js) on an
// in-process Postgres. Nothing real is contacted: META_ADS_BASE points at the mock, and the store never sees DATABASE_URL.
//   source scripts/ops-test/env.sh; bash scripts/ops-test/run.sh   (starts the mock), then: node scripts/ops-test/ads-meta.mjs
// Checks: (c) no token = "not connected" and no request; (a) the switch off = every write is a dry run and the mock sees no write;
// (b) the switch on (test only, at the mock) = a full 5 × 5 is built paused and edits, results and audiences work, a refusing Meta is reported;
// (d) the token appears nowhere (output, answers, the mock's log); (e) every kind of thing round-trips in the store, and ensureAdsTables is safe to repeat.
import crypto from 'node:crypto';
process.removeAllListeners('warning');   // Node's note about lib files that have no "type": "module"

const MOCK = 'http://localhost:4556';
if (process.env.META_ADS_BASE !== MOCK) { console.log('FAIL: run `source scripts/ops-test/env.sh` first (META_ADS_BASE must be the mock)'); process.exit(1); }
const j = async (path) => (await fetch(MOCK + path)).json();
await j('/__reset');   // the mock keeps what it was given until told to forget
const out = [];   // everything written to the console while the client ran
for (const m of ['log', 'warn', 'error', 'info']) { const o = console[m].bind(console); console[m] = (...a) => { out.push(a.map(String).join(' ')); if (m === 'log' && /^(ok|FAIL|--)/.test(String(a[0]))) o(...a); }; }
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
let bad = 0;
const ck = (n, c, extra = '') => { if (c) say('ok  ', n); else { bad++; say('FAIL', n, extra); } };
const answers = [];   // every answer, to look for the token in
const keep = r => { answers.push(JSON.stringify(r)); return r; };

const M = await import('../../lib/ops/meta-ads.js');
const S = await import('../../lib/ops/adsstore.js');
const TOKEN = 'ads-test-token-' + crypto.randomBytes(12).toString('hex');
for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'META_PAGE_ID', 'META_IG_USER_ID', 'META_ADS_LIVE', 'DATABASE_URL', 'POSTGRES_URL']) delete process.env[k];

say('-- (c) no token: "not connected", and no request is made');
await j('/__log?reset=1');
const nc = [await M.getAccount(), await M.getPixel(), await M.getPage(), await M.searchInterests('yoga'), await M.listCampaigns(), await M.getInsights({ since: '2026-11-01', until: '2026-11-07' })].map(keep);
ck('every read answers notConnected with a plain message', nc.every(r => r.ok === false && r.notConnected && /isn’t connected|not set/.test(r.error)));
ck('the mock saw nothing', (await j('/__log')).total === 0);
ck('mode is Not connected', M.adsMode() === 'not_connected' && M.metaAdsStatus().label === 'Not connected');
const wNo = keep(await M.createCampaign({ name: 'x', goal: 'Purchase' }));
ck('a write with nothing set is still only a dry run (nothing sent)', wNo.dryRun === true && (await j('/__log')).total === 0);

Object.assign(process.env, { META_ADS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: 'act_MOCK1', META_PIXEL_ID: 'PIX1', META_PAGE_ID: 'PAGE1', META_IG_USER_ID: 'IG1' });
const st = M.metaAdsStatus();
ck('with the key and account set, and no switch: Dry run, and the settings are listed by name only', st.mode === 'dry_run' && st.label === 'Dry run — nothing is sent to Meta' && st.settings.length === 6 && st.settings.filter(x => x.set).length === 5 && !JSON.stringify(st).includes(TOKEN));

say('-- (a) the switch off: reads reach the mock, writes never leave');
await j('/__log?reset=1');
const acct = keep(await M.getAccount()), px = keep(await M.getPixel()), pg = keep(await M.getPage()), ints = keep(await M.searchInterests('med'));
ck('account, pixel, Page and interest search are read', acct.ok && acct.name === 'EP Mock Ads' && M.hasPaymentMethod(acct) && px.ok && M.pixelFiredWithin(px, 24) && pg.ok && ints.data.length >= 1 && ints.data[0].name === 'Meditation');
const ins = keep(await M.getInsights({ level: 'adset', since: '2026-11-01', until: '2026-11-07' }));
ck('a week of results for five ad sets comes back as cents and counts', ins.ok && ins.rows.length === 35 && ins.rows[0].spend_cents > 0 && ins.rows.some(r => r.purchases > 0 && r.revenue_cents > 0));
const dry = [];
const spec = () => ({
  name: 'Test · Pilgrimage', goal: 'Purchase', type: 'test', link: 'https://example.test/lp/pilgrimage?utm_source=meta', cta: 'LEARN_MORE', startTime: '2026-12-01T00:00:00-0500', endTime: '2026-12-15T00:00:00-0500',
  budget: { perAdSetDailyCents: 2000 }, spendCapCents: 50000,
  audiences: ['Meditation', 'Yoga', 'Mindfulness', 'Buddhism', 'Philosophy'].map((n, i) => ({ name: n, targeting: { geo_locations: { countries: ['US'] }, interests: [{ id: String(i), name: n }] } })),
  ads: [1, 2, 3, 4, 5].map(i => ({ name: `Ad ${i}`, images: { '9:16': `h${i}a`, '4:5': `h${i}b`, '1:1': `h${i}c`, '1.91:1': `h${i}d` } })),
  copySets: [1, 2, 3, 4, 5].map(i => ({ text: `Main text ${i}`, headline: `Headline ${i}` })),
});
dry.push(await M.createCampaign({ name: 'c', goal: 'Lead' }), await M.createAdSet({ campaignId: 'c1', name: 's', goal: 'Lead', targeting: {} }), await M.createAdCreative({ name: 'k', link: 'https://x.test', copySets: [{ text: 't', headline: 'h' }], images: { '4:5': 'h' } }),
  await M.createAd({ adsetId: 's1', creativeId: 'k1', name: 'a' }), await M.uploadAdImage({ name: 'i', bytesBase64: 'AAAA' }), await M.setStatus('mock_campaign_1', 'ACTIVE'), await M.setBudget('mock_adset_1', { dailyBudgetCents: 3000 }),
  await M.createCustomAudience({ name: 'Buyers' }), await M.addAudienceUsers('aud1', ['A@x.test ', 'b@x.test', 'not-an-email']), await M.createLookalike({ name: 'LAL', originAudienceId: 'aud1' }), await M.buildCampaign(spec()));
dry.forEach(keep);
ck('every write function answers dryRun with what it would have done', dry.every(r => r.ok && r.dryRun === true) && dry.slice(0, -1).every(r => r.would?.method === 'POST' && r.would.path && typeof r.id === 'string'));
ck('a dry-run campaign is created PAUSED in what it would send', dry[0].would.body.status === 'PAUSED' && dry[2].would.body.asset_feed_spec.bodies.length === 1);
ck('audience emails are hashed and counted, not shown (2 valid emails)', dry[8].would.body.payload.count === 2 && !JSON.stringify(dry[8]).includes('x.test'));
ck('a whole 5 × 5 as a dry run: 1 campaign, 5 ad sets, 5 creatives, 25 ads (ids are placeholders)', dry[10].made.campaign.startsWith('dryrun-') && dry[10].made.adsets.length === 5 && dry[10].made.creatives.length === 5 && dry[10].made.ads.length === 25);
const log1 = await j('/__log');
ck('the mock log shows only reads: NO write reached it', log1.total > 0 && log1.requests.every(r => r.method === 'GET' && !r.write) && (await j('/__state')).campaigns.length === 0);
ck('every request carried the Bearer token, and none put it in the address or body', log1.requests.every(r => r.auth && !r.tokenInUrl));
ck('a 5 × 5 with 4 ads is refused before anything is made', (await M.buildCampaign({ ...spec(), ads: spec().ads.slice(0, 4) })).ok === false);
ck('a goal other than Purchase, Lead or Traffic is refused', (await M.createCampaign({ name: 'x', goal: 'Fame' })).ok === false);

say('-- (b) the switch on (test only, at the mock): a full 5 × 5, paused');
process.env.META_ADS_LIVE = 'live';
ck('mode is Live', M.adsMode() === 'live' && M.metaAdsStatus().label === 'Live');
await j('/__log?reset=1');
const built = keep(await M.buildCampaign(spec()));
const state = await j('/__state');
ck('1 campaign, 5 ad sets, 5 creatives (one per ad design) and 25 ads made', built.ok && !built.dryRun && state.campaigns.length === 1 && state.adsets.length === 5 && state.adcreatives.length === 5 && state.ads.length === 25);
ck('every campaign, ad set and ad was made PAUSED', [...state.campaigns, ...state.adsets, ...state.ads].every(o => o.status === 'PAUSED'));
ck('each ad set has all five ads, in 5 creatives that carry 5 copy sets and the four sizes', state.adsets.every(a => state.ads.filter(x => x.adset_id === a.id).length === 5) && state.adcreatives.every(c => c.asset_feed_spec.bodies.length === 5 && c.asset_feed_spec.titles.length === 5 && c.asset_feed_spec.images.length === 4));
ck('the budget, dates and pixel went to the ad sets', state.adsets.every(a => a.daily_budget === '2000' && a.start_time && a.promoted_object.pixel_id === 'PIX1' && a.promoted_object.custom_event_type === 'PURCHASE'));
const adv = keep(await M.buildCampaign({ ...spec(), type: 'advantage', audiences: [spec().audiences[0]] }));
const st2 = await j('/__state');
ck('Advantage+ is 1 campaign, 1 ad set, the same 5 ads', adv.ok && st2.campaigns.length === 2 && st2.adsets.length === 6 && st2.ads.length === 30 && st2.adsets[5].targeting.targeting_automation.advantage_audience === 1);
const cid = built.made.campaign;
const [start, bud, img, aud] = [await M.setStatus(cid, 'ACTIVE'), await M.setBudget(built.made.adsets[0], { dailyBudgetCents: 2400 }), await M.uploadAdImage({ name: 'crop.png', bytesBase64: 'AAAA' }), await M.createCustomAudience({ name: 'Buyers' })].map(keep);
const users = keep(await M.addAudienceUsers(aud.id, ['one@x.test', 'ONE@x.test', 'two@x.test', 'nope']));
const look = keep(await M.createLookalike({ name: 'Buyers 1%', originAudienceId: aud.id }));
const st3 = await j('/__state');
ck('Start sets a campaign ACTIVE; a budget change lands on the ad set', start.ok && !start.dryRun && st3.campaigns[0].status === 'ACTIVE' && bud.ok && st3.adsets[0].daily_budget === '2400');
ck('an image upload gives back a hash', img.ok && Object.values(img.images)[0].hash);
ck('hashed emails are uploaded once each (2 valid, duplicates and bad ones dropped) and a lookalike is made', users.ok && users.num_received === 2 && users.num_invalid_entries === 0 && st3.users[aud.id] === 2 && look.ok && st3.customaudiences.length === 2 && st3.customaudiences[1].subtype === 'LOOKALIKE');
const log2 = (await j('/__log')).requests;
ck('no email address reached the mock (only SHA-256 hashes)', !JSON.stringify(log2).includes('x.test'));
await j('/__mode?rejectWrites=1');
const refused = keep(await M.setStatus(cid, 'PAUSED'));
const partial = keep(await M.buildCampaign(spec()));
ck('a Meta that says no is reported plainly, not thrown', refused.ok === false && /^Meta said no: /.test(refused.error) && partial.ok === false && partial.made.campaign === null);
await j('/__mode?rejectWrites=0');
const lc = keep(await M.listCampaigns()), la = keep(await M.listCustomAudiences());
ck('campaigns and audiences can be listed', lc.ok && lc.data.length === 2 && la.ok && la.data.length === 2);
const px2 = (await j('/__mode?pixelAgeHours=30')) && keep(await M.getPixel());
ck('a pixel that last fired 30 hours ago is not "fired in the last 24 hours"', px2.ok && !M.pixelFiredWithin(px2, 24));
await j('/__mode?pixelAgeHours=2&noPayment=1');
ck('an account with no payment method is noticed', !M.hasPaymentMethod(keep(await M.getAccount())));
await j('/__mode?noPayment=0');
delete process.env.META_ADS_LIVE;

say('-- (d) the token appears nowhere');
const mockLog = JSON.stringify(await j('/__log')) + JSON.stringify(await j('/__state'));
ck('not in anything printed, any answer, or the mock’s log and state', !out.join('\n').includes(TOKEN) && !answers.join('').includes(TOKEN) && !mockLog.includes(TOKEN));
ck('dry runs and refusals did print a one-line note, with no body', out.some(l => /^\[meta-ads\] dry run: campaign/.test(l)) && !out.some(l => /Main text/.test(l)));

say('-- (e) the store: every kind of thing, on an in-process Postgres');
process.env.ADS_TEST_DB = 'pglite';
await S.ensureAdsTables();
const count = async () => Object.fromEntries(await Promise.all(S.ENTITY_NAMES.map(async e => [e, (await S.listRows(e)).length])));
ck('the fourteen tables are made (the eleven in the design, plus daily results for the rules, a small settings table, and the alert log of the safety net)', S.ENTITY_NAMES.length === 14);
const camp = await S.createRow('campaigns', { name: 'Pilgrimage · test', launch_id: 'L1', program_id: 'E050', goal: 'Purchase', structure: 'test', landing_url: 'https://example.test/lp', utm: { utm_source: 'meta' }, start_date: '2026-12-01', end_date: '2026-12-15', daily_budget_cents: 2000, meta_settings: { pixel: 'PIX1' } });
ck('a campaign round-trips (dates as dates, objects as objects, defaults: draft, rules off and dry)', camp.id.startsWith('cmp_') && camp.status === 'draft' && camp.start_date === '2026-12-01' && camp.utm.utm_source === 'meta' && camp.rules_on === false && camp.rules_dry_run === true && camp.end_date === '2026-12-15');
const aset = await S.createRow('adsets', { campaign_id: camp.id, position: 1, label: 'Proven', audience_name: 'Yoga', targeting: { interests: [1] }, daily_budget_cents: 2000, budget_ceiling_cents: 10000 });
const crv = await S.createRow('creatives', { campaign_id: camp.id, position: 1, name: 'Ad 1', kind: 'image', images: { '9:16': 'u1', '4:5': 'u2', '1:1': 'u3', '1.91:1': 'u4' }, source: 'drive' });
const cpy = await S.createRow('copysets', { campaign_id: camp.id, position: 1, main_text: 'Words', headline: 'Head', source_kind: 'launch_email', source_ref: 'Promo #2', source_text: 'Words', is_placeholder: false });
const ad = await S.createRow('ads', { campaign_id: camp.id, adset_id: aset.id, creative_id: crv.id, position: 1, name: 'Ad 1' });
const rul = await S.createRow('rules', { campaign_id: camp.id, metric: 'roas', ceiling_cents: 10000, off_min_spend_cents: 3000 });
const act = await S.createRow('actions', { campaign_id: camp.id, adset_id: aset.id, kind: 'raise_budget', by: 'rules', dry_run: true, detail: 'Raise 20%', before: { daily_budget_cents: 2000 }, after: { daily_budget_cents: 2400 }, reverse_to: { daily_budget_cents: 2000 } });
const aud2 = await S.createRow('audiences', { name: 'Yoga 25-55', source: 'interest', meta_settings: { interests: [1] }, tags: ['course', 'tantra'], overlaps: ['Seeker'] });
const res = await S.createRow('audience_results', { audience_id: aud2.id, campaign_id: camp.id, adset_id: aset.id, spend_cents: 5000, purchases: 3, revenue_cents: 9000, roas: 1.8, outcome: 'above target' });
const dly = await S.createRow('results', { date: '2026-12-02', campaign_id: camp.id, adset_id: aset.id, ad_id: '', spend_cents: 1200, impressions: 900, clicks: 20, purchases: 1, revenue_cents: 3000 });
const wk = await S.createRow('weekly_reads', { week_start: '2026-11-30', body: 'A quiet week.', claims: [{ text: 'x', numbers: ['n1'] }], numbers: { n1: 4 } });
const tp = await S.createRow('topic_ideas', { topic_key: 'tantra-intro', title: 'Tantra, an introduction', evidence: [{ source: 'quiz', n: 40 }], format: 'Course' });
ck('every kind of thing can be made', [aset, crv, cpy, ad, rul, act, aud2, res, dly, wk, tp].every(r => r.id && r.created_at));
ck('and read back as it was put in', (await S.getRow('actions', act.id)).reverse_to.daily_budget_cents === 2000 && (await S.getRow('creatives', crv.id)).images['1.91:1'] === 'u4' && (await S.getRow('audiences', aud2.id)).tags[1] === 'tantra' && (await S.getRow('weekly_reads', wk.id)).week_start === '2026-11-30' && (await S.getRow('copysets', cpy.id)).is_placeholder === false && (await S.getRow('audience_results', res.id)).roas === 1.8);
const up = await S.updateRow('campaigns', camp.id, { status: 'sent_paused', rules_on: true, meta_campaign_id: 'mock_campaign_9', utm: { utm_source: 'meta', utm_campaign: 'pilgrim' } });
ck('an update changes only what was named and stamps updated_at', up.status === 'sent_paused' && up.rules_on && up.utm.utm_campaign === 'pilgrim' && up.name === camp.name && up.updated_at >= camp.updated_at);
ck('list filters by column (a campaign’s ad sets) and an unknown column or kind is refused', (await S.listRows('adsets', { campaign_id: camp.id })).length === 1 && (await S.listRows('campaigns', { status: 'live' })).length === 0
  && await S.listRows('campaigns', { nope: 1 }).then(() => false, () => true) && await S.getRow('nope', 'x').then(() => false, () => true));
const tree = await S.campaignTree(camp.id);
ck('the campaign tree has its ad sets, creatives, copy sets, ads, rules and actions', tree.adsets.length === 1 && tree.creatives.length === 1 && tree.copysets.length === 1 && tree.ads.length === 1 && tree.rules.id === rul.id && tree.actions.length === 1 && (await S.campaignTree('nope')) === null);
ck('one result per audience per campaign, one rules row per campaign', await S.createRow('audience_results', { audience_id: aud2.id, campaign_id: camp.id }).then(() => false, () => true) && await S.createRow('rules', { campaign_id: camp.id }).then(() => false, () => true) && await S.createRow('topic_ideas', { topic_key: 'tantra-intro' }).then(() => false, () => true));
const before = await count();
S.forgetAdsTables(); await S.ensureAdsTables(); await S.ensureAdsTables();
ck('ensureAdsTables is safe to run again: nothing lost, nothing doubled', JSON.stringify(await count()) === JSON.stringify(before) && before.campaigns === 1 && before.actions === 1);
await S.deleteRow('campaigns', camp.id);
ck('deleting a campaign takes its parts with it (but not the audience library)', (await S.listRows('adsets')).length === 0 && (await S.listRows('ads')).length === 0 && (await S.listRows('actions')).length === 0 && (await S.listRows('audience_results')).length === 0 && (await S.listRows('audiences')).length === 1);

say(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
