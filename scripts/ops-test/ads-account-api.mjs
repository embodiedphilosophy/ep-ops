// The Ads account view at API level (/api/ops/ads-account), against the running app (:3100, started by ads-account.sh) and the Meta mock (world 'account'). `source env.sh`, then:
//   node ads-account-api.mjs a   no Meta key: "not connected", nothing asked of Meta        b   Meta key set, switch OFF (as in production), no Ads tables yet
//   node ads-account-api.mjs c       Meta key set and the safety switch ON at the mock (MOCK_ADS=live): a campaign built in Ops and sent, shown as "Made in Ops"
// Roles (director and Rebecka yes; Floss, Irene, Ichha, Carolyn, Stephanie, a teacher no, GET and POST; Rebecka still no Business / Finance / Payroll); what Meta is asked per look (4 reads) and
// that the memory answers the next look with none; Refresh once a minute per person (a second press is told to wait, no request); GET ?refresh=1 does not bypass the memory; nothing is ever
// written to Meta by the page (the mock's write log is unchanged); the key and the ad account number are in no answer or app log line. Mock only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHASE = process.argv[2] || 'b';
const B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body, headers = {}) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const addCoursePage = () => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Course Pages'!A1")}:append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [['E034', 'kali-winter', 'SS', '', 'Kali: the dark mother', 'Winter 2027', 'Eight Wednesdays reading the Kali tradition with practice and live sessions every week.', 'Weekly live seminar. Recordings of every session. A reading guide.', 'Students of yoga and Indian philosophy', 'published', '']] }) });
async function makeLaunch(name, extra = {}) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id: 'E034', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', '2027-01-06'], ['One week left', '2027-01-19'], ['Last day', '2027-01-26']].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })), ...extra });
  if (!r.j.id) console.log("launch create failed", r.status, JSON.stringify(r.j)); return r.j.id;
}
async function writeEmails(lid) {
  const items = (await get(`/api/ops/email/launches?id=${lid}`)).j.items.filter(i => i.lane === 'email').sort((a, b) => a.date.localeCompare(b.date));
  const texts = ['Eight Wednesdays with the goddess who wears time as a garland. Winter Term begins 27 January. Write to hello@example.com or see https://example.com/kali {{ subscriber.first_name }}.',
    'One week left to join the Kali seminar. Study the tradition with Tova Olsson and Nataraj, with practice and live sessions every week.', 'The last day to enrol is 26 January. Doors close at midnight and the seminar begins the next morning.'];
  for (const [i, it] of items.entries()) { const r = await call('POST', '/api/ops/email/plan', DIR, { action: 'save', id: it.key, changes: { blocks: [{ type: 'text', text: texts[i] }] } }); if (r.status !== 200) console.log('email save failed', r.status, JSON.stringify(r.j)); }
  return items.length;
}

const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads-account', c, b);
const launchPost = b => call('POST', '/api/ops/email/launches', DIR, b), adsPost = b => call('POST', '/api/ops/ads', DIR, b);
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const count = async () => (await meta()).total, writes = async () => (await meta()).requests.filter(r => r.write);
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const KEYS = /mock-ads-token-for-the-settings-test|mock-ads-token-for-the-safety-test/;
const rb = cookie('rebecka@example.com');
const seen = [];
await fetch(`${META}/__reset`);

if (PHASE === 'a') {
  console.log('-- no Meta key');
  const r = await get('/api/ops/ads-account');
  ck('the API answers "not connected" in plain words and names the setting', r.status === 200 && r.j.status.state === 'not_connected' && /META_ADS_TOKEN/.test(r.j.status.message) && r.j.rows.length === 0 && r.j.totals === null, r.text.slice(0, 200));
  ck('Meta was asked nothing (and Refresh is the same)', (await post({ action: 'refresh' })).j.status.state === 'not_connected' && (await count()) === 0);
}

async function roles() {
  console.log('-- who may see it');
  for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn (Publisher)', 'carolyn@example.com', 403], ['Stephanie', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
    const c = email ? cookie(email) : DIR;
    if (want === 403) {
      const c0 = await count();
      ck(`${who}: the API answers 403 to a read and to Refresh, with no rows`, (await get('/api/ops/ads-account', c)).status === 403 && (await post({ action: 'refresh' }, c)).status === 403 && !/"rows"/.test((await get('/api/ops/ads-account', c)).text));
      const pg = await get('/ops/ads', c);
      ck(`${who}: the Ads page is not shown, and Meta was asked nothing`, (pg.status !== 200 || !/In your Meta account/.test(pg.text)) && (await count()) === c0);
    } else ck(`${who}: the API answers 200 and the Ads page opens`, (await get('/api/ops/ads-account', c)).status === 200 && (await get('/ops/ads', c)).status === 200);
  }
  ck('Rebecka still cannot open Business, Finance or Payroll', (await get('/ops/business', rb)).status !== 200 && (await get('/ops/business?view=finance', rb)).status !== 200 && (await get('/ops/business?view=payroll', rb)).status !== 200);
  ck('an unknown request is refused (a plain 400), and the answer is never written to', (await post({ action: 'nope' })).status === 400 && (await post({ action: 'nope' }, rb)).status === 400);
}

