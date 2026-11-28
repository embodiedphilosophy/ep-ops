// Relaunch (Ads), at API level (needs the app on :3100 started by ads-relaunch.sh): node ads-relaunch-api.mjs live | nokey
//   live : the Meta key set and the safety switch ON at the Meta mock only. Two campaigns are built and sent through the app (a Purchase 5 × 5 with edited copy, rules and a spending cap;
//          a Traffic Advantage+), then "Relaunch" is pressed: a new UNSENT draft with the same goal, structure, audiences, pictures, link, button and budget (editable), fresh copy
//          (none of the old words), default rules (none for Traffic), dates from a newer launch or flagged; the old campaign is untouched; one click, one draft; roles; and the
//          Meta mock sees NO write from any of it.
//   nokey: no drafting key: the relaunched copy is all [placeholders], and nothing reaches Anthropic.
// Mock only: Meta on :4556, everything else on :4555. The real Meta and the real Anthropic are never contacted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODE = process.argv[2] || 'live', B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const meta = async () => (await fetch(`${META}/__log`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const SECRETS = ['mock-ads-token-for-the-settings-test', 'mock-anthropic-key-not-real'];
const MARK = /zephyrquartz|quillmarker/i;
// The launch’s landing page copy: a Course Pages row for the event (the tab is keyed by the offering: the series, or the event ID)
const addCoursePage = () => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Course Pages'!A1")}:append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [['E034', 'kali-winter', 'SS', '', 'Kali: the dark mother', 'Winter 2027', 'Eight Wednesdays reading the Kali tradition with practice and live sessions every week.', 'Weekly live seminar. Recordings of every session. A reading guide.', 'Students of yoga and Indian philosophy', 'published', '']] }) });
async function makeLaunch(name, { event_id = 'E034', open = '2027-01-06', close = '2027-01-26', term = '2027-01-27' } = {}) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id, playbook_id: 'PB-enrol', dates: { open, close, term },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', open], ['One week left', close], ['Last day', close]].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })) });
  if (!r.j.id) console.log('launch create failed', r.status, JSON.stringify(r.j)); return r.j.id;
}
// Real words in the launch's emails (with an address, a link and a merge tag in them, which must never be sent for drafting)
async function writeEmails(lid) {
  const items = (await get(`/api/ops/email/launches?id=${lid}`)).j.items.filter(i => i.lane === 'email').sort((a, b) => a.date.localeCompare(b.date));
  const texts = ['Eight Wednesdays with the goddess who wears time as a garland. Winter Term begins 27 January. Write to hello@example.com or see https://example.com/kali {{ subscriber.first_name }}.',
    'One week left to join the Kali seminar. Study the tradition with Tova Olsson and Nataraj, with practice and live sessions every week.', 'The last day to enrol is 26 January. Doors close at midnight and the seminar begins the next morning.'];
  for (const [i, it] of items.entries()) { const r = await call('POST', '/api/ops/email/plan', DIR, { action: 'save', id: it.key, changes: { blocks: [{ type: 'text', text: texts[i] }] } }); if (r.status !== 200) console.log('email save failed', r.status, JSON.stringify(r.j)); }
  return items.length;
}
const tree = async (id, q = '') => (await get(`/api/ops/ads?id=${id}${q}`)).j;
const core = t => JSON.stringify({ c: t.campaign, a: t.adsets, cr: t.creatives, cp: t.copysets, ad: t.ads, r: t.rules, ac: t.actions });
const count = async () => (await get('/api/ops/ads')).j.campaigns.length;
const markWords = async (id, n = 'marker') => { for (const s of (await tree(id)).copysets) await post({ action: 'editCopy', id, copy_id: s.id, main_text: `Zephyrquartz ${n} words for set ${s.position} about the seminar.`, headline: `Quillmarker ${s.position}` }); };
const gone = async id => post({ action: 'deleteDraft', id });

