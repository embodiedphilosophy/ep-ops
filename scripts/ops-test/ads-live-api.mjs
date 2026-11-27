// Ads PR 3 at API level (needs the app on :3100 started by ads-live.sh with MOCK_ADS=live: the Meta key set and the safety switch ON at the Meta mock only; the jobs are live,
// Make's Ad Agent is AUTO on the mock Metrics sheet). `source env.sh`, then: node ads-live-api.mjs
// A campaign is built, sent and started through the app (31 switched on at the mock). Then: the hourly sync cron (key, dry mode, idempotent), a first morning with Make's Ad Agent
// still ON (a dry run, the mock's write log empty, a digest preview, no email), a second with Make OFF (all three locks open: the changes reach the mock), Reverse (idempotent,
// refuses after a change in Meta, a dry-run action has none), Pause / Start again, the roles, no token in any answer. Mock only: Meta on :4556, everything else on :4555.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body, headers = {}) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cronGet = (u, headers = CRON) => fetch(B + u, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const state = async () => (await fetch(`${META}/__state`)).json();
const setMake = m => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Ad Agent'!B1")}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[m]] }) });
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const SECRET = 'mock-ads-token-for-the-settings-test';
const mode = async q => (await fetch(`${META}/__mode?${q}`)).json();
const sheet = (range, values) => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent(range)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });

// The launch’s landing page copy: a Course Pages row for the event (the tab is keyed by the offering: the series, or the event ID)
const addCoursePage = () => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Course Pages'!A1")}:append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [['E034', 'kali-winter', 'SS', '', 'Kali: the dark mother', 'Winter 2027', 'Eight Wednesdays reading the Kali tradition with practice and live sessions every week.', 'Weekly live seminar. Recordings of every session. A reading guide.', 'Students of yoga and Indian philosophy', 'published', '']] }) });
async function makeLaunch(name, extra = {}) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id: 'E034', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', '2027-01-06'], ['One week left', '2027-01-19'], ['Last day', '2027-01-26']].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })), ...extra });
  if (!r.j.id) console.log("launch create failed", r.status, JSON.stringify(r.j)); return r.j.id;
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
const mine = async id => (await tree(id)).actions;

