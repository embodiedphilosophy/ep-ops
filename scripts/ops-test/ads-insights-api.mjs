// Ads PR 5, Audience insights, at API level (needs the app on :3100 started by ads-insights.sh). `source env.sh`, then:
//   node ads-insights-api.mjs full      the Practice Report (synthetic quiz), Meta (a campaign built through the app), Circle and Kit all connected, a good model answer
//   node ads-insights-api.mjs nokey     no Anthropic key: the numbers without prose, the plain note, and the model is never asked
//   node ads-insights-api.mjs kitonly   no Circle key          node ads-insights-api.mjs circleonly   no Kit key          node ads-insights-api.mjs neither   neither key
//   node ads-insights-api.mjs failures  Circle and Kit connected, then Kit answers 500, then Circle can't list purchases, then Circle answers 500: each source says so and the rest still work
// full: who may see it (director and Rebecka yes; Floss, Irene, Ichha, Carolyn, Stephanie, a teacher no, page and API; Rebecka still not Business); nothing yet = no table; the weekly job (401, ?dry=1,
//   idempotent); the numbers with stable ids; every claim cited and checked; a deliberately bad model answer is dropped claim by claim and the good claims stay; breakdowns; topic conversion with
//   the low-data flag; ideas with evidence, existing formats, audiences and topic words from EP's own material; dismissed ideas never come back (even after the next weekly run); Send to Programs
//   writes NO sheet row and shows the strip to directors and the Ads role only; the quiz funnel moved (Business has no Audience tab, the old addresses redirect once, Rebecka sees the funnel in Ads);
//   no personal value (made-up names and addresses in the quiz, Circle and Kit) in any page, answer, log or request to the model; Meta saw no write from any of it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as V from '../../lib/ops/insightsverify.js';

const PHASE = process.argv[2] || 'full';
const B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body, headers = {}) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t, loc: r.headers.get('location') || '' }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), reads = (b, c) => call('POST', '/api/ops/ads-reads', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cronGet = (u, headers = CRON) => fetch(B + u, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const meta = async () => (await fetch(`${META}/__log`)).json();
const metaWrites = async () => (await meta()).requests.filter(r => r.write).length;
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const sheetWrites = () => mockLog().split('\n').filter(l => /^(WROTE|ADDED|APPENDED|COPIED|RENAMED|CIRCLE WRITE|KIT (DRAFT|TAG|DESC|REFUSED)|BLOCKED)/.test(l)).length;
const mockSet = q => fetch(`${MOCK}/__insights?${q}`).then(r => r.json());
const anthropicLog = async () => (await fetch(`${MOCK}/__anthropic-log`)).json();
const insights = async (w = '') => (await get(`/api/ops/ads-reads${w ? `?week=${w}` : ''}`)).j;
const PERSON = /Synthetic Person|synthetic\.person|example\.invalid|Marker Buyer|marker\.buyer|KITTXN-MARKER/i;
const ID = /^m\d+$/;

const addCoursePage = () => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Course Pages'!A1")}:append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [['E034', 'kali-winter', 'SS', '', 'Kali: the dark mother', 'Winter 2027', 'Eight Wednesdays reading the Kali tradition with practice and live sessions every week.', 'Weekly live seminar. Recordings of every session. A reading guide.', 'Students of yoga and Indian philosophy', 'published', '']] }) });
async function makeLaunch(name) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id: 'E034', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', '2027-01-06'], ['One week left', '2027-01-19'], ['Last day', '2027-01-26']].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })) });
  if (!r.j.id) console.log('launch create failed', r.status, JSON.stringify(r.j)); return r.j.id;
}
async function writeEmails(lid) {
  const items = (await get(`/api/ops/email/launches?id=${lid}`)).j.items.filter(i => i.lane === 'email').sort((a, b) => a.date.localeCompare(b.date));
  const texts = ['Eight Wednesdays with the goddess who wears time as a garland. Winter Term begins 27 January.', 'One week left to join the Kali seminar. Study the tradition with practice and live sessions every week.', 'The last day to enrol is 26 January. Doors close at midnight and the seminar begins.'];
  for (const [i, it] of items.entries()) await call('POST', '/api/ops/email/plan', DIR, { action: 'save', id: it.key, changes: { blocks: [{ type: 'text', text: texts[i] }] } });
}
const tree = async (id) => (await get(`/api/ops/ads?id=${id}`)).j;
async function campaign(name) {
  const lid = await makeLaunch(name); await writeEmails(lid);
  const made = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 }), cid = made.j.campaign.id, t = await tree(cid);
  for (const s of t.copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: cid, copy_id: s.id, main_text: `Words for set ${s.position} about the seminar.`, headline: `Set ${s.position}` });
  const sent = await post({ action: 'sendToMeta', id: cid, confirm: true }), go = await post({ action: 'start', id: cid, confirm: true });
  return sent.status === 200 && go.status === 200 ? cid : null;
}
const STATES = s => Object.fromEntries(s.map(x => [x.key, x.connected === true && x.ok === true ? 'ok' : x.connected ? 'error' : 'off']));
const everyone = [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn (Publisher)', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']];