if (PHASE === 'c') {
  console.log('-- a campaign built in Ops and sent (the switch is on at the mock only)');
  await addCoursePage();
  const lid = await makeLaunch('Kali Winter 2027'); await writeEmails(lid);
  const made = await adsPost({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 });
  const cid = made.j.campaign.id, t0 = (await get(`/api/ops/ads?id=${cid}`)).j;
  for (const s of t0.copysets.filter(x => x.is_placeholder)) await adsPost({ action: 'editCopy', id: cid, copy_id: s.id, main_text: `Words for set ${s.position} about the seminar.`, headline: `Set ${s.position}` });
  const sent = await adsPost({ action: 'sendToMeta', id: cid, confirm: true });
  const metaId = (await get(`/api/ops/ads?id=${cid}`)).j.campaign.meta_campaign_id;
  ck('the campaign was sent to the mock (paused) and carries a Meta id', sent.status === 200 && /^mock_campaign_/.test(metaId), JSON.stringify(sent.j).slice(0, 200));
  await fetch(`${META}/__world?name=account`);
  const w0 = (await writes()).length; await fetch(`${META}/__log?reset=1`);
  const r = await get('/api/ops/ads-account'), mine = r.j.rows.filter(x => x.made_in_ops);
  ck('exactly the campaign built here is "Made in Ops", the other eleven are not', mine.length === 1 && mine[0].id === metaId && mine[0].ops_id === cid && r.j.rows.length === 12, JSON.stringify(mine.map(x => x.id)));
  ck('it is paused, with no spend yet, and no return (too little to say)', mine[0].status === 'paused' && mine[0].d30.spend_cents === 0 && mine[0].d30.ret === null);
  ck('the page itself wrote nothing to Meta (the writes were all before this look)', w0 > 0 && (await writes()).length === 0);
  seen.push(r.text);
  await roles();
}

if (PHASE === 'b') {
  console.log('-- what Meta is asked, and the memory');
  await fetch(`${META}/__world?name=account`); await fetch(`${META}/__log?reset=1`);
  const r1 = await get('/api/ops/ads-account');
  const log1 = (await meta()).requests;
  ck('the first look reads four things from Meta, all reads, the key only as a header', r1.status === 200 && log1.length === 4 && log1.every(x => x.method === 'GET' && !x.write && x.auth && !x.tokenInUrl), JSON.stringify(log1.map(x => x.path)));
  ck('all eleven campaigns are there, none Made in Ops (no Ads tables yet), state ok, with an "as of"', r1.j.rows.length === 11 && r1.j.rows.every(x => !x.made_in_ops) && r1.j.status.state === 'ok' && !!r1.j.status.as_of && r1.j.status.cached === false);
  ck('every row carries a link to Meta Ads Manager with the campaign, and no key', r1.j.rows.every(x => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=/.test(x.manager_url) && !KEYS.test(x.manager_url)));
  ck('totals equal the sum of the rows', r1.j.totals.d30.spend_cents === r1.j.rows.reduce((n, x) => n + x.d30.spend_cents, 0) && r1.j.totals.d7.spend_cents === r1.j.rows.reduce((n, x) => n + x.d7.spend_cents, 0));
  seen.push(r1.text);
  const r2 = await get('/api/ops/ads-account', rb);
  ck('the next look (another person) is served from memory: no request to Meta', r2.status === 200 && r2.j.status.cached === true && (await count()) === 4 && r2.j.rows.length === 11);
  const r3 = await get('/api/ops/ads-account?refresh=1');
  ck('a read with ?refresh=1 does not bypass the memory (only the Refresh button does)', r3.j.status.cached === true && (await count()) === 4);
  console.log('-- Refresh once a minute per person');
  const f1 = await post({ action: 'refresh' }, rb);
  ck('Rebecka presses Refresh: Meta is asked again (four reads)', f1.status === 200 && !f1.j.status.refresh_wait && f1.j.status.cached === false && (await count()) === 8, String(await count()));
  const f2 = await post({ action: 'refresh' }, rb);
  ck('she presses again at once: still the same page, told to wait up to a minute, nothing asked of Meta', f2.status === 200 && f2.j.status.refresh_wait > 0 && f2.j.status.refresh_wait <= 60 && f2.j.rows.length === 11 && (await count()) === 8);
  seen.push(f1.text, f2.text);
  await roles();
}

console.log('-- Meta saw only reads, and no secret anywhere');
const w = await writes();
ck('Meta\'s write log is empty for every request this page made', PHASE === 'c' ? w.length === 0 : w.length === 0, JSON.stringify(w.slice(0, 2)));
ck('the key and the ad account number are in no answer', !seen.some(s => KEYS.test(s) || /act_MOCK1/.test(s)));
const log = appLog();
ck('the key and the ad account number are in no line of the app\'s own log', !KEYS.test(log) && !/act_MOCK1/.test(log));
console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
