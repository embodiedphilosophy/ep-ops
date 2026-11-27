// Ads PR 4 at API level (needs the app on :3100 started by ads-library.sh: the Meta key set and the safety switch ON at the Meta mock only, the jobs live). `source env.sh`, then:
//   node ads-library-api.mjs a   the Practice Report NOT connected (REPORT_DATABASE_URL unset, as today)
//   node ads-library-api.mjs b   the Practice Report connected to the synthetic quiz in an in-process Postgres (REPORT_TEST_DB=pglite; made-up people with names and emails)
// a: who may see the library (director and Rebecka yes; Floss, Irene, Ichha, Carolyn, Stephanie, a teacher no, and the API says 403; Rebecka still not Business / Finance / Payroll;
//    Settings thresholds directors only); an empty library with no tables ("No campaigns yet." from the cron, no table made); three campaigns built, sent and started through the app
//    (the first draws its audiences from Meta's interest search; the next two from the library), "Use in a campaign" swaps an audience into a draft's ad set (and refuses a Retired
//    one without the warning, an Advantage+ draft, a campaign already in Meta); the daily job (401 without the key, ?dry=1 records nothing, idempotent) works the standings out:
//    Proven, Promising, Retired; Bring back is recorded; thresholds changed in Settings change the outcome and are logged; tags edited; PR 2's suggestions put Proven first and never
//    suggest a Retired one; the Practice Report says "not connected" and nothing breaks; Meta saw no write from the library.
// b: archetype overlap from the UTM-matched anonymous counts, the ideas with their counts, and NO personal value (name, email) in any answer, log or the Meta mock's log.
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
const call = async (method, url, ck_ = DIR, body, headers = {}) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const get = (u, c) => call('GET', u, c), post = (b, c) => call('POST', '/api/ops/ads', c, b), lib = (b, c) => call('POST', '/api/ops/ads-library', c, b), launchPost = b => call('POST', '/api/ops/email/launches', DIR, b);
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cronGet = (u, headers = CRON) => fetch(B + u, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const setMake = m => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Ad Agent'!B1")}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[m]] }) });
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const PERSON = /Synthetic Person|synthetic\.person|example\.invalid/;

const addCoursePage = () => fetch(`${MOCK}/v4/spreadsheets/mock-sheet/values/${encodeURIComponent("'Course Pages'!A1")}:append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [['E034', 'kali-winter', 'SS', '', 'Kali: the dark mother', 'Winter 2027', 'Eight Wednesdays reading the Kali tradition with practice and live sessions every week.', 'Weekly live seminar. Recordings of every session. A reading guide.', 'Students of yoga and Indian philosophy', 'published', '']] }) });
async function makeLaunch(name) {
  const r = await launchPost({ action: 'create', confirm: true, name, kind: 'Enrollment', event_id: 'E034', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' },
    landing_url: 'http://localhost:4555/site/lp/kali', audience: { include: [], exclude: [] }, make_drafts: false,
    steps: [['Doors open', '2027-01-06'], ['One week left', '2027-01-19'], ['Last day', '2027-01-26']].map(([step, date]) => ({ type: 'email', step, date, time: '09:00' })) });
  if (!r.j.id) console.log('launch create failed', r.status, JSON.stringify(r.j)); return r.j.id;
}
async function writeEmails(lid) {
  const items = (await get(`/api/ops/email/launches?id=${lid}`)).j.items.filter(i => i.lane === 'email').sort((a, b) => a.date.localeCompare(b.date));
  const texts = ['Eight Wednesdays with the goddess who wears time as a garland. Winter Term begins 27 January.', 'One week left to join the Kali seminar. Study the tradition with Tova Olsson and Nataraj, with practice and live sessions every week.', 'The last day to enrol is 26 January. Doors close at midnight and the seminar begins the next morning.'];
  for (const [i, it] of items.entries()) await call('POST', '/api/ops/email/plan', DIR, { action: 'save', id: it.key, changes: { blocks: [{ type: 'text', text: texts[i] }] } });
}
const tree = async (id, q = '') => (await get(`/api/ops/ads?id=${id}${q}`)).j;
const draftOf = async name => { const lid = await makeLaunch(name); await writeEmails(lid); const made = await post({ action: 'saveSwitch', launch_id: lid, on: true, goal: 'Purchase', structure: 'test', daily_cents: 10000 }); return made.j.campaign.id; };
async function sendAndStart(cid) {
  const t = await tree(cid);
  for (const s of t.copysets.filter(x => x.is_placeholder)) await post({ action: 'editCopy', id: cid, copy_id: s.id, main_text: `Words for set ${s.position} about the seminar.`, headline: `Set ${s.position}` });
  const sent = await post({ action: 'sendToMeta', id: cid, confirm: true }), go = await post({ action: 'start', id: cid, confirm: true });
  return sent.status === 200 && go.status === 200;
}
const names = async cid => (await tree(cid)).adsets.map(a => a.audience_name);
const library = async () => (await get('/api/ops/ads-library')).j;
const byName = async () => Object.fromEntries((await library()).rows.map(r => [r.name, r]));
// put the audience called `name` into ad set `pos` of a draft, moving whoever sat there into its old place (so no audience is in two ad sets)
async function place(cid, name, pos) {
  const t = await tree(cid), at = t.adsets.find(a => a.position === pos), from = t.adsets.find(a => a.audience_name === name), L = (await library()).rows, id = n => L.find(r => r.name === n)?.id;
  if (from && from.id === at.id) return true;
  const a = await lib({ action: 'useInCampaign', id: id(name), campaign_id: cid, adset_id: at.id, confirm_retired: true });
  if (from) await lib({ action: 'useInCampaign', id: id(at.audience_name), campaign_id: cid, adset_id: from.id, confirm_retired: true });
  return a.status === 200;
}

(async () => {
  await fetch(`${META}/__reset`); await setMake('AUTO'); await addCoursePage();

  if (PHASE === 'a') {
    console.log('-- who sees the Audience library');
    for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ['Floss', 'floss@example.com', 403], ['Irene', 'irene@example.com', 403], ['Ichha', 'ichha@example.com', 403], ['Carolyn (Publisher)', 'carolyn@example.com', 403], ['Stephanie', 'stephanie@example.com', 403], ['a teacher', 'abha@example.com', 403]]) {
      const c = email ? cookie(email) : DIR;
      ck(`${who}: the library API answers ${want}`, (await get('/api/ops/ads-library', c)).status === want);
      ck(`${who}: its write door answers ${want === 200 ? 'a plain refusal (nothing there yet), not 403' : 403}`, want === 200 ? (await lib({ action: 'setTags', id: 'aud_none', tags: ['x'] }, c)).status === 404 : (await lib({ action: 'setTags', id: 'aud_none', tags: ['x'] }, c)).status === 403);
      const pg = await call('GET', '/ops/ads?view=library', c);
      ck(`${who}: the Audience library tab ${want === 200 ? 'opens' : 'is not shown'}`, want === 200 ? pg.status === 200 && /Audience library/.test(pg.text) : pg.status !== 200);
      ck(`${who}: the thresholds ${email === null ? 'are readable (directors only)' : 'are refused (directors only)'}`, (await get('/api/ops/ads-library?settings=1', c)).status === (email === null ? 200 : 403));
    }
    const rb = cookie('rebecka@example.com');
    ck('Rebecka cannot save the thresholds, and still cannot open Business, Finance or Payroll', (await lib({ action: 'saveThresholds', values: { min_days: 1 } }, rb)).status === 403 && (await call('GET', '/ops/business', rb)).status !== 200 && (await call('GET', '/ops/business?view=finance', rb)).status !== 200 && (await call('GET', '/ops/business?view=payroll', rb)).status !== 200);
    ck('Rebecka is not shown the Settings section for the thresholds, the director is', !/Ads audience library/.test((await call('GET', '/ops/settings?view=connections&s=ads-library', rb)).text) && /Ads audience library/.test((await call('GET', '/ops/settings?view=connections&s=ads-library', DIR)).text));
    ck('the Ads tabs: Campaigns and Audience library, for the director', /Audience library/.test((await call('GET', '/ops/ads', DIR)).text) && /Campaigns/.test((await call('GET', '/ops/ads', DIR)).text));

    console.log('-- nothing yet: no tables, the Practice Report not connected');
    let l = await library();
    ck('the library is empty and says so, without making any table', l.exists === false && l.rows.length === 0 && l.thresholds.proven_after === 2 && l.thresholds.min_days === 3, JSON.stringify(l).slice(0, 200));
    ck('the Practice Report says it isn’t connected and what to do (REPORT_DATABASE_URL), and there are no ideas', l.report.connected === false && /isn’t connected yet/.test(l.report.reason) && /REPORT_DATABASE_URL/.test(l.report.todo) && l.ideas === null);
    ck('without the key the library cron is refused (401), with a wrong key too', (await cronGet('/api/ops/ads-audiences', {})).status === 401 && (await cronGet('/api/ops/ads-audiences?key=wrong', {})).status === 401);
    const none = await cronGet('/api/ops/ads-audiences'), nonePrev = await cronGet('/api/ops/ads-audiences?dry=1');
    ck('with no campaigns the cron says “No campaigns yet.” (live and as a preview) and still no table exists', none.status === 200 && none.j.note === 'No campaigns yet.' && nonePrev.j.note === 'No campaigns yet.' && nonePrev.j.preview === true && (await library()).exists === false, JSON.stringify(none.j));
    ck('the thresholds can be read before anything exists', (await get('/api/ops/ads-library?settings=1')).j.values.retire_after === 3);

    console.log('-- three campaigns through the app; the first draws from Meta’s interest search');
    const c1 = await draftOf('Kali Winter 2027'), n1 = await names(c1);
    ck('the first draft’s audiences are Meta interests, all “New test”', n1.length === 5 && n1.every(n => /^Interests · /.test(n)) && (await tree(c1)).adsets.every(a => a.label === 'New test'), n1.join(' | '));
    ck('it is sent and started (paused at first, then on at the mock)', await sendAndStart(c1));
    await cronGet('/api/ops/ads-sync');
    const pv = await cronGet('/api/ops/ads-audiences?dry=1');
    ck('?dry=1 shows the five new audiences it would add and records nothing', pv.j.preview === true && pv.j.audiences.created === 5 && (await library()).rows.length === 0, JSON.stringify(pv.j));
    const j1 = await cronGet('/api/ops/ads-audiences');
    l = await library();
    ck('the cron adds one library row for each audience the campaign used, with its exact Meta settings', j1.j.audiences.created === 5 && l.rows.length === 5 && l.exists, JSON.stringify(j1.j));
    const detail0 = (await get(`/api/ops/ads-library?id=${l.rows[0].id}`)).j;
    ck('a row keeps the exact Meta settings (the interest and the ages)', detail0.settings.flexible_spec[0].interests[0].id && detail0.settings.age_min === 25 && !('_detail' in detail0.settings));
    ck('after one campaign: the two best are Promising, the rest Not tested (none retired yet)', l.rows.filter(r => r.standing === 'Promising').length === 2 && l.rows.filter(r => r.standing === 'Not tested').length === 3 && l.rows.every(r => r.tags.includes('kali')), JSON.stringify(l.rows.map(r => [r.name, r.standing, r.tags])));
    const best = n1[0], second = n1[1], worst = n1[4], fourth = n1[3];
    const L1 = await byName();
    ck('ad set 1 (2.4×) and ad set 2 (1.8×) are the Promising ones; the 0.4× audience has a strike', L1[best].standing === 'Promising' && L1[second].standing === 'Promising' && L1[worst].strikes === 1 && L1[fourth].strikes === 1 && L1[best].best === '2.4× return', JSON.stringify(L1[best]));
    const again = await cronGet('/api/ops/ads-audiences');
    ck('the cron again changes nothing (idempotent)', again.j.audiences.created === 0 && again.j.audiences.changed === 0 && again.j.results.written === 0);
    const sync1 = JSON.stringify((await library()).rows);

    console.log('-- the next draft suggests from the library first (Proven → Promising → Not tested)');
    const c2 = await draftOf('Kali Winter 2027 B'), n2 = await names(c2), t2 = await tree(c2);
    ck('the draft’s five ad sets are all library audiences now (the two Promising ones first), none a fresh Meta interest', n2.length === 5 && new Set(n2).size === 5 && n2.slice(0, 2).sort().join() === [best, second].sort().join() && n2.every(n => n1.includes(n)), n2.join(' | '));
    const pool = t2.campaign.meta_settings.pool;
    ck('and the list to swap from has the library ones before any “New test” interest', pool.findLastIndex(p => p.key.startsWith('lib:')) < pool.findIndex(p => p.key.startsWith('int:')) && pool.slice(0, 5).every(p => p.key.startsWith('lib:')));

    console.log('-- “Use in a campaign”');
    const wBefore = (await writes()).length, pick = await get('/api/ops/ads-library?drafts=1'), drafts = pick.j.drafts;
    ck('the picker lists the current drafts (mine first) with their five ad sets', drafts.length === 1 && drafts[0].id === c2 && drafts[0].slots.length === 5 && drafts[0].mine === true, JSON.stringify(drafts));
    ck('a swap puts the 0.4× audience into ad set 4 (the one it displaced goes to its old place, so nobody is in two ad sets)', await place(c2, worst, 4) && (await names(c2))[3] === worst && (await names(c2))[4] === fourth && new Set(await names(c2)).size === 5, (await names(c2)).join(' | '));
    ck('the ad set carries the library audience’s exact settings and is marked an edit', (await tree(c2)).adsets[3].targeting.flexible_spec?.[0]?.interests?.length === 1 && (await tree(c2)).campaign.meta_settings._edited.adsets.includes(4) && (await tree(c2)).campaign.meta_settings._edited.adsets.includes(5));
    const adv = await draftOf('Advantage draft'); await post({ action: 'setStructure', id: adv, structure: 'advantage' });
    const advSwap = await lib({ action: 'useInCampaign', id: L1[best].id, campaign_id: adv, adset_id: (await tree(adv)).adsets[0].id });
    ck('an Advantage+ draft can’t take a swap, and says what to do', advSwap.status === 400 && /Advantage\+/.test(advSwap.j.error) && /targeting test/.test(advSwap.j.error), advSwap.text);
    ck('the picker shows that draft with no slots', (await get('/api/ops/ads-library?drafts=1')).j.drafts.find(d => d.id === adv).slots.length === 0);
    await post({ action: 'deleteDraft', id: adv });
    ck('a campaign already in Meta can’t take a swap', (await lib({ action: 'useInCampaign', id: L1[best].id, campaign_id: c1, adset_id: (await tree(c1)).adsets[0].id })).status === 400);
    ck('an unknown ad set or audience is refused in plain words', (await lib({ action: 'useInCampaign', id: L1[best].id, campaign_id: c2, adset_id: 'ast_nope' })).status === 400 && (await lib({ action: 'useInCampaign', id: 'aud_nope', campaign_id: c2, adset_id: 'x' })).status === 404);
    ck('Meta saw no write from picking audiences (swapping edits the draft in Ops only)', (await writes()).length === wBefore, `${(await writes()).length} vs ${wBefore}`);
    ck('the second campaign is sent and started', await sendAndStart(c2));
    await cronGet('/api/ops/ads-sync'); await cronGet('/api/ops/ads-audiences');
    const L2 = await byName();
    ck('after two campaigns the two best audiences are Proven (at or above target twice)', L2[best].standing === 'Proven' && L2[best].wins === 2 && L2[second].standing === 'Proven' && L2[best].campaigns_count === 2, JSON.stringify(L2[best]));
    ck('the two weak ones have two strikes each (0.4 and 0.8 in the first, 0.8 and 0.4 in the second) and are not Retired yet', L2[worst].strikes === 2 && L2[fourth].strikes === 2 && L2[worst].standing !== 'Retired' && L2[fourth].standing !== 'Retired', JSON.stringify([L2[worst], L2[fourth]]));

    const c3 = await draftOf('Kali Winter 2027 C'), n3 = await names(c3);
    ck('the third draft starts with the Proven audiences first, labelled Proven with their past result', n3.slice(0, 2).sort().join() === [best, second].sort().join() && (await tree(c3)).adsets.filter(a => a.label === 'Proven').length === 2 && /best return 2\.4×/.test(JSON.stringify((await tree(c3)).adsets[0].targeting._result) + JSON.stringify((await tree(c3)).adsets[1].targeting._result)), n3.join(' | '));
    ck('the weak audience goes into ad set 5 again', await place(c3, worst, 5) && (await names(c3))[4] === worst);
    ck('and the third campaign is sent and started', await sendAndStart(c3));
    await cronGet('/api/ops/ads-sync'); await cronGet('/api/ops/ads-audiences');
    const L3 = await byName();
    ck('after three campaigns both weak ones are Retired: below the floor three times', L3[worst].standing === 'Retired' && L3[worst].strikes === 3 && L3[worst].retired_at && L3[fourth].standing === 'Retired', JSON.stringify(L3[worst]));
    ck('the library counts: 2 Proven, 2 Retired, the rest Not tested', (await library()).counts.Proven === 2 && (await library()).counts.Retired === 2 && (await library()).counts['Not tested'] === 1);
    const det = (await get(`/api/ops/ads-library?id=${L3[worst].id}`)).j;
    ck('its detail shows its result in all three campaigns, against each one’s own target and floor, and says what it doesn’t buy', det.results.length === 3 && det.results.every(r => r.outcome === 'below floor' && /target 1\.5×, floor 1\.2×/.test(r.target)) && det.says.some(s => /fell below the floor in/.test(s)) && det.says.some(s => /Retired/.test(s)), JSON.stringify(det.says));
    ck('the Practice Report part says not connected, and nothing broke', det.overlap.state === 'not_connected' && det.report.connected === false);

    console.log('-- a Retired audience is not suggested, but can be picked by hand with a warning');
    const c4 = await draftOf('Kali Winter 2027 D'), n4 = await names(c4);
    ck('a fourth draft does not suggest the Retired audience', !n4.includes(worst), n4.join(' | '));
    const refused = await lib({ action: 'useInCampaign', id: L3[worst].id, campaign_id: c4, adset_id: (await tree(c4)).adsets[0].id });
    ck('picking it by hand needs the warning confirmed, in plain words', refused.status === 400 && /retired/i.test(refused.j.error) && !(await names(c4)).includes(worst), refused.text);
    const okSwap = await lib({ action: 'useInCampaign', id: L3[worst].id, campaign_id: c4, adset_id: (await tree(c4)).adsets[0].id, confirm_retired: true });
    ck('with the warning confirmed it goes in', okSwap.status === 200 && (await names(c4))[0] === worst);
    await post({ action: 'deleteDraft', id: c4 });

    console.log('-- Bring back');
    const bb0 = await lib({ action: 'bringBack', id: L3[best].id, confirm: true }), bb1 = await lib({ action: 'bringBack', id: L3[worst].id });
    ck('only a Retired audience can be brought back, and it needs a confirm', bb0.status === 409 && bb1.status === 400);
    const rb2 = cookie('rebecka@example.com'), bb = await lib({ action: 'bringBack', id: L3[worst].id, confirm: true }, rb2);
    const back = (await byName())[worst];
    ck('Rebecka brings it back: it returns as Not tested, recorded with her name and the day', bb.status === 200 && back.standing === 'Not tested' && back.brought_back?.by && back.brought_back.at.startsWith(new Date().toISOString().slice(0, 10)), JSON.stringify(back));
    await cronGet('/api/ops/ads-audiences');
    ck('the next morning’s update keeps it (the old strikes are forgiven) and the record stays', (await byName())[worst].standing === 'Not tested' && (await byName())[worst].brought_back.by === back.brought_back.by);
    const c6 = await draftOf('Kali Winter 2027 E'), n6 = await names(c6); await post({ action: 'deleteDraft', id: c6 });
    ck('and it can be suggested again for a new campaign', n6.includes(worst), n6.join(' | '));

    console.log('-- thresholds changed in Settings change the outcome');
    const th = async v => lib({ action: 'saveThresholds', values: v });
    ck('Proven needing 3 campaigns: the two best have 3 wins (one in each campaign), so they stay Proven', (await th({ proven_after: 3 })).status === 200 && (await cronGet('/api/ops/ads-audiences')) && (await byName())[best].standing === 'Proven', JSON.stringify((await byName())[best]));
    ck('and 4 makes them only Promising', (await th({ proven_after: 4 })).status === 200 && (await cronGet('/api/ops/ads-audiences')) && (await byName())[best].standing === 'Promising');
    ck('back to 2 they are Proven again', (await th({ proven_after: 2 })).status === 200 && (await cronGet('/api/ops/ads-audiences')) && (await byName())[best].standing === 'Proven');
    ck('retiring after 2 strikes would retire the audience with strikes (its forgiven ones do not count: the strikes since are 0)', (await th({ retire_after: 2 })).status === 200 && (await cronGet('/api/ops/ads-audiences')) && (await byName())[worst].standing === 'Not tested');
    ck('a minimum spend of $50,000 makes everything too early (nothing is judged), so every audience is Not tested', (await th({ min_spend_cents: 5000000 })).status === 200 && (await cronGet('/api/ops/ads-audiences')) && (await library()).counts['Not tested'] === 5);
    await th({ min_spend_cents: 4000, retire_after: 3 }); await cronGet('/api/ops/ads-audiences');
    ck('back at the starting values the Proven audiences come back', (await byName())[best].standing === 'Proven' && (await library()).thresholds.min_spend_cents === 4000);
    ck('nonsense is refused in plain words', (await th({ retire_after: 'lots' })).status === 400 && /whole number/.test((await th({ retire_after: 'lots' })).j.error) && /Promising/.test((await th({ promising_after: 9 })).j.error));
    const log = mockLog();
    ck('each threshold change went on the Change Log (who, which setting, from and to)', /Ads: audience library/.test(log) && /Campaigns at or above target for Proven/.test(log) && /Minimum spend before judging/.test(log), log.split('\n').filter(x => /audience library/.test(x)).slice(0, 2).join(' / '));

    console.log('-- tags');
    const tg = await lib({ action: 'setTags', id: L3[best].id, tags: ['Kali', ' tantra ', 'enrollment'] });
    ck('tags are edited by a person (and tidied)', tg.status === 200 && tg.j.tags.join() === 'kali,tantra,enrollment' && (await byName())[best].tags.join() === 'kali,tantra,enrollment');
    ck('a tag that is not a short word is refused in plain words', (await lib({ action: 'setTags', id: L3[best].id, tags: ['<script>'] })).status === 400);
    await cronGet('/api/ops/ads-audiences');
    ck('the daily update leaves them alone', (await byName())[best].tags.join() === 'kali,tantra,enrollment');
    const tagged = await get('/api/ops/ads-library'); ck('the tag list on the page includes them (for the filter)', tagged.j.tags.includes('enrollment') && tagged.j.tags.includes('tantra'));
    // PR 2's suggestions by tags and standing: a fresh Enrollment draft is offered the tagged Proven audience first
    const c5 = await draftOf('Kali Winter 2027 F'), n5 = await names(c5);
    ck('the next draft’s first audiences are the Proven ones (matched on the “kali” and “enrollment” tags)', n5.slice(0, 2).sort().join() === [best, second].sort().join(), n5.join(' | '));
    await post({ action: 'deleteDraft', id: c5 });

    const left = await draftOf('Kali Winter 2027 H');   // left as a draft, for the browser flow to swap into
    ck('one draft is left for the browser flow', (await get('/api/ops/ads-library?drafts=1')).j.drafts.some(d => d.id === left));

    console.log('-- the Meta mock, the token and the logs');
    const reqs = (await meta()).requests;
    ck('Meta was only ever written to by the campaign steps people pressed (creating, sending, starting): no audience, lookalike or user upload', !reqs.some(r => r.write && /customaudiences|\/users/.test(r.path || '')), JSON.stringify(reqs.filter(r => r.write && /customaudiences/.test(r.path || '')).slice(0, 2)));
    ck('the access key and the database address appear in no answer or log', !appLog().includes('mock-ads-token') && !(await get('/api/ops/ads-library')).text.includes('mock-ads-token') && !/postgres(ql)?:\/\//.test((await get('/api/ops/ads-library')).text + appLog()));
  } else {
    console.log('-- the Practice Report connected (a synthetic quiz in an in-process database)');
    ck('the first campaign is built, sent, started, synced', await (async () => { const c = await draftOf('Kali Winter 2027'); return sendAndStart(c); })() && (await cronGet('/api/ops/ads-sync')).j.rows > 0);
    await cronGet('/api/ops/ads-audiences');
    const l = (await get('/api/ops/ads-library')), all = [l.text];
    ck('the page is told the Practice Report is connected and has ideas with their counts', l.j.report.connected === true && l.j.ideas.total === 60 && l.j.ideas.items.length === 3 && /^A lookalike of people who got “The Contemplative” \(30 people\)/.test(l.j.ideas.items[0].text), JSON.stringify(l.j.ideas));
    ck('the ideas say where they came from and that they are ideas only (no upload)', !l.j.ideas.items.some(i => /upload|send/i.test(i.text)));
    const rows = l.j.rows; const d = (await get(`/api/ops/ads-library?id=${rows[0].id}`)); all.push(d.text);
    ck('an audience’s detail shows the quiz archetypes of the people who arrived from its campaign (20 of the 60 came from this campaign’s link), at campaign level', d.j.overlap.state === 'ok' && d.j.overlap.level === 'campaign' && d.j.overlap.total === 20 && d.j.overlap.rows[0].archetype === 'The Contemplative' && d.j.overlap.rows.every(r => r.share > 0), JSON.stringify(d.j.overlap));
    for (const p of ['/ops/ads?view=library', `/ops/ads?view=library&audience=${rows[0].id}`, '/ops/settings?view=connections&s=ads-library']) all.push((await call('GET', p, DIR)).text);
    ck('no name or email from the quiz is in any answer or page', !all.some(t => PERSON.test(t)));
    ck('nor in the server log, the mock’s log or the Meta mock’s log', !PERSON.test(appLog()) && !PERSON.test(mockLog()) && !PERSON.test(JSON.stringify(await meta())));
    ck('Meta saw no upload of any person (no users, no custom audience, no lookalike)', !(await meta()).requests.some(r => r.write && /customaudiences|\/users/.test(r.path || '')));
    ck('the database address appears nowhere', !/postgres(ql)?:\/\//.test(all.join('') + appLog()));
  }
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