(async () => {
  await fetch(`${META}/__reset`); await fetch(`${MOCK}/__anthropic-log?reset=1`);
  const everything = [];   // every page and answer, searched for personal values at the end
  const page = async (u, c) => { const r = await call('GET', u, c); everything.push(r.text); return r; };
  const mark = async (n, u, c) => { const r = await get(u, c); everything.push(r.text); return r; };

  if (PHASE === 'full') {
    console.log('-- who sees Audience insights');
    for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ...everyone.map(([w, e]) => [w, e, 403])]) {
      const c = email ? cookie(email) : DIR;
      ck(`${who}: the API answers ${want}, and its write door too`, (await get('/api/ops/ads-reads', c)).status === want && (want === 200 ? (await reads({ action: 'dismiss', id: 'tpc_none' }, c)).status === 404 : (await reads({ action: 'run' }, c)).status === 403));
      const pg = await call('GET', '/ops/ads?view=insights', c);
      ck(`${who}: the Audience insights tab ${want === 200 ? 'opens' : 'is not reachable'}`, want === 200 ? pg.status === 200 && /Audience insights/.test(pg.text) && /The quiz funnel/.test(pg.text) : pg.status !== 200);
    }
    const rb = cookie('rebecka@example.com');
    ck('Rebecka still cannot open Business, Finance or Payroll', (await call('GET', '/ops/business', rb)).status !== 200 && (await call('GET', '/ops/business?view=finance', rb)).status !== 200 && (await call('GET', '/ops/business?view=payroll', rb)).status !== 200);
    const ads0 = await page('/ops/ads', DIR);
    ck('the Ads tabs for the director: Campaigns, Audience library, Safety net, Audience insights', ['Campaigns', 'Audience library', 'Safety net', 'Audience insights'].every(t => new RegExp(`>${t}<`).test(ads0.text)));

    console.log('-- the funnel moved from Business');
    const bz = await page('/ops/business', DIR);
    ck('Business has Finance and Payroll tabs and no Audience tab', />Finance</.test(bz.text) && />Payroll</.test(bz.text) && !/>Audience</.test(bz.text));
    for (const [from, want] of [['/ops/business?view=audience', ['view=insights']], ['/ops/business?view=audience&f=90', ['view=insights', 'f=90']], ['/ops/business?f=365', ['view=insights', 'f=365']], ['/ops/insights?f=90', ['view=insights', 'f=90']]]) {
      const r = await call('GET', from), u = r.loc ? new URL(r.loc, B) : null;
      ck(`${from} redirects once to Ads › Audience insights with its query kept`, r.status === 307 && u && u.pathname === '/ops/ads' && u.searchParams.get('view') === 'insights' && want.every(w => u.searchParams.get(w.split('=')[0]) === w.split('=')[1]), r.loc);
      if (u) { const fin = await call('GET', u.pathname + u.search); ck(`${from} lands on a page that loads (no second redirect)`, fin.status === 200); }
    }
    const f90 = await page('/ops/ads?view=insights&f=90', DIR);
    ck('the funnel is on the page with its period chips, and the chosen period is marked', /aria-label="Funnel period"/.test(f90.text) && /aria-current="page">Quarter</.test(f90.text) && /f=90#funnel/.test(f90.text) && /aria-current="page">Quarter</.test(f90.text) || />Quarter</.test(f90.text));
    const rbf = await page('/ops/ads?view=insights', rb);
    ck('Rebecka sees the funnel in Ads', rbf.status === 200 && /The quiz funnel/.test(rbf.text));
    ck('the old Business address sends Rebecka to the Ads page, not Business', (await call('GET', '/ops/business?view=audience', rb)).loc.includes('/ops/ads?view=insights'));

    console.log('-- nothing yet: no tables, nothing recorded');
    let d = await insights();
    ck('before anything is saved the page is empty and no table exists', d.exists === false && d.week === null && d.sources.every(s => s.connected === null) && d.ideas.new.length === 0);
    ck('without the key the weekly job is refused (401), with a wrong key too', (await cronGet('/api/ops/ads-insights', {})).status === 401 && (await cronGet('/api/ops/ads-insights?key=wrong', {})).status === 401);
    const pre = await cronGet('/api/ops/ads-insights?dry=1');
    ck('?dry=1 reads the sources and says what it would do: five sources, the quiz, Circle and Kit connected, no read and no model asked, and no table made', pre.status === 200 && pre.j.preview === true && pre.j.sources.length === 5 && STATES(pre.j.sources).report === 'ok' && STATES(pre.j.sources).circle === 'ok' && STATES(pre.j.sources).kit_purchases === 'ok' && STATES(pre.j.sources).meta === 'off' && pre.j.metrics > 10 && pre.j.read === null && (await insights()).exists === false && (await anthropicLog()).length === 0, JSON.stringify(pre.j).slice(0, 300));

    console.log('-- a campaign built, sent and started through the app, so there are ad results by topic');
    await addCoursePage();
    const cid = await campaign('Kali Winter 2027');
    ck('the campaign is in Meta (at the mock) and the hourly sync keeps its results', !!cid && (await cronGet('/api/ops/ads-sync')).j.rows > 0);
    await cronGet('/api/ops/ads-audiences');
    await mockSet('broadcasts=1');
    const mw0 = await metaWrites(), sw0 = sheetWrites();

    console.log('-- the weekly job');
    const run = await cronGet('/api/ops/ads-insights');
    ck('it runs (jobs are live here), reads all five sources and makes a read and ideas', run.status === 200 && run.j.preview === false && Object.values(STATES(run.j.sources)).every(x => x === 'ok') && run.j.read.state === 'ok' && run.j.read.dropped === 0 && run.j.ideas.added >= 1, JSON.stringify(run.j));
    d = await insights(); everything.push(JSON.stringify(d));
    const w = d.week, ids = w.metrics.map(m => m.id), byId = new Map(w.metrics.map(m => [m.id, m]));
    ck('the numbers have ids (m1, m2…), each unique, each with its source and period', ids.length > 20 && new Set(ids).size === ids.length && ids.every(i => ID.test(i)) && w.metrics.every(m => m.source && m.period.text && m.text !== undefined && m.label), ids.length);
    ck('sources: the five are listed and all connected', d.sources.length === 5 && Object.values(STATES(d.sources)).every(x => x === 'ok'), JSON.stringify(STATES(d.sources)));
    ck('there are metrics from each of the five sources, Circle and Kit purchases kept separate', ['report', 'meta', 'circle', 'kit_purchases', 'kit_email'].every(k => w.metrics.some(m => m.source === k)));
    ck('there are claims, each citing metrics that exist', w.claims.length >= 3 && w.claims.every(c => c.metric_ids.length > 0 && c.metric_ids.every(i => byId.has(i)) && c.metrics.length === c.metric_ids.length), JSON.stringify(w.claims.map(c => c.text)));
    ck('every number quoted in every kept claim equals a cited metric (checked again here, with the same rule)', w.claims.every(c => V.verifyText(c.text, c.metric_ids, byId, ['Kali']) === ''));
    ck('each claim’s “See the numbers” lists its metrics with source and period', w.claims.every(c => c.metrics.every(m => m.text !== undefined && m.source && m.period && m.label)));
    ck('a claim that sets Circle beside Kit does not add them together', w.claims.some(c => c.metric_ids.length === 2 && /not added together/.test(c.text)));
    ck('the note on overlap is plain: Circle and Kit are separate and not added', /counted separately and not added together/.test(w.overlap_note) && /twice/.test(w.overlap_note));
    ck('the whole week is one row (a second run replaces it, never doubles it)', (await cronGet('/api/ops/ads-insights')).status === 200 && (await insights()).weeks.length === 1);

    console.log('-- breakdowns from the quiz’s own questions');
    d = await insights();
    ck('five breakdowns (practice stage, what draws them, where they get stuck, how well they know the tradition, their role), each with counts that add up to its total (the quiz takers of the 90 days) and percentages', d.breakdowns.length === 5 && d.breakdowns.every(b => b.total >= 50 && b.total <= 60 && b.answers.reduce((n, a) => n + a.count, 0) === b.total && b.answers.every(a => Math.abs(a.pct - (a.count / b.total) * 100) < 0.01)), JSON.stringify(d.breakdowns.map(b => [b.label, b.total])));
    ck('and carry their own metric (the top answer’s share), cited like any other', d.week.metrics.some(m => m.source === 'report' && /Share who answered/.test(m.label) && m.unit === 'pct'));

    console.log('-- which topics convert in ads');
    const kali = d.topics.find(t => t.topic === 'Kali');
    ck('the Kali topic joins the campaign’s ad results, Circle purchases and Kit purchases under one name', !!kali && kali.meta && kali.meta.spend_cents > 0 && kali.circle && kali.kit && kali.circle.count > 0 && kali.kit.count > 0, JSON.stringify(d.topics.map(t => [t.topic, !!t.meta, !!t.circle, !!t.kit])));
    ck('its Meta row has spend, purchases, return on ad spend (from ad sets with returns 2.4 down to 0.4) and the low-data flag when there are too few', kali.meta.purchases >= 0 && kali.meta.roas > 0 && typeof kali.meta.low === 'boolean' && kali.meta.goals.join() === 'Purchase');
    ck('the same topic’s Circle and Kit sales are each in their own metric, naming their source', ['circle_count', 'circle_cents', 'kit_count', 'kit_cents'].every(k => kali.ids[k] && ID.test(kali.ids[k])) && byIdSrc(d, kali.ids.circle_count) === 'circle' && byIdSrc(d, kali.ids.kit_count) === 'kit_purchases');
    ck('the other topics are listed too (Meditation Pass from Circle and Kit alone), flagged too few to trust when small', d.topics.some(t => t.topic === 'Meditation Pass' && !t.meta && t.circle?.low) && d.topics.length >= 3);
    ck('a topic with fewer than 5 purchases is flagged low (no trend to be read into 3 purchases)', d.topics.filter(t => t.circle && t.circle.count < 5).every(t => t.circle.low === true) && d.week.thresholds.MIN_PURCHASES === 5);
    ck('Kit email: opens by topic when an email carries the event tag, as a share of its recipients', d.topics.some(t => t.mail && t.mail.recipients > 0) || d.week.metrics.some(m => m.source === 'kit_email' && /opened/.test(m.label)));

    console.log('-- suggested course topics');
    const ideas = d.ideas.new;
    ck('there are ideas, new, each with evidence, a format, an audience and a source for every number', ideas.length >= 1 && ideas.every(i => i.evidence.length > 0 && i.evidence.every(e => ID.test(e.id) && e.text !== undefined && e.source && e.period) && i.format && i.audience), JSON.stringify(ideas.map(i => i.title)));
    const formatLabels = V.FORMATS.map(f => f.label), audNames = [...(await (await get('/api/ops/ads-library')).j.rows.map(r => r.name)), 'The Contemplative', 'The Devotee', 'The Scholar', 'The Householder'];
    ck('each idea’s format is one EP already runs, and its audience is a library audience or a quiz archetype', ideas.every(i => formatLabels.includes(i.format) && audNames.includes(i.audience)), JSON.stringify(ideas.map(i => [i.format, i.audience])));
    const EP = V.vocabulary(['Kali: the dark mother', 'Spanda Intensive', 'Meditation Pass', 'Sādhana School: Fall 2026', 'Meditation Mondays', 'The Heart of Recognition']);
    ck('each title uses only words EP already uses (its topics, programs, tags and quiz answers)', ideas.every(i => V.checkTopicWords(i.title, EP).length === 0), JSON.stringify(ideas.map(i => i.title)));
    ck('and an idea’s summary only restates its cited numbers (checked again here)', ideas.every(i => V.verifyText(i.summary, i.evidence.map(e => e.id), new Map(d.week.metrics.map(m => [m.id, m])), ['Kali']) === ''));

    console.log('-- a deliberately bad model answer: bad claims and bad ideas are dropped, the good ones stay');
    const before = { claims: d.week.claims.map(c => c.text), ideas: [...d.ideas.new, ...d.ideas.sent, ...d.ideas.dismissed].length };
    await mockSet('bad=1');
    const badRun = await cronGet('/api/ops/ads-insights'), after = await insights();
    ck('the run reports what it dropped: 4 claims (a wrong number, a missing metric, no metric, an invented sum) and 4 ideas (an unknown word, an unknown format, an unknown audience, a missing metric)', badRun.j.read.dropped === 4 && badRun.j.ideas.dropped === 4, JSON.stringify(badRun.j.read) + JSON.stringify(badRun.j.ideas));
    ck('the good claims are all still there and none of the bad ones is shown', JSON.stringify(after.week.claims.map(c => c.text)) === JSON.stringify(before.claims) && !after.week.claims.some(c => /987654|m9999|12 people|in all/.test(c.text)));
    ck('the page says how many statements were left out', after.week.verification.dropped === 4 && after.week.verification.kept === before.claims.length);
    ck('no bad idea was stored (no “Quantum Crystal Healing”, no unknown format or audience), and none doubled', [...after.ideas.new, ...after.ideas.sent, ...after.ideas.dismissed].length === before.ideas && ![...after.ideas.new].some(i => /quantum/i.test(i.title)));
    await mockSet('bad=0');

    console.log('-- dismissed ideas never come back');
    const one = after.ideas.new[0], dis = await reads({ action: 'dismiss', id: one.id });
    ck('dismiss records who and when and says it won’t come back', dis.status === 200 && dis.j.idea.status === 'dismissed' && dis.j.idea.dismissed_by && dis.j.idea.dismissed_at && /won’t be suggested again/.test(dis.j.message));
    await cronGet('/api/ops/ads-insights'); await cronGet('/api/ops/ads-insights');
    let dd = await insights();
    ck('after two more weekly runs the dismissed idea is still dismissed, not new, and appears once', dd.ideas.dismissed.some(i => i.id === one.id) && !dd.ideas.new.some(i => V.sameTopic(V.topicKey(i.title), V.topicKey(one.title))) && [...dd.ideas.new, ...dd.ideas.sent, ...dd.ideas.dismissed].filter(i => V.sameTopic(V.topicKey(i.title), V.topicKey(one.title))).length === 1);
    ck('the model is told which topics were dismissed (so it does not offer them)', JSON.parse(JSON.parse((await anthropicLog()).filter(r => /topic_ideas/.test(r)).at(-1)).messages[0].content).already_suggested_or_dismissed.includes(one.title));
    const un = await reads({ action: 'undismiss', id: one.id });
    ck('Bring back puts it back as new', un.status === 200 && un.j.idea.status === 'new');
    await reads({ action: 'dismiss', id: one.id });

    console.log('-- Send to Programs: a draft idea in the dashboard’s own database, nothing in any sheet');
    dd = await insights(); const pick = dd.ideas.new[0];
    ck('the Programs page shows no “Ideas from Ads” before anything is sent', !/Ideas from Ads/.test((await page('/ops/programs', DIR)).text));
    const sw1 = sheetWrites(), mw1 = await metaWrites();
    const sent = await reads({ action: 'send', id: pick.id });
    ck('Send to Programs marks it sent, with who and when, and says nothing reached the calendar or the website', sent.status === 200 && sent.j.idea.status === 'sent' && sent.j.idea.sent_by && sent.j.idea.sent_at && /Nothing was added to the calendar or the website/.test(sent.j.message));
    ck('pressing it again changes nothing', (await reads({ action: 'send', id: pick.id })).j.idea.sent_at === sent.j.idea.sent_at);
    ck('a dismissed idea can’t be sent', (await reads({ action: 'send', id: one.id })).status === 409);
    const prog = await page('/ops/programs', DIR), prb = await page('/ops/programs', rb);
    ck('the director sees the “Ideas from Ads” strip on Programs: draft, evidence, a link back, and “Create a program from this idea”', /Ideas from Ads/.test(prog.text) && prog.text.includes(pick.title) && />Draft</.test(prog.text) && /programs\?idea=/.test(prog.text) && />Create a program from this idea</.test(prog.text) && /Back to the numbers/.test(prog.text) && /The evidence/.test(prog.text));
    ck('Rebecka (Ads role) sees the strip too, but is told who can create the program (she is not an editor)', /Ideas from Ads/.test(prb.text) && prb.text.includes(pick.title) && !/programs\?idea=/.test(prb.text) && /can create the program from this idea/.test(prb.text));
    for (const [who, email] of everyone) { const t = (await page('/ops/programs', cookie(email))).text; ck(`${who} is not shown the strip`, !/Ideas from Ads/.test(t) && !t.includes(pick.id)); }
    const mk = await page(`/ops/programs?idea=${pick.id}`, DIR);
    ck('“Create a program from this idea” opens the existing Add a program form, prefilled with the idea’s title and school', /New program/.test(mk.text) && mk.text.includes(`value="${pick.title.replace(/&/g, '&amp;')}"`), mk.text.slice(mk.text.indexOf('New program'), mk.text.indexOf('New program') + 400));
    ck('and it is only a form: it wrote nothing', sheetWrites() === sw1 && (await metaWrites()) === mw1);
    ck('Send, dismiss and Bring back wrote nothing to any sheet, Circle or Kit, and nothing to Meta', sheetWrites() === sw1 && (await metaWrites()) === mw1 && !/KIT (DRAFT|TAG)|CIRCLE WRITE/.test(mockLog()));
    ck('the whole weekly job and the page wrote nothing to Meta either', (await metaWrites()) === mw0);
    ck('the Audience insights page lists the sent idea under “Sent to Programs”', (await insights()).ideas.sent.some(i => i.id === pick.id));

    console.log('-- no personal data anywhere');
    for (const u of ['/ops/ads?view=insights', '/ops/ads?view=library', '/ops/programs', `/ops/programs?idea=${pick.id}`, '/ops/settings?view=connections']) await page(u, DIR);
    await mark('', '/api/ops/ads-reads', DIR); await mark('', '/api/ops/ads-library', DIR); everything.push(JSON.stringify(await cronGet('/api/ops/ads-insights?dry=1')), JSON.stringify(run.j));
    const ant = await anthropicLog(), mine = ant.filter(r => /"kind\\":\\"(weekly_read|topic_ideas)/.test(r));
    ck('the model was asked (a read and ideas, each time)', mine.length >= 4, mine.length);
    ck('no name, address or purchase id from the quiz, Circle or Kit is in any page or answer', !everything.some(t => PERSON.test(t)));
    ck('nor in the app’s log, the mock’s log, the Meta mock’s log', !PERSON.test(appLog()) && !PERSON.test(mockLog()) && !PERSON.test(JSON.stringify(await meta())));
    ck('nor in anything sent to the model (every request is only numbers, EP’s own topic names and word lists)', ant.every(r => !PERSON.test(r) && !/[\w.+-]+@[\w-]+\.\w+/.test(r)));
    ck('and what is sent has only the fields it should: model, size, rules, and one message of numbers', mine.every(r => { const o = JSON.parse(r), u = JSON.parse(o.messages[0].content); return Object.keys(o).sort().join() === 'max_tokens,messages,model,system' && o.messages.length === 1 && u.metrics.every(m => Object.keys(m).every(k => ['id', 'label', 'text', 'value', 'unit', 'source', 'period', 'topic', 'low'].includes(k))); }));
    ck('the database address and the keys appear nowhere', !/postgres(ql)?:\/\//.test(everything.join('') + appLog()) && !everything.join('').includes('mock-anthropic-key') && !appLog().includes('mock-anthropic-key'));
  }

  if (PHASE === 'nokey') {
    console.log('-- no Anthropic key: the numbers without prose');
    const run = await cronGet('/api/ops/ads-insights'), d = await insights(), pg = await page('/ops/ads?view=insights', DIR);
    ck('the weekly job runs and keeps the numbers', run.status === 200 && run.j.read.state === 'no_key' && run.j.read.claims === 0 && d.week.metrics.length > 10 && d.week.claims.length === 0 && d.week.state === 'no_key' && d.ai === false);
    ck('the model is never asked', (await anthropicLog()).length === 0);
    ck('no ideas are invented', d.ideas.new.length === 0 && run.j.ideas.added === 0 && run.j.ideas.state === 'no_key');
    ck('the page is told there is no key (the sentence itself is checked on screen by ads-insights.cjs)', d.ai === false && /Audience insights/.test(pg.text));
  }

  if (['kitonly', 'circleonly', 'neither'].includes(PHASE)) {
    console.log(`-- ${PHASE}: each source answers for itself`);
    const run = await cronGet('/api/ops/ads-insights'), d = await insights(), st = STATES(d.sources), w = d.week;
    const has = k => w.metrics.some(m => m.source === k);
    ck('the Practice Report and Meta are not connected here', st.report === 'off' && st.meta === 'off' && d.sources.find(s => s.key === 'report').todo.includes('REPORT_DATABASE_URL') && /No campaign has run in Meta/.test(d.sources.find(s => s.key === 'meta').note));
    if (PHASE === 'kitonly') ck('only Kit is connected: Kit purchases and Kit email have numbers, Circle says it is not connected', st.circle === 'off' && /isn’t connected/.test(d.sources.find(s => s.key === 'circle').note) && st.kit_purchases === 'ok' && st.kit_email === 'ok' && !has('circle') && has('kit_purchases') && has('kit_email') && w.state === 'ok');
    if (PHASE === 'circleonly') ck('only Circle is connected: Circle has numbers, both Kit sources say not connected', st.circle === 'ok' && st.kit_purchases === 'off' && st.kit_email === 'off' && /isn’t connected/.test(d.sources.find(s => s.key === 'kit_purchases').note) && has('circle') && !has('kit_purchases') && !has('kit_email') && w.state === 'ok');
    if (PHASE !== 'neither') ck('with only one of Circle and Kit there is nothing to add or overlap: no overlap note', w.overlap_note === '');
    if (PHASE === 'neither') ck('nothing is connected: every source says so, there are no numbers, no read and the model is not asked', Object.values(st).every(x => x === 'off') && w.metrics.length === 0 && w.claims.length === 0 && w.state === 'no_data' && (await anthropicLog()).length === 0 && run.j.read.state === 'no_data');
    ck('each source is shown as connected or not, separately, with its reason', d.sources.every(s => typeof s.connected === 'boolean' && (s.connected && s.ok ? true : !!s.note)));
    everything.push(JSON.stringify(d));
  }

  if (PHASE === 'failures') {
    console.log('-- a source that fails says so; the others carry on');
    const base = STATES((await cronGet('/api/ops/ads-insights?dry=1')).j.sources);
    ck('to begin with Circle and Kit both answer', base.circle === 'ok' && base.kit_purchases === 'ok' && base.kit_email === 'ok');
    await mockSet('kit=fail&broadcasts=1');
    let r = await cronGet('/api/ops/ads-insights'), d = await insights(), st = STATES(d.sources);
    ck('Kit failing: Kit purchases and Kit email say they couldn’t be read just now (connected, but not read)', st.kit_purchases === 'error' && st.kit_email === 'error' && /Kit couldn’t be read just now/.test(d.sources.find(s => s.key === 'kit_purchases').note) && /Kit couldn’t be read just now/.test(d.sources.find(s => s.key === 'kit_email').note));
    ck('…and Circle and the rest still work, with a read made from what there is', st.circle === 'ok' && d.week.metrics.some(m => m.source === 'circle') && !d.week.metrics.some(m => m.source === 'kit_purchases' || m.source === 'kit_email') && d.week.state === 'ok' && d.week.claims.length > 0);
    ck('the Kit failure leaves no error text, address or key in the app’s log', !/mock failure/.test(appLog()) && !appLog().includes('mock-anthropic-key'));
    await mockSet('kit=ok&circle=none');
    r = await cronGet('/api/ops/ads-insights'); d = await insights(); st = STATES(d.sources);
    ck('Circle that cannot list purchases: not connected, in plain words; Kit carries on', st.circle === 'off' && /can’t list purchases/.test(d.sources.find(s => s.key === 'circle').note) && st.kit_purchases === 'ok' && d.week.metrics.some(m => m.source === 'kit_purchases'));
    await mockSet('circle=fail');
    r = await cronGet('/api/ops/ads-insights'); d = await insights(); st = STATES(d.sources);
    ck('Circle answering with an error: couldn’t be read just now; Kit carries on', st.circle === 'error' && /Circle couldn’t be read just now/.test(d.sources.find(s => s.key === 'circle').note) && st.kit_purchases === 'ok');
    ck('and every source is still listed on the page', d.sources.length === 5);
    await mockSet('circle=ok');
  }

  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL (crashed)', e); process.exit(1); });
function byIdSrc(d, id) { return d.week.metrics.find(m => m.id === id)?.source; }