// A campaign built through the app and sent to Meta (at the mock): its copy is rewritten with marker words so a reused word can be seen
async function seed(name, { goal, structure, launch, start = false }) {
  const made = await post({ action: 'saveSwitch', launch_id: launch, on: true, goal, structure, daily_cents: 10000 });
  const id = made.j.campaign.id; await markWords(id);
  await post({ action: 'update', id, changes: { spend_cap_cents: 50000, cta: goal === 'Traffic' ? 'LEARN_MORE' : 'GET_OFFER', landing_url: 'http://localhost:4555/site/lp/kali?x=1' } });
  if (goal !== 'Traffic') await post({ action: 'saveRules', id, rules: { raise_threshold: 9, off_threshold: 0.3, raise_pct: 40 }, rules_on: true });
  const sent = await post({ action: 'sendToMeta', id, confirm: true }), go = start ? await post({ action: 'start', id, confirm: true }) : { status: 200 };
  ck(`${name}: built and sent through the app`, sent.status === 200 && go.status === 200, JSON.stringify([sent.j, go.j]));
  return id;
}

(async () => {
  await fetch(`${META}/__reset`); await fetch('http://localhost:4555/__anthropic-log?reset=1');
  await addCoursePage();
  const L1 = await makeLaunch('Kali Winter 2027'); await writeEmails(L1);
  const L3 = await makeLaunch('Open Doors Talk', { event_id: '', open: '2027-03-02', close: '2027-03-09', term: '2027-03-10' }); await writeEmails(L3);

  if (MODE === 'nokey') {
    const A = await seed('A', { goal: 'Purchase', structure: 'test', launch: L1, start: true });
    const before = core(await tree(A));
    const r = await post({ action: 'relaunch', id: A, confirm: true });
    ck('[nokey] a new draft is made', r.status === 200 && r.j.ok && r.j.id !== A, JSON.stringify(r.j));
    const d = await tree(r.j.id);
    ck('[nokey] without the drafting key all five copy sets are [placeholders], none of the old words', d.copysets.length === 5 && d.copysets.every(s => s.is_placeholder && /^\[/.test(s.main_text) && !MARK.test(s.main_text + s.headline)));
    ck('[nokey] the page says why', (d.campaign.meta_settings.notes || []).join(' ').includes('drafting key'));
    ck('[nokey] the audiences, pictures and budget still came across', d.adsets.length === 5 && d.creatives.every(x => Object.keys(x.images).length === 4) && d.total_cents === 10000);
    ck('[nokey] it cannot be sent: the placeholders block it, and Meta saw nothing', (await post({ action: 'sendToMeta', id: r.j.id, confirm: true })).status === 409 && (await tree(r.j.id, '&checks=1')).checks.canSend === false);
    ck('[nokey] the old campaign is untouched', core(await tree(A)) === before);
    ck('[nokey] nothing was sent to Anthropic', !/ANTHROPIC/.test(mockLog()) && (await (await fetch(`${MOCK}/__anthropic-log`)).json()).length === 0);
    console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
  }

  console.log('-- two past campaigns, built through the app');
  const A = await seed('A (Purchase, 5 × 5)', { goal: 'Purchase', structure: 'test', launch: L1, start: true });
  const Bc = await seed('B (Traffic, Advantage+)', { goal: 'Traffic', structure: 'advantage', launch: L3 });
  const tA = await tree(A), before = core(tA), base = await count(), w0 = (await writes()).length;
  ck('A is Running and B is in Meta, paused; neither is a draft', tA.campaign.status === 'live' && (await tree(Bc)).campaign.status === 'sent_paused');

  console.log('-- who may relaunch, and what it asks first');
  ck('without the confirm nothing is made', (await post({ action: 'relaunch', id: A })).status === 400 && await count() === base);
  for (const [who, email] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']])
    ck(`${who}: refused (403), nothing made`, (await post({ action: 'relaunch', id: A, confirm: true }, cookie(email))).status === 403 && await count() === base);
  ck('a campaign that does not exist is a 404', (await post({ action: 'relaunch', id: 'cmp_none', confirm: true })).status === 404);

  console.log('-- one click, one draft (two at once, then again)');
  const [r1, r2] = await Promise.all([post({ action: 'relaunch', id: A, confirm: true, daily_cents: 7000 }), post({ action: 'relaunch', id: A, confirm: true, daily_cents: 7000 })]);
  ck('two clicks at once answer with the same draft', r1.status === 200 && r2.status === 200 && r1.j.id === r2.j.id, JSON.stringify([r1.j, r2.j]));
  ck('and only one campaign was made', await count() === base + 1);
  const r3 = await post({ action: 'relaunch', id: A, confirm: true });
  ck('pressing it again later opens the same unsent draft (no second one)', r3.status === 200 && r3.j.id === r1.j.id && r3.j.existing === true && await count() === base + 1);

  console.log('-- the new draft');
  const D = await tree(r1.j.id, '&checks=1'), dc = D.campaign, old = tA.campaign;
  ck('it is a draft, unsent, not in Meta, with no Meta ids', dc.status === 'draft' && !dc.meta_campaign_id && D.adsets.every(a => !a.meta_adset_id) && D.ads.every(a => !a.meta_ad_id) && D.creatives.every(x => !x.meta_creative_id));
  ck('the goal, the structure, the button and the spending cap are the same', dc.goal === old.goal && dc.structure === old.structure && dc.cta === 'GET_OFFER' && dc.spend_cap_cents === 50000);
  ck('the ad link is the same', dc.landing_url === old.landing_url && D.link.startsWith('http://localhost:4555/site/lp/kali'));
  ck('the audiences are the same (5 ad sets, same names, ids and targeting)', D.adsets.length === 5 && D.adsets.every((a, i) => a.audience_name === tA.adsets[i].audience_name && a.audience_id === tA.adsets[i].audience_id && JSON.stringify(a.targeting) === JSON.stringify(tA.adsets[i].targeting)));
  ck('the pictures are the same (all four sizes of all five)', D.creatives.length === 5 && D.creatives.every((x, i) => Object.keys(x.images).length === 4 && JSON.stringify(x.images) === JSON.stringify(tA.creatives[i].images)));
  ck('there are 25 ads under 5 ad sets', D.ads.length === 25);
  ck('the daily budget was edited on the way (70 dollars, shared over the ad sets)', D.total_cents === 7000 && D.adsets.every(a => a.daily_budget_cents === 1400));
  ck('the draft says where it came from, with a link back', dc.meta_settings.relaunched_from?.id === A && dc.meta_settings.relaunched_from?.name === old.name);
  ck('and the history records it', D.actions.some(a => a.kind === 'relaunch' && /Relaunched from/.test(a.detail)));
  ck('the old campaign page lists the new draft', (await tree(A)).relaunches?.some(x => x.id === dc.id && x.status === 'draft'));

  console.log('-- fresh copy');
  const words = D.copysets.map(s => `${s.main_text} ${s.headline}`).join(' ');
  ck('five copy sets, none of the old marker words, none equal to an old set', D.copysets.length === 5 && !MARK.test(words) && D.copysets.every(s => !tA.copysets.some(o => o.main_text === s.main_text)));
  ck('copy written again from the launch’s own emails and page (each real set has a source), the rest placeholders', D.copysets.every(s => s.is_placeholder ? s.source_kind === 'placeholder' : ['launch_email', 'landing_page', 'testimonial'].includes(s.source_kind)) && D.copysets.some(s => !s.is_placeholder));
  const asked = JSON.stringify(await (await fetch(`${MOCK}/__anthropic-log`)).json());
  ck('the old ad words were never sent to the drafting service', asked.length > 2 && !MARK.test(asked));

  console.log('-- rules');
  ck('the rules start from the defaults for the goal (1.5 and 1.2), not the old edited 9 and 0.3, and are off', D.rules && D.rules.metric === 'roas' && D.rules.raise_threshold === 1.5 && D.rules.off_threshold === 1.2 && D.rules.raise_pct === 20 && dc.rules_on === false && old.rules_on === true);

  console.log('-- dates: this program has no newer launch yet');
  ck('no dates, not following the launch, and flagged "Set the dates"', !dc.start_date && !dc.end_date && dc.dates_follow_launch === false && (dc.meta_settings.notes || []).some(n => /Set the dates/.test(n)));
  ck('Start is blocked by the missing dates', D.checks.items.find(i => i.key === 'dates').ok === false);
  ck('a draft cannot itself be relaunched', (await post({ action: 'relaunch', id: dc.id, confirm: true })).status === 400);

  console.log('-- it still cannot reach Meta by itself');
  ck('Send to Meta is refused while words are missing or the check fails, and nothing is sent', D.checks.canSend === (D.copysets.every(s => !s.is_placeholder)) && D.checks.canStart === false);
  const ph = D.copysets.filter(s => s.is_placeholder);
  if (ph.length) ck('a [placeholder] blocks Send (409)', (await post({ action: 'sendToMeta', id: dc.id, confirm: true })).status === 409);
  for (const s of ph) await post({ action: 'editCopy', id: dc.id, copy_id: s.id, main_text: `A person wrote words for set ${s.position}.`, headline: `Person ${s.position}` });
  const E = await tree(dc.id, '&checks=1');
  ck('once a person has read and filled in the words, it is ready to send, but still a draft', E.checks.canSend === true && E.campaign.status === 'draft');
  ck('and the Meta mock has seen NO write from any of this', (await writes()).length === w0, String((await writes()).length - w0));

  console.log('-- dates from a newer launch');
  await gone(dc.id);
  const L2 = await makeLaunch('Kali Summer 2027', { open: '2027-06-01', close: '2027-06-20', term: '2027-06-21' });
  const r4 = await post({ action: 'relaunch', id: A, confirm: true, daily_cents: 10000 }), N = await tree(r4.j.id);
  ck('the new draft follows the newer launch: its dates, its name, dates follow the launch', N.campaign.launch_id === L2 && N.campaign.start_date === '2027-06-01' && N.campaign.end_date === '2027-06-20' && N.campaign.dates_follow_launch === true && N.campaign.name === 'Kali Summer 2027', JSON.stringify([N.campaign.launch_id, N.campaign.start_date, N.campaign.name]));
  ck('no "Set the dates" flag then, and the budget stayed as it was (100 dollars)', !(N.campaign.meta_settings.notes || []).some(n => /Set the dates/.test(n)) && N.total_cents === 10000);
  ck('the Meta campaign name has the new month', /^2027-06 · Kali Summer 2027$/.test(N.campaign.meta_settings.campaign_name));
  ck('the old campaign still points at its own launch and dates', (await tree(A)).campaign.launch_id === L1 && (await tree(A)).campaign.start_date === '2027-01-06');
  await gone(N.campaign.id);

  console.log('-- another person with the Ads role');
  const rb = await post({ action: 'relaunch', id: A, confirm: true }, cookie('rebecka@example.com'));
  ck('Rebecka (Ads role) can relaunch', rb.status === 200 && rb.j.ok === true, JSON.stringify(rb.j));
  ck('and it is recorded as her draft', (await tree(rb.j.id)).campaign.created_by.length > 0 && (await tree(rb.j.id)).campaign.meta_settings.relaunched_from.by === (await tree(rb.j.id)).campaign.created_by);
  await gone(rb.j.id);

  console.log('-- Traffic: no rules');
  const rt = await post({ action: 'relaunch', id: Bc, confirm: true }), T = await tree(rt.j.id);
  ck('a Traffic campaign relaunches as Traffic, Advantage+, one ad set, 5 ads, no rules, the "Learn more" button', T.campaign.goal === 'Traffic' && T.campaign.structure === 'advantage' && T.adsets.length === 1 && T.ads.length === 5 && T.rules === null && T.campaign.cta === 'LEARN_MORE' && T.campaign.status === 'draft');
  ck('its words are new too', T.copysets.length === 5 && !MARK.test(T.copysets.map(s => s.main_text + s.headline).join(' ')));
  await gone(rt.j.id);

  console.log('-- the old campaigns were not touched, and nothing reached Meta');
  ck('campaign A is exactly as it was (campaign, ad sets, pictures, words, ads, rules, history)', core(await tree(A)) === before);
  ck('Meta’s write log is empty of anything from the relaunches', (await writes()).length === w0);
  ck('the list is back to the two campaigns', await count() === base);
  const seen = JSON.stringify([r1.j, D, T, await get('/api/ops/ads')]);
  ck('no key or token appears in anything it said', SECRETS.every(s => !seen.includes(s)));
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
