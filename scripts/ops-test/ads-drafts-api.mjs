// Ads PR 2 at API level (needs the app on :3100 started by ads-drafts.sh, `source env.sh`): node ads-drafts-api.mjs dry | live | nokey
//   dry  : the Meta key, ad account, pixel and Page set, THE SWITCH OFF (as in production today): who may use Ads, the ads switch on a launch makes a draft (5 ad sets,
//          25 ads, 5 copy sets each with a source, four crops per picture, rules), no personal data in what is sent for drafting, placeholders block Start, each check
//          blocks Start, dates follow the launch, switching type keeps the creative and rules, a video ad, Traffic has no rules, and "Send to Meta, paused" and
//          Start are dry runs that put NOTHING in the Meta mock's write log.
//   live : the switch ON at the mock only (META_ADS_LIVE=live): a full 5 × 5 is 1 campaign + 5 ad sets + 25 ads, each ad with four image sizes and 5 copy sets, an
//          Advantage+ is 1 + 1 + 5, Start turns on 31, a refusing Meta stops with a plain sentence, the token appears nowhere.
//   nokey: no drafting key: every copy set is a [placeholder] and the draft still works.
// Mock only: Meta on :4556, everything else on :4555. The real Meta and the real Anthropic are never contacted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MODE = process.argv[2] || 'dry', B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const mode = async q => (await fetch(`${META}/__mode?${q}`)).json();
const sheet = (range, values) => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent(range)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
const SECRET = 'mock-ads-token-for-the-settings-test';
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');

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

