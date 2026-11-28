// Ads › Creative results at API level (run by ads-creative.sh). `source env.sh`, then:
//   node ads-creative-api.mjs b   the app with NO Meta key (as in the first days): not connected, no tables, then a draft only
//   node ads-creative-api.mjs a   the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live): seven campaigns built through the app
// a: the pure rules first (too early / ahead / behind at their exact edges: $50, 5 sales, 10 leads, the 1.5 line), then six campaigns sent and started (two sales ads that share
//    pictures and the same words, a one-audience Advantage+, a barely-run one, two lead campaigns, a Traffic one) and a draft that was never sent. The results are synced at the mock at
//    a small size first (everything is too early) and then at the real size. Every picture's numbers are recomputed from Meta's own per-ad rows, by a different route (the oracle), and
//    must equal the page's; ranking, labels, fairness (ad sets, audiences, campaigns, one audience), the words as saved, pairings, links, roles, read-only, no key anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHASE = process.argv[2] || 'a';
const B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const view = async c => (await get('/api/ops/ads-creative', c)).j;
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const sync = () => fetch(B + '/api/ops/ads-sync', { headers: CRON }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const metaLog = async () => (await fetch(`${META}/__log`)).json();
const writes = async () => (await metaLog()).requests.filter(r => r.write).length;
const KEY = /mock-ads-token-for-the-settings-test|act_MOCK1/;
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');

async function makeLaunch(name, extra = {}) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id: 'E034', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', '2027-01-06'], ['One week left', '2027-01-19'], ['Last day', '2027-01-26']].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })), ...extra });
  if (!r.j.id) console.log('launch create failed', r.status, JSON.stringify(r.j)); return r.j.id;
}
const tree = async (id, q = '') => (await get(`/api/ops/ads?id=${id}${q}`)).j;
const WORDS = n => [1, 2, 3, 4, 5].map(i => ({ headline: `Headline ${n}${i}: Kali, the dark mother`, main_text: `Words ${n}${i}. Eight Wednesdays of study and practice with the goddess who wears time as a garland.` }));
// a campaign made through the app: its goal, its type, five pictures (library ids, or 'upload'), its five texts
async function draft(name, { goal = 'Purchase', structure = 'test', words }) {
  const lid = await makeLaunch(name);
  const made = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal, structure, daily_cents: 10000 }), cid = made.j.campaign.id;
  let t = await tree(cid);
  for (const s of t.copysets) await post({ action: 'editCopy', id: cid, copy_id: s.id, ...words[s.position - 1] });
  return cid;
}
// five pictures for a campaign's five ads: library ids, or 'upload'
async function pics(cid, art, png) {
  const t = await tree(cid);
  for (const [i, a] of art.entries()) { const r = await post({ action: 'chooseArt', id: cid, creative_id: t.creatives[i].id, ...(a === 'upload' ? { data: png } : { image_id: a }) }); if (r.status !== 200) console.log('chooseArt failed', r.status, JSON.stringify(r.j)); }
}
const goLive = async cid => { const s = await post({ action: 'sendToMeta', id: cid, confirm: true }), g = await post({ action: 'start', id: cid, confirm: true }); return s.status === 200 && g.status === 200; };
// Meta's own per-ad rows for a campaign (by a different route from the sync, to recompute every number)
async function oracleRows(metaId) {
  const f = encodeURIComponent(JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: metaId }]));
  const r = await (await fetch(`${META}/v21.0/act_MOCK1/insights?level=ad&filtering=${f}`, { headers: { Authorization: 'Bearer anything' } })).json();
  const act = (x, type, key = 'actions') => Number((x[key] || []).find(a => a.action_type === type)?.value) || 0;
  return r.data.map(x => ({ ad: x.ad_id, spend: Math.round(Number(x.spend) * 100), imp: Number(x.impressions), clicks: Number(x.clicks), purchases: act(x, 'purchase'), revenue: Math.round(act(x, 'purchase', 'action_values') * 100), leads: act(x, 'lead') }));
}