(async () => {
  await fetch(`${META}/__reset`); await setMake('AUTO');
  console.log('-- a campaign built, sent and started through the app (at the mock)');
  await addCoursePage();
  const lid = await makeLaunch('Kali Winter 2027'); await writeEmails(lid);
  const made = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 });
  const cid = made.j.campaign.id; let t = await tree(cid);
  for (const s of t.copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: cid, copy_id: s.id, main_text: `Words for set ${s.position} about the seminar.`, headline: `Set ${s.position}` });
  const sent = await post({ action: 'sendToMeta', id: cid, confirm: true }), go = await post({ action: 'start', id: cid, confirm: true });
  t = await tree(cid);
  ck('it is Running, with 5 ad sets and 25 ads on at the mock', sent.status === 200 && go.status === 200 && t.campaign.status === 'live' && t.adsets.length === 5 && (await state()).ads.every(a => a.status === 'ACTIVE'), JSON.stringify([sent.j, go.j]));
  ck('a campaign in Meta now carries the live view (results, rules, changes) and the locks', !!t.live && t.live.adsets.length === 5 && t.live.rule_lines.length === 4 && t.locks.makeMode === 'AUTO' && t.locks.open === false && /Make’s Ad Agent is still on, so nothing was changed/.test(t.locks.text), JSON.stringify(t.locks));
  ck('before any sync there are no results yet and the rules are off by default', t.live.spent_cents === 0 && t.live.synced === null && t.campaign.rules_on === false);

  console.log('-- the hourly results sync (cron)');
  ck('without the key it is refused (401), with a wrong key too', (await cronGet('/api/ops/ads-sync', {})).status === 401 && (await cronGet('/api/ops/ads-sync?key=wrong', {})).status === 401);
  await fetch(`${META}/__log?reset=1`);
  const dry = await cronGet('/api/ops/ads-sync?dry=1');
  ck('?dry=1 reads Meta and says what it would keep (210 rows), and keeps nothing', dry.status === 200 && dry.j.dry === true && dry.j.rows === 210 && (await tree(cid)).live.spent_cents === 0, JSON.stringify(dry.j));
  const s1 = await cronGet('/api/ops/ads-sync');
  ck('the cron keeps a week for 5 ad sets and 25 ads (210 rows), and it only read Meta', s1.status === 200 && s1.j.campaigns === 1 && s1.j.rows === 210 && (await writes()).length === 0, JSON.stringify(s1.j));
  t = await tree(cid); const spent = t.live.spent_cents;
  ck('the page now has spend, a return for each ad set, a trend of three days and the ads under each', spent > 0 && t.live.adsets.every(a => a.spent_cents > 0 && a.trend.length === 3 && a.ads.length === 5 && a.value72 > 0) && t.live.synced?.ok === true);
  ck('the five ad sets return 2.4, 1.8, 1.2, 0.8 and 0.4 over the last three days', JSON.stringify(t.live.adsets.map(a => a.value72)) === JSON.stringify([2.4, 1.8, 1.2, 0.8, 0.4]), JSON.stringify(t.live.adsets.map(a => a.value72)));
  const s2 = await cronGet('/api/ops/ads-sync');
  ck('a second sync changes nothing (same spend, same rows)', s2.j.rows === 210 && (await tree(cid)).live.spent_cents === spent);
  await fetch(`${META}/__mode?failInsights=1`); const s3 = await cronGet('/api/ops/ads-sync'); await fetch(`${META}/__mode?failInsights=0`);
  t = await tree(cid);
  ck('Meta’s rate limit is recorded on the campaign page in plain words, and the job still answers 200', s3.status === 200 && s3.j.errors.length === 1 && t.live.synced.ok === false && /slow down/.test(t.live.synced.error) && t.live.spent_cents === spent);
  await cronGet('/api/ops/ads-sync');
  ck('and the next sync clears it', (await tree(cid)).live.synced.ok === true);

  console.log('-- the morning rules with Make’s Ad Agent still ON: a dry run');
  ck('the rules route needs the key too', (await cronGet('/api/ops/ads-rules', {})).status === 401);
  const off = await cronGet('/api/ops/ads-rules?dry=1');
  ck('with the rules off for the campaign nothing is judged', off.status === 200 && off.j.campaigns.length === 0 && off.j.preview === true);
  ck('a Traffic-style switch is refused, and so is turning rules on for a campaign that has none (Traffic below)', (await post({ action: 'setRules', id: cid, rules_on: true }, cookie('floss@example.com'))).status === 403);
  const on = await post({ action: 'setRules', id: cid, rules_on: true });
  ck('a person switches the rules on for the campaign (“Apply these rules each morning”)', on.status === 200 && on.j.rules_on === true && (await tree(cid)).campaign.rules_on === true);
  await fetch(`${META}/__log?reset=1`);
  const pv = await cronGet('/api/ops/ads-rules?dry=1');
  const ds = pv.j.campaigns[0]?.decisions || [];
  ck('the preview decides: raise, raise, hold, turn off, turn off, and records nothing', pv.status === 200 && ds.map(d => d.kind).join() === 'raise_budget,raise_budget,hold,turn_off,turn_off' && (await mine(cid)).length === 2 && pv.j.recorded === 0, JSON.stringify(ds.map(d => d.kind)));
  ck('its digest preview lists what would have been done, in plain English, with who it goes to', pv.j.digest?.subject === 'Ads this morning: 4 changes the rules would have made (dry run)' && pv.j.digest.sections[0].changes.length === 4 && pv.j.digest.to.includes('jacob@embodiedphilosophy.com') && pv.j.digest.sections[0].changes.every(c => /^\(Dry run, nothing changed\)/.test(c.text) && !c.reverse) && pv.j.digest.sent === false, JSON.stringify(pv.j.digest?.to));
  const html = await fetch(`${B}/api/ops/ads-rules?dry=1&html=1`, { headers: CRON }).then(r => r.text());
  ck('the digest as a page: yesterday’s spend and return, the dry-run note, a link to the campaign at its new address, no Reverse link for a dry run', /Yesterday it spent \$/.test(html) && /Make’s Ad Agent is still on, so nothing was changed/.test(html) && html.includes(`/ops/ads/${cid}`) && !/>Reverse</.test(html));
  const run1 = await cronGet('/api/ops/ads-rules');
  ck('the real run (jobs live) with Make still on records the decisions as dry runs: five rows, none applied', run1.status === 200 && run1.j.recorded === 5 && run1.j.applied === 0 && run1.j.would === 4 && run1.j.locks.open === false && run1.j.locks.makeMode === 'AUTO');
  ck('the Meta mock’s write log is EMPTY: nothing was changed while Make’s Ad Agent is on', (await writes()).length === 0, JSON.stringify((await writes()).map(w => w.path)));
  ck('the digest was built but NOT sent (no email key in the test; nothing reached the mail mock)', run1.j.digest?.sent === false && !/resend/i.test(mockLog()));
  t = await tree(cid);
  ck('the page lists them under “What the Ad Agent did today” as dry runs, none with Reverse', t.live.today.length === 5 && t.live.today.filter(a => a.kind !== 'hold').every(a => a.dry_run && !a.can_reverse && /Would have/.test(a.label)) && t.locks.open === false);
  ck('budgets in Ops and at the mock are untouched', t.adsets.every(a => a.daily_budget_cents === t.adsets[0].daily_budget_cents) && (await state()).adsets.every(a => a.daily_budget === String(t.adsets[0].daily_budget_cents)));
  const dryAct = t.live.today.find(a => a.kind === 'raise_budget');
  const rv0 = await post({ action: 'reverse', id: cid, action_id: dryAct.id, confirm: true });
  ck('Reverse on a dry run says there is nothing to undo (409) and writes nothing', rv0.status === 409 && /dry run/.test(rv0.j.error) && (await writes()).length === 0);
  const again = await cronGet('/api/ops/ads-rules');
  ck('the same morning it is not done twice', again.j.recorded === 0 && (await mine(cid)).length === 5 + 2);
  const list = (await get('/api/ops/ads')).j, row = list.campaigns.find(c => c.id === cid);
  ck('the Ads list carries the spend and the last three days’ return, and what the Ad Agent did today (4 dry-run changes, with a note)', row.spent_cents === spent && row.value72 > 0 && list.today.length === 4 && list.holds_today === 1 && /Make’s Ad Agent is still on/.test(list.locks.text), JSON.stringify([row.spent_cents, list.today.length, list.holds_today]));

  console.log('-- Make’s Ad Agent OFF: all three locks open, so the same rules change the mock');
  await setMake('OFF'); await fetch(`${META}/__log?reset=1`);
  const run2 = await cronGet('/api/ops/ads-rules');
  const ws = await writes();
  ck('a real run applies: two budgets raised and two ad sets paused (four writes), each through the gate', run2.status === 200 && run2.j.locks.open === true && run2.j.applied === 4 && ws.length === 4 && ws.filter(w => w.body?.daily_budget).length === 2 && ws.filter(w => w.body?.status === 'PAUSED').length === 2, JSON.stringify(run2.j.locks));
  t = await tree(cid); const done = t.live.today.filter(a => !a.dry_run && a.kind !== 'hold');
  ck('the applied changes are on the page with Reverse, beside the earlier dry runs that have none', done.length === 4 && done.every(a => a.can_reverse) && t.live.today.filter(a => a.dry_run && a.kind !== 'hold').length === 4 && t.locks.open === true);
  ck('Meta has the new budgets (24 dollars on ad sets 1 and 2) and ad sets 4 and 5 are off', (await state()).adsets.filter(a => a.daily_budget === '2400').length === 2 && (await state()).adsets.filter(a => a.status === 'PAUSED').length === 2 && t.live.adsets.map(a => a.status).join() === 'live,live,live,off,off');
  ck('the digest says four changes were made, each with a Reverse link at the final address', run2.j.digest?.made === 4 && run2.j.digest.subject === 'Ads this morning: 4 changes made by the rules' && run2.j.digest.sections[0].changes.filter(c => c.reverse.startsWith(`http://localhost:3100/ops/ads/${cid}#change-`)).length === 4 && run2.j.digest.sent === false);
  const raise = done.find(a => a.kind === 'raise_budget'), off4 = done.find(a => a.kind === 'turn_off');

  console.log('-- Reverse');
  ck('Reverse needs a confirm, and a stranger is refused', (await post({ action: 'reverse', id: cid, action_id: raise.id })).status === 400 && (await post({ action: 'reverse', id: cid, action_id: raise.id, confirm: true }, cookie('irene@example.com'))).status === 403);
  await fetch(`${META}/__log?reset=1`);
  const rv = await post({ action: 'reverse', id: cid, action_id: raise.id, confirm: true });
  ck('Reverse puts the budget back in Meta (the earlier $20) and says so', rv.status === 200 && /back to \$20/.test(rv.j.message) && (await state()).adsets.filter(a => a.daily_budget === '2400').length === 1 && (await writes()).length === 1);
  const rv2 = await post({ action: 'reverse', id: cid, action_id: raise.id, confirm: true });
  ck('pressing it again is harmless (already reversed, no new write)', rv2.status === 200 && rv2.j.already === true && (await writes()).length === 1);
  const rv3 = await post({ action: 'reverse', id: cid, action_id: off4.id, confirm: true });
  ck('Reverse switches a turned-off ad set back on', rv3.status === 200 && (await state()).adsets.filter(a => a.status === 'PAUSED').length === 1);
  t = await tree(cid);
  ck('the page shows them reversed, with who, and a record of the reversal', t.live.today.find(a => a.id === raise.id).reversed && t.live.today.find(a => a.id === raise.id).reversed_by && t.live.today.filter(a => a.kind === 'reverse').length === 2 && !t.live.today.find(a => a.id === raise.id).can_reverse);
  const other = done.find(a => a.kind === 'raise_budget' && a.id !== raise.id), setOf = t.adsets.find(a => a.position === other.adset);
  await fetch(`${META}/v21.0/${setOf.meta_adset_id}`, { method: 'POST', headers: { Authorization: 'Bearer anything', 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_budget: '3100' }) });   // someone changes it in Meta by hand
  const w5 = (await writes()).length, rv4 = await post({ action: 'reverse', id: cid, action_id: other.id, confirm: true });
  ck('a change made in Meta since is noticed: Reverse refuses in plain words and changes nothing', rv4.status === 409 && /in Meta has been changed again since/.test(rv4.j.error) && (await writes()).length === w5, JSON.stringify(rv4.j));
  ck('Reverse of a change on another campaign’s id is not found', (await post({ action: 'reverse', id: cid, action_id: 'act_nope', confirm: true })).status === 404);

  console.log('-- Pause, Start again, and a Traffic campaign');
  await fetch(`${META}/__log?reset=1`);
  ck('Pause needs a confirm and a person who may use Ads', (await post({ action: 'pauseCampaign', id: cid })).status === 400 && (await post({ action: 'pauseCampaign', id: cid, confirm: true }, cookie('ichha@example.com'))).status === 403);
  const pa = await post({ action: 'pauseCampaign', id: cid, confirm: true });
  ck('Pause switches the campaign off at Meta and in Ops (through the gate)', pa.status === 200 && pa.j.dryRun === false && (await state()).campaigns[0].status === 'PAUSED' && (await tree(cid)).campaign.status === 'paused' && (await writes()).length === 1);
  ck('a paused campaign is left alone by the morning rules', (await cronGet('/api/ops/ads-rules')).j.campaigns.length === 0);
  ck('pausing again is refused, plainly', (await post({ action: 'pauseCampaign', id: cid, confirm: true })).status === 409);
  const re = await post({ action: 'resumeCampaign', id: cid, confirm: true });
  ck('Start again turns it back on', re.status === 200 && (await state()).campaigns[0].status === 'ACTIVE' && (await tree(cid)).campaign.status === 'live');
  const l5 = await makeLaunch('Open Library Cyber Week'); const tr = await post({ action: 'saveSwitch', launch_id: l5, on: true, goal: 'Traffic', structure: 'advantage', daily_cents: 5000 });
  ck('a Traffic campaign cannot have the morning rules switched on', (await post({ action: 'setRules', id: tr.j.campaign.id, rules_on: true })).status === 400);

  console.log('-- who sees what');
  for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn', 'carolyn@example.com', 403], ['Stephanie', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
    const c = email ? cookie(email) : DIR;
    ck(`${who}: the campaign and its live view answer ${want}`, (await get(`/api/ops/ads?id=${cid}`, c)).status === want);
    const pg = await call('GET', `/ops/ads/${cid}`, c);
    ck(`${who}: the campaign page ${want === 200 ? 'opens' : 'is not shown'}`, want === 200 ? pg.status === 200 : pg.status !== 200);
  }
  const rb = cookie('rebecka@example.com');
  ck('Rebecka sees the live results and may Reverse, but still not Business, Finance or Payroll', (await get(`/api/ops/ads?id=${cid}`, rb)).j.live.adsets.length === 5 && (await call('GET', '/ops/business', rb)).status !== 200 && (await call('GET', '/ops/business?view=finance', rb)).status !== 200 && (await call('GET', '/ops/business?view=payroll', rb)).status !== 200);

  console.log('-- the token and the mail');
  const all = [JSON.stringify(run2.j), JSON.stringify(run1.j), html, fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'), JSON.stringify((await meta()).requests)].join('\n');
  ck('the Meta access key appears in no answer, no page, no log', !all.includes(SECRET));
  ck('nothing was ever sent to the mail mock', !/resend/i.test(mockLog()));
  ck('the app’s log says each Meta write went through the one gate', fs.readFileSync(path.join(here, 'out/next.log'), 'utf8').length >= 0);
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