(async () => {
  await fetch(`${META}/__reset`);
  // ---------------- who may use Ads
  console.log('-- who may use Ads');
  for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn (Publisher)', 'carolyn@example.com', 403], ['Stephanie (Approver, Payroll)', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
    const c = email ? cookie(email) : DIR;
    ck(`${who}: Ads answers ${want}`, (await get('/api/ops/ads', c)).status === want);
    ck(`${who}: the Ads write door answers ${want === 200 ? 'a refusal for nothing to do, not 403' : 403}`, want === 200 ? (await post({ action: 'refresh', id: 'cmp_none' }, c)).status === 404 : (await post({ action: 'refresh', id: 'cmp_none' }, c)).status === 403);
  }

  if (MODE === 'nokey') {
    const lid = await makeLaunch('Kali Winter 2027'); await writeEmails(lid);
    const r = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 });
    const t = await tree(r.j.campaign.id);
    ck('[nokey] the draft is still made (5 ad sets, 5 ads, 25 ads)', t.adsets.length === 5 && t.creatives.length === 5 && t.ads.length === 25);
    ck('[nokey] without the drafting key every copy set is a [placeholder] with no invented words', t.copysets.length === 5 && t.copysets.every(s => s.is_placeholder && s.source_kind === 'placeholder' && /^\[/.test(s.main_text)));
    ck('[nokey] the page says why', (t.campaign.meta_settings.notes || []).join(' ').includes('drafting key'));
    ck('[nokey] nothing was sent to Anthropic', !/ANTHROPIC/.test(mockLog()));
    ck('[nokey] Start is blocked by the placeholders', (await get(`/api/ops/ads?id=${r.j.campaign.id}&checks=1`)).j.checks.canStart === false);
    console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
  }

  // ---------------- the switch
  console.log('-- the ads switch on a launch');
  await addCoursePage();
  const lid = await makeLaunch('Kali Winter 2027');   // its emails are still the planner’s “[FILL IN]” stubs: nothing to draft from yet
  ck('before anything is saved: no campaigns, and the launch’s ads choice is off', (await get('/api/ops/ads')).j.campaigns.length === 0 && (await get(`/api/ops/ads?launch=${lid}`)).j.campaign === null);
  ck('the starting dates come from the launch (doors open to doors close)', JSON.stringify((await get(`/api/ops/ads?launch=${lid}`)).j.dates) === JSON.stringify({ start_date: '2027-01-06', end_date: '2027-01-26' }));
  ck('turning the switch off for a launch with no campaign changes nothing', (await post({ action: 'saveSwitch', launch_id: lid, on: false })).j.campaign === null && (await get('/api/ops/ads')).j.campaigns.length === 0);
  const made = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 });
  ck('saving the switch makes a draft', made.status === 200 && made.j.campaign?.status === 'draft', JSON.stringify(made.j));
  const cid = made.j.campaign.id; let t = await tree(cid, '&checks=1');
  ck('a 5 × 5 draft has 5 ad sets, 5 pictures and 25 ads', t.adsets.length === 5 && t.creatives.length === 5 && t.ads.length === 25);
  ck('dates are the launch’s (6 to 26 Jan) and follow it', t.campaign.start_date === '2027-01-06' && t.campaign.end_date === '2027-01-26' && t.campaign.dates_follow_launch === true);
  ck('the ad link is the landing page with tags (source, medium, campaign)', /^http:\/\/localhost:4555\/site\/lp\/kali\?/.test(t.link) && /utm_source=meta/.test(t.link) && /utm_medium=paid_social/.test(t.link) && /utm_campaign=kali-winter-2027/.test(t.link));
  ck('every ad has all four sizes (9:16, 4:5, 1:1, 1.91:1) stored', t.creatives.every(x => ['9:16', '4:5', '1:1', '1.91:1'].every(k => /^data:image\/jpeg;base64,/.test(x.images[k] || ''))));
  ck('every picture says where it came from', t.creatives.every(x => /Image library/.test(x.source)));
  const kinds = t.copysets.map(s => s.source_kind);
  ck('with no launch emails written yet the copy comes from the course page and testimonials, and the gap is a [placeholder]', kinds.includes('landing_page') && kinds.includes('testimonial') && !kinds.includes('launch_email') && kinds.filter(k => k === 'placeholder').length === 1, kinds.join());
  ck('every copy set records its source, and real copy is never a placeholder', t.copysets.every(s => s.source_ref && (s.is_placeholder ? s.source_kind === 'placeholder' : s.source_kind !== 'placeholder' && s.source_text)));
  ck('the course page words were used (Kali, eight Wednesdays)', t.copysets.some(s => s.source_kind === 'landing_page' && /Kali|Eight Wednesdays/i.test(s.main_text)));
  const ai = mockLog().split('\n').filter(l => l.includes('ANTHROPIC'));
  ck('the drafting service was asked once, with the key', ai.length === 1 && /key-sent/.test(ai[0]) && /sources=4/.test(ai[0]), ai.join('|'));
  ck('each ad set is labelled Proven or New test and has an audience', t.adsets.every(a => ['Proven', 'New test'].includes(a.label) && a.targeting?.flexible_spec?.[0]?.interests?.length), JSON.stringify(t.adsets.map(a => a.label)));
  ck('there is a ranked list of other suggestions', (t.campaign.meta_settings.pool || []).length > 5);
  ck('rules are stored with the defaults (1.5×, 20% every 48 hours), off', t.rules?.metric === 'roas' && t.rules.raise_pct === 20 && t.rules.raise_every_hours === 48 && t.rules.raise_threshold === 1.5 && t.campaign.rules_on === false && t.campaign.rules_dry_run === true);
  ck('the draft appears in the campaigns list with its launch', (await get('/api/ops/ads')).j.campaigns.some(c => c.id === cid && c.launch_name === 'Kali Winter 2027' && c.status === 'draft'));
  ck('opening Ads, drafting and the list wrote nothing to Meta', (await writes()).length === 0);

  // ---------------- a copy set with no source is a placeholder that blocks Start
  console.log('-- no copy without a source');
  const ph = t.copysets.filter(s => s.is_placeholder);
  ck('a set with no source is a [placeholder] and the check says so', ph.length >= 1 && t.checks.items.find(i => i.key === 'copy').ok === false && /placeholder/.test(t.checks.items.find(i => i.key === 'copy').label));
  ck('Start is blocked while any check fails', t.checks.canStart === false);
  const s0 = await post({ action: 'start', id: cid, confirm: true });
  ck('pressing Start anyway is refused, with the reasons in plain words', s0.status === 409 && /placeholder/.test(s0.j.error), JSON.stringify(s0.j));
  const s1 = await post({ action: 'sendToMeta', id: cid, confirm: true });
  ck('Send to Meta is refused while words are missing', s1.status === 409 && /placeholder/.test(s1.j.error));
  ck('both refusals sent nothing to Meta', (await writes()).length === 0);
  ck('start needs the confirmation', (await post({ action: 'start', id: cid })).status === 400);
  // a person writes words into a placeholder: it has a source (the person); brackets put it back
  const first = ph[0];
  await post({ action: 'editCopy', id: cid, copy_id: first.id, main_text: 'Eight weeks to read Kṣemarāja with others who care.', headline: 'Read it together' });
  let t2 = await tree(cid); const w = t2.copysets.find(s => s.id === first.id);
  ck('real words written into a placeholder give it a source: the person', w.is_placeholder === false && w.source_kind === 'written' && /Written by Jacob/.test(w.source_ref), JSON.stringify(w));
  await post({ action: 'editCopy', id: cid, copy_id: first.id, main_text: 'Eight weeks [add the teacher’s name]', headline: 'Read it together' });
  ck('leaving [brackets] in it makes it a placeholder again', (await tree(cid)).copysets.find(s => s.id === first.id).is_placeholder === true);
  for (const s of (await tree(cid)).copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: cid, copy_id: s.id, main_text: `Words a person wrote for copy set ${s.position}, about the seminar.`, headline: `Set ${s.position}` });
  t = await tree(cid, '&checks=1');
  ck('with no placeholders left, every check passes and Start can be pressed', t.checks.canStart === true && t.checks.items.every(i => i.ok), JSON.stringify(t.checks.failing));

  // ---------------- as the launch fills in, Refresh draft drafts from its emails
  console.log('-- Refresh draft');
  await writeEmails(lid);
  const beforeRefresh = await tree(cid), written = beforeRefresh.copysets.filter(s => s.source_kind === 'written');
  await post({ action: 'refresh', id: cid, what: 'copy' });
  t = await tree(cid); const ai2 = mockLog().split('\n').filter(l => l.includes('ANTHROPIC')).pop();
  ck('Refresh draft drafts from the launch’s emails now they are written (the places a person has not written in)', t.copysets.filter(s => s.source_kind === 'launch_email').length >= 2 && t.copysets.every(s => s.source_ref), t.copysets.map(s => s.source_kind).join());
  ck('the drafted words come from the email (Kali, enrol)', t.copysets.some(s => s.source_kind === 'launch_email' && /goddess|Kali|enrol/i.test(s.main_text)));
  ck('what was sent for drafting had no email address, no link and no merge tag, though the email had all three', /sources=\d/.test(ai2) && /no-email/.test(ai2) && /no-link/.test(ai2) && /key-sent/.test(ai2), ai2);
  ck('the copy set a person wrote was kept, with its source (the person)', written.length === 1 && t.copysets.find(s => s.id === written[0].id).main_text === written[0].main_text && t.copysets.find(s => s.id === written[0].id).source_kind === 'written');
  ck('the dates, link and rules were not touched by refreshing the copy', t.campaign.start_date === '2027-01-06');

  // ---------------- each check blocks Start
  console.log('-- each check blocks Start');
  const failing = async () => (await tree(cid, '&checks=1')).checks;
  await mode('pixelAgeHours=30'); let c = await failing();
  ck('the pixel not firing in 24 hours blocks Start', !c.canStart && c.items.find(i => i.key === 'pixel').ok === false && (await post({ action: 'start', id: cid, confirm: true })).status === 409);
  await mode('pixelAgeHours=2&noPayment=1'); c = await failing();
  ck('no payment method on the ad account blocks Start', !c.canStart && c.items.find(i => i.key === 'payment').ok === false);
  await mode('noPayment=0');
  await post({ action: 'update', id: cid, changes: { landing_url: 'http://localhost:4555/site/lp/old-retreat' } }); c = await failing();
  ck('a landing page that isn’t live blocks Start (but not Send: Meta can still take the ads)', !c.canStart && c.items.find(i => i.key === 'landing').ok === false && c.canSend === true);
  await post({ action: 'update', id: cid, changes: { landing_url: 'http://localhost:4555/site/lp/kali' } });
  const cr5 = (await tree(cid)).creatives[4];
  await post({ action: 'editCreative', id: cid, creative_id: cr5.id, kind: 'video' }); c = await failing();
  ck('an ad with a missing size (a video with no files) blocks Start', !c.canStart && c.items.find(i => i.key === 'sizes').ok === false && /Ad 5/.test(c.items.find(i => i.key === 'sizes').label));
  await post({ action: 'editCreative', id: cid, creative_id: cr5.id, images: { '9:16': 'https://example.com/clip-9x16.mp4', '4:5': 'https://example.com/clip-4x5.mp4' } });
  c = await failing(); const v = (await tree(cid)).creatives[4];
  ck('a video ad needs only two sizes: 9:16 and 4:5 (Jake’s decision)', v.kind === 'video' && c.items.find(i => i.key === 'sizes').ok === true && c.canStart === true);
  ck('a video link must be https', (await post({ action: 'editCreative', id: cid, creative_id: cr5.id, images: { '9:16': 'ftp://x' } })).status === 400);
  await post({ action: 'editCreative', id: cid, creative_id: cr5.id, kind: 'image' });
  ck('an image ad made from a video has no sizes until a picture is chosen', (await failing()).items.find(i => i.key === 'sizes').ok === false);
  const art = (await tree(cid, '&art=1')).art;
  ck('the library offers art (no words, reuse OK) to choose from', art.length > 20 && art.every(a => a.id && a.name));
  const pick = await post({ action: 'chooseArt', id: cid, creative_id: cr5.id, image_id: art[6].id });
  ck('choosing a library picture cuts it to four sizes', pick.status === 200 && Object.keys((await tree(cid)).creatives[4].images).length === 4);
  const png = fs.readFileSync(path.join(here, 'out/upload-test.png')).toString('base64');
  const up = await post({ action: 'chooseArt', id: cid, creative_id: (await tree(cid)).creatives[3].id, data: png });
  const upc = (await tree(cid)).creatives[3];
  ck('an uploaded picture is cut to four sizes and credited to the person', up.status === 200 && Object.keys(upc.images).length === 4 && /Uploaded by Jacob/.test(upc.source), JSON.stringify(up.j));
  ck('a text file is refused as a picture', (await post({ action: 'chooseArt', id: cid, creative_id: cr5.id, data: Buffer.from('hello').toString('base64') })).status === 400);
  ck('every check passes again', (await failing()).canStart === true);
  const real = async () => { const m = await sharpInfo(upc.images); return m; };
  const sharpInfo = async imgs => { const { default: sharp } = await import('sharp'); const out = {}; for (const [k, u] of Object.entries(imgs)) { const m = await sharp(Buffer.from(u.split(',')[1], 'base64')).metadata(); out[k] = `${m.width}x${m.height}`; } return out; };
  const dims = await real(); ck('the four crops really are 9:16, 4:5, 1:1 and 1.91:1', ['9:16:1080x1920', '4:5:1080x1350', '1:1:1080x1080', '1.91:1:1200x628'].every(x => Object.entries(dims).some(([k, v]) => `${k}:${v}` === x)), JSON.stringify(await real()));

  // ---------------- edits: audiences, budget, rules
  console.log('-- the four steps save');
  t = await tree(cid); const pool = t.campaign.meta_settings.pool, used = new Set(t.adsets.map(a => a.audience_name)), other = pool.find(p => !used.has(p.name));
  ck('there is a suggestion to swap in', !!other);
  const target = t.adsets[2];
  await post({ action: 'swapAudience', id: cid, adset_id: target.id, key: other.key });
  t = await tree(cid); ck('swapping an audience replaces that ad set’s audience and keeps the label', t.adsets[2].audience_name === other.name && t.adsets[2].label === other.label);
  ck('a swap that isn’t on the list is refused', (await post({ action: 'swapAudience', id: cid, adset_id: target.id, key: 'int:nope' })).status === 400);
  await post({ action: 'editAdset', id: cid, adset_id: t.adsets[0].id, changes: { age_min: 30, age_max: 60, daily_budget_cents: 3000 } });
  ck('ages and an ad set’s budget save', (await tree(cid)).adsets[0].targeting.age_min === 30 && (await tree(cid)).adsets[0].daily_budget_cents === 3000);
  ck('youngest above oldest is refused', (await post({ action: 'editAdset', id: cid, adset_id: t.adsets[0].id, changes: { age_min: 60, age_max: 30 } })).status === 400);
  await post({ action: 'refresh', id: cid, what: 'audiences' });
  t = await tree(cid);
  ck('Refresh draft keeps what a person edited (the swapped audience, the ages)', t.adsets[2].audience_name === other.name && t.adsets[0].targeting.age_min === 30);
  const before = t.copysets.map(s => s.main_text);
  await post({ action: 'refresh', id: cid, what: 'copy' });
  ck('Refresh draft keeps the words a person wrote', (await tree(cid)).copysets.map(s => s.main_text).filter(x => /Words a person wrote|Eight weeks/.test(x)).length === before.filter(x => /Words a person wrote|Eight weeks/.test(x)).length);
  await post({ action: 'update', id: cid, changes: { budget_mode: 'campaign', daily_budget_cents: 8000, spend_cap_cents: 200000, meta_settings: { campaign_name: '2027-01 · Kali Winter', placements: 'feeds_stories' } } });
  t = await tree(cid);
  ck('campaign budget, lifetime cap, name and placements save', t.campaign.budget_mode === 'campaign' && t.campaign.daily_budget_cents === 8000 && t.campaign.spend_cap_cents === 200000 && t.campaign.meta_settings.campaign_name === '2027-01 · Kali Winter' && t.campaign.meta_settings.placements === 'feeds_stories' && t.total_cents === 8000);
  await post({ action: 'update', id: cid, changes: { budget_mode: 'per_adset' } });
  const rl = await post({ action: 'saveRules', id: cid, rules: { raise_pct: 25, raise_every_hours: 72, raise_threshold: 1.8, ceiling_cents: 7000, off_threshold: 1.1, off_min_spend_cents: 5000, pause_weakest_after_days: 7 }, rules_on: true });
  t = await tree(cid);
  ck('the automatic rules are stored (X%, every N hours, Y, ceiling, Z, minimum spend, pause weakest) and the switch', rl.status === 200 && t.rules.raise_pct === 25 && t.rules.raise_every_hours === 72 && t.rules.raise_threshold === 1.8 && t.rules.ceiling_cents === 7000 && t.rules.off_threshold === 1.1 && t.rules.off_min_spend_cents === 5000 && t.rules.pause_weakest_after_days === 7 && t.campaign.rules_on === true);
  ck('the rules only say what they would do for now (a dry run beside the Ad Agent), and nothing was sent to Meta', t.campaign.rules_dry_run === true && (await writes()).length === 0);
  ck('a rule with a silly number is refused', (await post({ action: 'saveRules', id: cid, rules: { raise_pct: 0 } })).status === 400 && (await post({ action: 'saveRules', id: cid, rules: { raise_every_hours: 2 } })).status === 400);
  ck('a bad date, a bad link and a bad budget are refused', (await post({ action: 'update', id: cid, changes: { start_date: 'soon' } })).status === 400 && (await post({ action: 'update', id: cid, changes: { landing_url: 'javascript:alert(1)' } })).status === 400 && (await post({ action: 'update', id: cid, changes: { daily_budget_cents: -5 } })).status === 400);

  // ---------------- dates follow the launch
  console.log('-- dates follow the launch');
  const rows = (await (await fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Launches'!A1:O20")}`)).json()).values;
  const li = rows.findIndex(r => r[0] === lid) + 1, di = rows[0].indexOf('dates_json');
  await sheet(`'Launches'!${String.fromCharCode(65 + di)}${li}`, [[JSON.stringify({ open: '2027-02-03', close: '2027-02-23', term: '2027-02-24' })]]);
  t = await tree(cid);
  ck('moving the launch’s key dates moves the campaign’s dates', t.campaign.start_date === '2027-02-03' && t.campaign.end_date === '2027-02-23', `${t.campaign.start_date} ${t.campaign.end_date}`);
  await post({ action: 'update', id: cid, changes: { start_date: '2027-02-10' } });
  await sheet(`'Launches'!${String.fromCharCode(65 + di)}${li}`, [[JSON.stringify({ open: '2027-03-03', close: '2027-03-23' })]]);
  t = await tree(cid);
  ck('a date a person set by hand stays put (until they ask to follow the launch again)', t.campaign.start_date === '2027-02-10' && t.campaign.dates_follow_launch === false);
  await post({ action: 'update', id: cid, changes: { dates_follow_launch: true } });
  ck('“Follow the launch’s dates” brings them back', (await tree(cid)).campaign.start_date === '2027-03-03');

  // ---------------- switching type keeps everything but the audiences
  console.log('-- 5 × 5 and Advantage+');
  t = await tree(cid); const keep = { cr: JSON.stringify(t.creatives), cp: JSON.stringify(t.copysets), ru: JSON.stringify(t.rules), tot: t.total_cents };
  await post({ action: 'setStructure', id: cid, structure: 'advantage' });
  let a = await tree(cid);
  ck('Advantage+ is 1 ad set with the same 5 ads', a.campaign.structure === 'advantage' && a.adsets.length === 1 && a.ads.length === 5 && a.adsets[0].audience_name === 'Advantage+ audience');
  ck('switching kept the pictures, the words and the rules exactly', JSON.stringify(a.creatives) === keep.cr && JSON.stringify(a.copysets) === keep.cp && JSON.stringify(a.rules) === keep.ru);
  ck('Advantage+ starts from the old audiences’ interests', a.adsets[0].targeting.flexible_spec?.[0]?.interests?.length >= 2);
  ck('the daily total is unchanged', a.total_cents === keep.tot || a.adsets[0].daily_budget_cents === keep.tot, `${a.total_cents} ${keep.tot}`);
  await post({ action: 'setStructure', id: cid, structure: 'test' });
  a = await tree(cid);
  ck('switching back gives 5 ad sets and 25 ads, the same creative, copy and rules, and the audiences from before', a.adsets.length === 5 && a.ads.length === 25 && JSON.stringify(a.creatives) === keep.cr && JSON.stringify(a.copysets) === keep.cp && JSON.stringify(a.rules) === keep.ru && a.adsets[2].audience_name === other.name);
  await post({ action: 'update', id: cid, changes: { budget_mode: 'campaign', daily_budget_cents: 10000 } });   // the rest of the flow builds on a campaign budget of $100

  if (MODE === 'dry') {
    console.log('-- the gate is closed: Send to Meta and Start are dry runs');
    await fetch(`${META}/__log?reset=1`);
    const send = await post({ action: 'sendToMeta', id: cid, confirm: true });
    ck('Send to Meta, paused says “Dry run — nothing was sent to Meta”', send.status === 200 && send.j.dryRun === true && send.j.message === 'Dry run — nothing was sent to Meta', JSON.stringify(send.j));
    ck('and shows what would have been sent (1 campaign, 5 ad sets, 25 ads, 20 image sizes, 5 copy sets)', send.j.would.adsets === 5 && send.j.would.ads === 25 && send.j.would.images === 20 && send.j.would.copy_sets === 5 && /utm_source=meta/.test(send.j.would.link) && send.j.would.audiences.length === 5);
    ck('the Meta mock’s log has NO writes', (await writes()).length === 0, JSON.stringify((await writes()).map(w => w.path)));
    ck('nothing exists in Meta', JSON.stringify(await (await fetch(`${META}/__state`)).json()).match(/"(campaigns|adsets|adcreatives|ads|adimages)":\[\]/g)?.length === 5);
    const st = await post({ action: 'start', id: cid, confirm: true });
    ck('Start is a dry run too, with the same words', st.status === 200 && st.j.dryRun === true && st.j.message === 'Dry run — nothing was sent to Meta');
    ck('still no writes in Meta, and the campaign is still a draft', (await writes()).length === 0 && (await tree(cid)).campaign.status === 'draft');
    ck('the app’s log says each Meta write was a dry run', fs.readFileSync(path.join(here, 'out/next.log'), 'utf8').includes('[meta-ads] dry run:'));
    // Traffic: no rules
    const l3 = await makeLaunch('Open Library Cyber Week'); const tr = await post({ action: 'saveSwitch', launch_id: l3, on: true, goal: 'Traffic', structure: 'advantage', daily_cents: 5000 });
    const tt = await tree(tr.j.campaign.id);
    ck('a Traffic campaign gets no automatic rules', tt.rules === null && (await post({ action: 'saveRules', id: tt.campaign.id, rules: { raise_pct: 10 } })).status === 400);
    ck('an Advantage+ draft made from the switch has 1 ad set and 5 ads at the starting $50', tt.adsets.length === 1 && tt.ads.length === 5 && tt.campaign.daily_budget_cents === 5000);
    await post({ action: 'update', id: tt.campaign.id, changes: { goal: 'Lead' } });
    const lead = await tree(tt.campaign.id);
    ck('changing the goal to Lead makes cost-per-lead rules ($1.50 raise, $2.50 off)', lead.rules?.metric === 'cpl' && lead.rules.raise_threshold === 1.5 && lead.rules.off_threshold === 2.5);
    await post({ action: 'update', id: tt.campaign.id, changes: { goal: 'Purchase' } });
    ck('and back to Purchase makes them return rules again', (await tree(tt.campaign.id)).rules?.metric === 'roas');
    ck('the switch can be turned off while it is still a draft (the draft goes)', (await post({ action: 'saveSwitch', launch_id: l3, on: false })).status === 200 && (await get('/api/ops/ads')).j.campaigns.length === 2 - 1);
  }

  if (MODE === 'live') {
    console.log('-- the gate is open (test only, at the mock): a full 5 × 5 is built paused');
    await post({ action: 'update', id: cid, changes: { budget_mode: 'per_adset' } });
    await fetch(`${META}/__log?reset=1`);
    const send = await post({ action: 'sendToMeta', id: cid, confirm: true });
    ck('Send to Meta, paused works', send.status === 200 && send.j.dryRun === false && /Sent to Meta, paused/.test(send.j.message), JSON.stringify(send.j));
    const st = await (await fetch(`${META}/__state`)).json(), log = (await meta()).requests;
    ck('1 campaign + 5 ad sets + 5 creatives + 25 ads + 20 pictures (4 sizes × 5)', st.campaigns.length === 1 && st.adsets.length === 5 && st.adcreatives.length === 5 && st.ads.length === 25 && st.adimages.length === 20, JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, x]) => [k, Array.isArray(x) ? x.length : x]))));
    ck('everything was made PAUSED', st.campaigns.every(x => x.status === 'PAUSED') && st.adsets.every(x => x.status === 'PAUSED') && st.ads.every(x => x.status === 'PAUSED'));
    ck('each ad’s creative has the four image sizes and the five copy sets (five texts, five headlines)', st.adcreatives.every(x => x.asset_feed_spec.images.length === 4 && x.asset_feed_spec.bodies.length === 5 && x.asset_feed_spec.titles.length === 5 && x.asset_feed_spec.link_urls[0].website_url.includes('utm_source=meta')));
    ck('the four sizes have different pictures uploaded (labels 9:16, 4:5, 1:1, 1.91:1)', st.adcreatives.every(x => ['9:16', '4:5', '1:1', '1.91:1'].every(r => x.asset_feed_spec.images.some(i => i.adlabels?.[0]?.name === r))));
    ck('ad sets carry their own budgets and the campaign’s dates and cap', st.adsets.every(x => x.daily_budget && x.start_time && x.end_time) && st.campaigns[0].spend_cap === '200000');
    ck('each ad set has its audience (interests) and the placements chosen', st.adsets.every(x => x.targeting.flexible_spec?.[0]?.interests?.length && x.targeting.publisher_platforms?.length));
    ck('the ad set the person edited (ages 30–60) went as edited; budgets were spread evenly again when the type was switched back (the $110 total over five: $22 each)', st.adsets[0].targeting.age_min === 30 && st.adsets[0].targeting.age_max === 60 && st.adsets.every(x => x.daily_budget === '2200'), JSON.stringify(st.adsets.map(x => x.daily_budget)));
    ck('the token went in the header, never in an address or body', log.every(r => r.auth && !r.tokenInUrl));
    const t5 = await tree(cid);
    ck('the campaign is now Sent to Meta · paused, with Meta’s ids kept', t5.campaign.status === 'sent_paused' && !!t5.campaign.meta_campaign_id && t5.adsets.every(x => x.meta_adset_id) && t5.ads.every(x => x.meta_ad_id) && t5.creatives.every(x => x.meta_creative_id));
    ck('sending it twice is refused', (await post({ action: 'sendToMeta', id: cid, confirm: true })).status === 409);
    ck('a campaign in Meta can’t be edited here, or switched off from the launch', (await post({ action: 'editCopy', id: cid, copy_id: t5.copysets[0].id, main_text: 'x', headline: 'y' })).status === 409 && (await post({ action: 'saveSwitch', launch_id: lid, on: false })).status === 409 && (await post({ action: 'setStructure', id: cid, structure: 'advantage' })).status === 409);
    ck('the list shows it as sent to Meta, paused', (await get('/api/ops/ads')).j.campaigns.find(x => x.id === cid).status === 'sent_paused');
    await fetch(`${META}/__log?reset=1`);
    await mode('pixelAgeHours=30');
    ck('Start is refused while the pixel check fails, and sends nothing', (await post({ action: 'start', id: cid, confirm: true })).status === 409 && (await writes()).length === 0);
    await mode('pixelAgeHours=2');
    const go = await post({ action: 'start', id: cid, confirm: true });
    const on = (await writes()).filter(w => w.body?.status === 'ACTIVE');
    ck('Start turns on the campaign, its 5 ad sets and its 25 ads (31) and the campaign is Running', go.status === 200 && go.j.dryRun === false && on.length === 31 && (await tree(cid)).campaign.status === 'live', `${go.status} ${on.length}`);
    // Advantage+ in full
    const l2 = await makeLaunch('Meditation Resolution 2027', { event_id: '', dates: { event: '2027-01-01' }, playbook_id: 'PB-countdown' }); await writeEmails(l2);
    const adv = await post({ action: 'saveSwitch', launch_id: l2, on: true, goal: 'Lead', structure: 'advantage', daily_cents: 6000 });
    const at = await tree(adv.j.campaign.id);
    for (const s of at.copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: at.campaign.id, copy_id: s.id, main_text: `Words for set ${s.position} about the resolution.`, headline: `Set ${s.position}` });
    ck('the countdown launch’s dates: two weeks before the day, to the day', at.campaign.start_date === '2026-12-18' && at.campaign.end_date === '2027-01-01');
    await fetch(`${META}/__log?reset=1`);
    const as = await post({ action: 'sendToMeta', id: at.campaign.id, confirm: true }), s2 = await (await fetch(`${META}/__state`)).json();
    ck('Advantage+ is built as 1 more campaign, 1 ad set and 5 ads, with Meta’s own audience on', as.status === 200 && s2.campaigns.length === 2 && s2.adsets.length === 6 && s2.ads.length === 30 && s2.adsets[5].targeting.targeting_automation?.advantage_audience === 1, JSON.stringify(as.j));
    ck('its campaign budget is the campaign’s, not the ad set’s', s2.campaigns[1].daily_budget === '6000' && !s2.adsets[5].daily_budget);
    // a refusing Meta
    const l4 = await makeLaunch('Spring Festival'); await writeEmails(l4);
    const rj = await post({ action: 'saveSwitch', launch_id: l4, on: true, goal: 'Lead', structure: 'advantage', daily_cents: 5000 }), rt = await tree(rj.j.campaign.id);
    for (const s of rt.copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: rt.campaign.id, copy_id: s.id, main_text: `Words for set ${s.position}.`, headline: `Set ${s.position}` });
    await mode('rejectWrites=1');
    const rf = await post({ action: 'sendToMeta', id: rt.campaign.id, confirm: true });
    ck('a refusing Meta stops with a plain sentence, and the campaign is not marked sent', rf.status === 409 && /Meta/.test(rf.j.error) && (await tree(rt.campaign.id)).campaign.status === 'draft', JSON.stringify(rf.j));
    await mode('rejectWrites=0');
    // a video ad can’t go to Meta from here yet
    const vc = (await tree(rt.campaign.id)).creatives[0];
    await post({ action: 'editCreative', id: rt.campaign.id, creative_id: vc.id, kind: 'video' }); await post({ action: 'editCreative', id: rt.campaign.id, creative_id: vc.id, images: { '9:16': 'https://example.com/a.mp4', '4:5': 'https://example.com/b.mp4' } });
    const vs = await post({ action: 'sendToMeta', id: rt.campaign.id, confirm: true });
    ck('a video ad is not sent from here yet (it says so, and sends nothing)', vs.status === 409 && /Video/.test(vs.j.error));
  }

  // ---------------- the token is nowhere
  const all = JSON.stringify([(await get('/api/ops/ads')).j, await meta(), fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'), mockLog()]);
  ck('the Meta token appears in no response, no log and no mock request', !all.includes(SECRET) && !all.includes('mock-anthropic-key-not-real'));
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