(async () => {
  await fetch(`${META}/__reset`);

  console.log('-- who sees Creative results');
  for (const [who, email, want] of [['director', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn', 'carolyn@example.com', 403], ['Stephanie', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
    const c = email ? cookie(email) : DIR, pg = await call('GET', '/ops/ads?view=creative', c);
    ck(`${who}: the API answers ${want}`, (await get('/api/ops/ads-creative', c)).status === want);
    ck(`${who}: the Creative results tab ${want === 200 ? 'opens' : 'is not shown (sent away)'}`, want === 200 ? pg.status === 200 && /Creative results/.test(pg.text) : pg.status !== 200);
  }
  ck('there is no way to write: a POST is refused (405) for everyone', (await call('POST', '/api/ops/ads-creative', DIR, { action: 'x' })).status === 405 && (await call('POST', '/api/ops/ads-creative', cookie('rebecka@example.com'), {})).status === 405);
  const rb = cookie('rebecka@example.com');
  ck('Rebecka still cannot open Business, Finance or Payroll', (await call('GET', '/ops/business', rb)).status !== 200 && (await call('GET', '/ops/business?view=finance', rb)).status !== 200);
  const tabs = (await call('GET', '/ops/ads', DIR)).text;
  ck('the tabs are Campaigns, Creative results, Audience library, Safety net, Audience insights, in that order', ['Campaigns', 'Creative results', 'Audience library', 'Safety net', 'Audience insights'].map(n => tabs.indexOf(`>${n}</a>`)).every((p, i, a) => p > 0 && (!i || p > a[i - 1])));

  console.log('-- nothing yet: no tables');
  let v = await view();
  ck('it says there is nothing, and makes no table', v.exists === false && v.groups.length === 0 && v.in_meta === 0 && v.thresholds.min_spend_cents === 5000 && v.thresholds.min_purchases === 5 && v.thresholds.min_leads === 10 && v.thresholds.sales_line === 1.5 && v.thresholds.lead_line === 1.5, JSON.stringify(v));
  ck('no table was made by looking (the library, which reads the same way, still says none)', (await get('/api/ops/ads-library')).j.exists === false);

  if (PHASE === 'b') {
    ck('without a Meta key it says Meta isn’t connected', v.connected === false);
    console.log('-- a draft only: nothing has been sent to Meta');
    const lid = await makeLaunch('Kali Winter 2027'); await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 });
    v = await view();
    ck('with a draft and nothing sent, the tables exist, nothing is in Meta and there is nothing to rank', v.exists === true && v.in_meta === 0 && v.groups.length === 0 && v.connected === false, JSON.stringify(v));
    ck('no key, account number or personal value in any answer or log', !KEY.test(JSON.stringify(v)) && !KEY.test(appLog()) && !KEY.test(mockLog()));
    console.log(bad ? `\n${bad} FAILED` : '\nall ok'); process.exit(bad ? 1 : 0);
  }

  console.log('-- the rules at their edges (the pure part)');
  const L = await import('../../lib/ops/adscreative.js'), t0 = { spend_cents: 5000, revenue_cents: 7500, purchases: 5, leads: 0, impressions: 0, clicks: 0 };
  const j = (k, o) => L.judge(k, { ...t0, ...o }).verdict.key;
  ck('exactly $50 and exactly 5 sales at exactly 1.50 is Ahead of the line', j('Purchase', {}) === 'ahead');
  ck('$49.99 is too early, however good', j('Purchase', { spend_cents: 4999, revenue_cents: 99999 }) === 'early');
  ck('4 sales is too early, however much was spent', j('Purchase', { purchases: 4, spend_cents: 90000, revenue_cents: 999999 }) === 'early');
  ck('1.49 is Behind the line', j('Purchase', { revenue_cents: 7450 }) === 'behind');
  ck('spent a lot, 5 sales, nothing back is Behind (not too early)', j('Purchase', { revenue_cents: 0, spend_cents: 20000 }) === 'behind');
  ck('a lead ad: exactly $1.50 a lead is Ahead, $1.51 is Behind, $5 a lead is Behind, 9 leads or under $50 is too early', j('Lead', { leads: 100, spend_cents: 15000 }) === 'ahead' && j('Lead', { leads: 100, spend_cents: 15100 }) === 'behind' && j('Lead', { leads: 10, spend_cents: 5000 }) === 'behind' && j('Lead', { leads: 9, spend_cents: 5000 }) === 'early' && j('Lead', { leads: 40, spend_cents: 4000 }) === 'early');
  ck('a lead ad that spent plenty and got no lead is too early (fewer than 10 leads)', j('Lead', { leads: 0, spend_cents: 90000 }) === 'early');
  ck('the labels are the plain ones', L.judge('Purchase', t0).verdict.label === 'Ahead of the $1.50 line' && L.judge('Purchase', { ...t0, revenue_cents: 100 }).verdict.label === 'Behind the line' && L.judge('Purchase', { ...t0, spend_cents: 10 }).verdict.label === 'Too early to say' && /^A result needs at least \$50 spent \(so far \$0\.10\)/.test(L.judge('Purchase', { ...t0, spend_cents: 10 }).verdict.why));
  ck('the lead label says what the line is', L.judge('Lead', { ...t0, leads: 40 }).verdict.label === 'Ahead of the $1.50 a lead line');

  console.log('-- six campaigns through the app, and one draft that stays a draft');
  const png = fs.readFileSync(path.join(here, 'out/upload-test.png')).toString('base64');
  const ids = {};
  ids.A = await draft('Creative A 2027', { goal: 'Purchase', structure: 'test', words: WORDS('A') });
  const art = (await tree(ids.A, '&art=1')).art, A = i => art[i].id, name = i => art[i].name;
  ck('the library offers pictures to choose from, each with its own name', art.length > 20 && new Set(art.slice(0, 20).map(a => a.name)).size === 20);
  await pics(ids.A, [0, 1, 2, 3, 4].map(A));
  ids.B = await draft('Creative B 2027', { goal: 'Purchase', structure: 'advantage', words: WORDS('A') }); await pics(ids.B, [A(0), A(1), A(2), 'upload', A(5)], png);
  ids.D = await draft('Creative D 2027', { goal: 'Purchase', structure: 'advantage', words: WORDS('D') }); await pics(ids.D, [A(0), A(1), A(6), A(7), A(8)]);
  ids.C = await draft('Creative C 2027', { goal: 'Lead', structure: 'advantage', words: WORDS('C') }); await pics(ids.C, [10, 11, 12, 13, 14].map(A));
  ids.E = await draft('Creative E 2027', { goal: 'Lead', structure: 'test', words: WORDS('E') }); await pics(ids.E, [0, 1, 2, 3, 4].map(A));
  ids.F = await draft('Creative F 2027', { goal: 'Traffic', structure: 'advantage', words: WORDS('A') }); await pics(ids.F, [0, 1, 2, 3, 4].map(A));
  ids.G = await draft('Creative G 2027 (a draft)', { goal: 'Purchase', structure: 'advantage', words: WORDS('G') }); await pics(ids.G, [15, 16, 17, 18, 19].map(A));
  for (const k of ['A', 'B', 'D', 'C', 'E', 'F']) ck(`campaign ${k} is sent and started`, await goLive(ids[k]));
  v = await view();
  ck('before any results are read: six campaigns are in Meta, nothing has run, nothing to rank', v.exists && v.in_meta === 6 && v.groups.length === 0 && v.connected === true && v.synced_at === '', JSON.stringify(v).slice(0, 300));

  console.log('-- a small size first: nothing has run long enough');
  await fetch(`${META}/__mode?scale=0.1,0.1,0.1,0.1,0.1,0.1`);
  ck('the results sync reads 6 campaigns', (await sync()).j.campaigns === 6);
  v = await view(); let sales = v.groups.find(g => g.kind === 'Purchase'), leads = v.groups.find(g => g.kind === 'Lead');
  ck('there are sales ads and lead ads, and the Traffic campaign is left out and counted', !!sales && !!leads && v.groups.length === 2 && v.left_out.traffic === 1);
  ck('every picture, every set of words and no pairing is too early; nothing is called best or weakest', [...sales.images, ...leads.images, ...sales.copy, ...leads.copy].every(r => r.verdict.key === 'early' && !r.standing) && sales.pairs.length === 0 && leads.pairs.length === 0 && sales.pairs_hidden > 0);
  ck('the reason says how far off it is, in dollars and counts', sales.images.every(r => /^A result needs at least \$50 spent \(so far \$\d/.test(r.verdict.why)) && sales.images[0].spend_cents >= sales.images.at(-1).spend_cents);

  console.log('-- the real size');
  await fetch(`${META}/__mode?scale=5,5,0.2,0.3,5,5`); await sync();
  const w0 = await writes(), m0 = (await metaLog()).requests.length;
  v = await view(); sales = v.groups.find(g => g.kind === 'Purchase'); leads = v.groups.find(g => g.kind === 'Lead');
  ck('it read nothing from Meta and wrote nothing (a look is database only)', (await metaLog()).requests.length === m0 && (await writes()) === w0);
  ck('Meta’s numbers were last read just now', v.synced_at && Date.now() - Date.parse(v.synced_at) < 120000);
  ck('campaigns judged: sales 3 (A, B, D) and leads 2 (C, E); the draft and Traffic are in neither', sales.campaigns === 3 && leads.campaigns === 2 && v.in_meta === 6);

  console.log('-- every number recomputed from Meta’s own per-ad rows');
  const trees = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await tree(id)])));
  const expect = { Purchase: new Map(), Lead: new Map() };
  for (const k of ['A', 'B', 'D', 'C', 'E']) {
    const t = trees[k], goal = t.campaign.goal, rows = await oracleRows(t.campaign.meta_campaign_id), byMeta = new Map(t.ads.map(a => [a.meta_ad_id, a]));
    for (const r of rows) {
      const ad = byMeta.get(r.ad); if (!ad) continue;
      const cr = t.creatives.find(c => c.id === ad.creative_id), nm = /^Uploaded/.test(cr.source) ? 'An uploaded picture' : cr.source.replace(/^Image library · /, ''), aud = t.adsets.find(s => s.id === ad.adset_id).audience_name;
      const e = expect[goal].get(nm) || { spend: 0, imp: 0, clicks: 0, purchases: 0, revenue: 0, leads: 0, ads: new Set(), adsets: new Set(), aud: new Set(), camps: new Set() };
      for (const f of ['spend', 'imp', 'clicks', 'purchases', 'revenue', 'leads']) e[f] += r[f];
      e.ads.add(ad.id); e.adsets.add(ad.adset_id); e.aud.add(aud); e.camps.add(t.campaign.id); expect[goal].set(nm, e);
    }
  }
  for (const [goal, g] of [['Purchase', sales], ['Lead', leads]]) {
    const exp = expect[goal];
    ck(`${goal}: the same pictures, no more and no fewer (${exp.size})`, g.images.length === exp.size && g.images.every(r => exp.has(r.name)), g.images.map(r => r.name).join(' | '));
    const same = g.images.every(r => { const e = exp.get(r.name); return r.spend_cents === e.spend && r.purchases === e.purchases && r.revenue_cents === e.revenue && r.leads === e.leads && r.impressions === e.imp && r.clicks === e.clicks && r.ads === e.ads.size && r.adsets === e.adsets.size && r.audiences.length === e.aud.size && r.campaigns.length === e.camps.size; });
    ck(`${goal}: every picture’s spend, sales, leads, impressions, clicks, ads, ad sets, audiences and campaigns equal the oracle’s`, same, JSON.stringify(g.images.map(r => [r.name, r.spend_cents, r.ads, r.adsets, r.audiences.length, r.campaigns.length])));
    ck(`${goal}: click-through is clicks over impressions, to one decimal`, g.images.every(r => r.ctr === (r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : null)));
    ck(`${goal}: the pictures’ spend adds up to the campaigns’ ad rows`, g.images.reduce((n, r) => n + r.spend_cents, 0) === [...exp.values()].reduce((n, e) => n + e.spend, 0));
  }

  console.log('-- ranking and labels');
  const rankOk = (g, rows) => { const done = rows.filter(r => r.verdict.key !== 'early'), early = rows.filter(r => r.verdict.key === 'early'); const s = (a, b) => g.metric === 'cpl' ? (a.value ?? 1e9) <= (b.value ?? 1e9) : (a.value ?? -1) >= (b.value ?? -1);
    return rows.length === done.length + early.length && rows.slice(0, done.length).every(r => r.verdict.key !== 'early') && done.every((r, i) => !i || s(done[i - 1], r)) && early.every((r, i) => !i || early[i - 1].spend_cents >= r.spend_cents); };
  ck('sales pictures: judged ones best first, then the too-early ones by spend', rankOk(sales, sales.images));
  ck('lead pictures: judged ones cheapest lead first, then the too-early ones', rankOk(leads, leads.images));
  const labelOk = (g, r) => { const enough = r.spend_cents >= 5000 && (g.metric === 'cpl' ? r.leads >= 10 : r.purchases >= 5); if (!enough) return r.verdict.key === 'early'; return g.metric === 'cpl' ? (r.verdict.key === 'ahead') === (r.value != null && r.value <= 1.5) : (r.verdict.key === 'ahead') === (r.value >= 1.5); };
  ck('every label follows the rule ($50, 5 sales or 10 leads, the 1.5 line)', [...sales.images.map(r => [sales, r]), ...leads.images.map(r => [leads, r]), ...sales.copy.map(r => [sales, r]), ...leads.copy.map(r => [leads, r]), ...sales.pairs.map(r => [sales, r])].every(([g, r]) => labelOk(g, r)));
  const kinds = new Set(sales.images.map(r => r.verdict.key));
  ck('sales pictures include Ahead, Behind and Too early', kinds.has('ahead') && kinds.has('behind') && kinds.has('early'), [...kinds].join());
  ck('the best and weakest judged pictures are marked, once each', sales.images.filter(r => r.standing === 'best').length === 1 && sales.images.filter(r => r.standing === 'weakest').length === 1 && sales.images[0].standing === 'best' && sales.images.filter(r => r.verdict.key !== 'early').at(-1).standing === 'weakest');
  ck('lead pictures are judged on cost per lead, with the lead wording', leads.images.some(r => r.verdict.key !== 'early') && leads.images.filter(r => r.verdict.key !== 'early').every(r => /a lead/.test(r.verdict.why) || /no leads/.test(r.verdict.why)) && leads.images.filter(r => r.verdict.key === 'early').length >= 5);

  console.log('-- fairness: where each ran');
  const p5 = sales.images.find(r => r.name === name(5)), p0 = sales.images.find(r => r.name === name(0)), p2 = sales.images.find(r => r.name === name(2)), p6 = sales.images.find(r => r.name === name(6));
  ck('the same picture in two sales campaigns and a third is one row, with all of them counted', p0.campaigns.length === 3 && p0.ads === 7 && p0.adsets === 7 && p0.one_audience === false && p0.audiences.length >= 5, JSON.stringify([p0.campaigns.length, p0.ads, p0.adsets, p0.audiences.length]));
  ck('a picture used in only one Advantage+ campaign ran in one audience, and says so', p5.one_audience === true && p5.audiences.length === 1 && p5.adsets === 1 && p5.one_campaign === true && p5.ads === 1);
  ck('a picture that only ran in the barely-run campaign is too early', p6.verdict.key === 'early' && p6.one_audience === true);
  ck('the same picture in the lead campaigns is its own row, apart from the sales row (goals are never mixed)', !!leads.images.find(r => r.name === name(0)) && leads.images.find(r => r.name === name(0)).campaigns.length === 1 && leads.images.find(r => r.name === name(0)).spend_cents !== p0.spend_cents);
  ck('a row’s audiences are listed with what each spent, biggest first', p0.audiences.every((a, i, x) => a.name && (!i || x[i - 1].spend_cents >= a.spend_cents)) && p0.campaigns.every((c, i, x) => !i || x[i - 1].spend_cents >= c.spend_cents) && p0.audiences.reduce((n, a) => n + a.spend_cents, 0) === p0.spend_cents);
  const up = sales.images.find(r => r.name === 'An uploaded picture');
  ck('an uploaded picture is “An uploaded picture”: who uploaded it is never shown', !!up && !/Uploaded by/.test(JSON.stringify(v)) && up.thumb.startsWith('data:image/'));
  ck('pictures have thumbnails from the saved crops, square first', sales.images.every(r => r.thumb) && sales.images.every(r => r.thumb.startsWith('data:image/')));

  console.log('-- the words, as saved');
  ck('sales words: two sets that ran together (the same five texts in A and B are one set; D’s are another)', sales.copy.length === 2 && sales.copy.every(r => r.together && r.texts.length === 5));
  const L1 = sales.copy.find(r => r.texts[0].headline === 'Headline A1: Kali, the dark mother');
  ck('the words are shown exactly as saved on the ad, headline and body, in order', !!L1 && JSON.stringify(L1.texts.map(t => [t.headline, t.body])) === JSON.stringify(WORDS('A').map(w => [w.headline, w.main_text])), JSON.stringify(L1?.texts));
  ck('the same words in two campaigns are one set with both campaigns behind it', L1.campaigns.length === 2 && L1.ads === 30 && L1.adsets === 6);
  ck('the words’ numbers are the two campaigns’ pictures added together', L1.spend_cents === (await Promise.all(['A', 'B'].map(async k => (await oracleRows(trees[k].campaign.meta_campaign_id)).reduce((n, r) => n + r.spend, 0)))).reduce((a, b) => a + b, 0));
  ck('no single text is ever given its own result: every set says it ran together', [...sales.copy, ...leads.copy].every(r => r.texts.length === 5 && r.together));
  ck('lead words: two sets, one barely run (too early)', leads.copy.length === 2 && leads.copy.some(r => r.verdict.key === 'early') && leads.copy.some(r => r.verdict.key !== 'early'));
  ck('the words carry no source line (a testimonial’s author or who wrote it is never shown here)', !/Testimonial|Written by|"source"/.test(JSON.stringify(v)));
  ck('copy of a placeholder is never shown', !JSON.stringify(v).includes('[placeholder'));

  console.log('-- pairings');
  ck('only pairings that spent at least $50 are listed, and the others are counted', sales.pairs.every(r => r.spend_cents >= 5000) && sales.pairs_hidden > 0 && sales.pairs.length > 0);
  ck('a pairing is a picture with the words it ran beside, best first', sales.pairs.every(r => r.texts.length === 5 && r.name && r.thumb) && rankOk(sales, sales.pairs));
  const pa = sales.pairs.find(r => r.name === name(0) && r.texts[0].headline.startsWith('Headline A'));
  ck('the pairing of a picture with words that ran in two campaigns counts both', pa.campaigns.length === 2 && pa.ads === 6 && pa.adsets === 6, JSON.stringify([pa.campaigns.length, pa.ads, pa.adsets]));

  console.log('-- links that only link');
  const camps = sales.images.flatMap(r => r.campaigns);
  ck('every campaign opens in Ops at its own page', camps.every(c => /^\/ops\/ads\/cmp_/.test(c.ops_url) && Object.values(ids).includes(c.id)));
  ck('every campaign opens Meta’s Ads Manager, with the campaign, and no key or account word', camps.every(c => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=mock_campaign_\d+$/.test(c.manager_url)) && !KEY.test(JSON.stringify(v)));
  const keys = new Set(); JSON.stringify(v, (k, x) => (keys.add(k), x));
  ck('there is no pause, edit, retire or change action anywhere in the answer', ![...keys].some(k => /pause|edit|retire|delete|action|change/i.test(k)), [...keys].join());
  const real = ['A', 'B', 'D'].map(k => trees[k].campaign.name);
  ck('only campaigns in Meta are named: not the draft, not Traffic', ![...sales.images, ...leads.images].flatMap(r => r.campaigns).some(c => /Creative G|Creative F/.test(c.name)) && real.every(n => camps.some(c => c.name === n)));

  console.log('-- read only, and nothing leaks');
  const again = await view();
  ck('looking again gives the same answer (nothing changed)', JSON.stringify(again) === JSON.stringify(v));
  ck('the Meta mock saw no write (the checks above only asked Meta for rows, to recompute the numbers)', (await writes()) === w0);
  ck('no key, no ad account word and no personal value in any answer, the app log or the mock log', !KEY.test(JSON.stringify(v)) && !KEY.test(appLog()) && !KEY.test(mockLog()) && !/@example\.com|rebecka|floss|jacob@/i.test(JSON.stringify(v)));
  ck('the page for the director is the page for Rebecka (the same answer)', JSON.stringify(await view(rb)) === JSON.stringify(v));

  console.log(bad ? `\n${bad} FAILED` : '\nall ok');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL (crashed)', e); process.exit(1); });
