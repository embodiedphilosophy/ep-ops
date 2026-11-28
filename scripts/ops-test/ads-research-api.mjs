// Ads outside research, at API level (needs the app on :3100 started by ads-research.sh). `source env.sh`, then:
//   node ads-research-api.mjs full     key set, jobs live: roles, nothing yet, the weekly job (401s, preview, the bad answer checked), what the model was sent, the page data, no writes elsewhere
//   node ads-research-api.mjs nokey    no Anthropic key: the page says not connected, the job and "Look now" say so, nothing is asked and no table is made
//   node ads-research-api.mjs paused   the jobs paused (OPS_LIVE not 1): the weekly job is skipped; its preview still works; nothing is asked
//   node ads-research-api.mjs failing  the model's side fails (500), then the search tool errors: each says so plainly and keeps nothing; then "Look now" rate limit after a good look
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUSINESS, QUESTIONS, ALLOWED_DOMAINS } from '../../lib/ops/adsresearch.js';

const PHASE = process.argv[2] || 'full';
const B = 'http://localhost:3100', MOCK = 'http://localhost:4555';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { status: r.status, j, text: t }; };
const get = (u, c) => call('GET', u, c), look = c => call('POST', '/api/ops/ads-outside', c, { action: 'run' });
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cronGet = (u, headers = CRON) => fetch(B + u, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const mode = m => fetch(`${MOCK}/__research?mode=${m}`).then(r => r.json());
const sent = async () => (await (await fetch(`${MOCK}/__anthropic-log`)).json()).map(x => JSON.parse(x)).filter(b => (b.tools || []).length);
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const sheetWrites = () => mockLog().split('\n').filter(l => /^(WROTE|ADDED|APPENDED|COPIED|RENAMED|CIRCLE WRITE|KIT (DRAFT|TAG|DESC|REFUSED)|BLOCKED)/.test(l)).length;
const view = async (w = '') => (await get(`/api/ops/ads-outside${w ? `?week=${w}` : ''}`)).j;
const everyone = [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn (Publisher)', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']];
const KEY = /mock-anthropic-key-not-real/;

(async () => {
  await fetch(`${MOCK}/__anthropic-log?reset=1`); await mode('good');
  const everything = [];

  if (PHASE === 'full') {
    console.log('-- who sees it');
    for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ...everyone.map(([w, e]) => [w, e, 403])]) {
      const c = email ? cookie(email) : DIR;
      ck(`${who}: the API answers ${want}, and its write door ${want === 200 ? 'is open (no look is made here: the rest of the flow does that)' : 'is shut'}`, (await get('/api/ops/ads-outside', c)).status === want && (want === 200 || (await look(c)).status === 403));
      const pg = await call('GET', '/ops/ads?view=insights', c);
      ck(`${who}: the Audience insights page ${want === 200 ? 'carries the Outside research panel' : 'is not reachable'}`, want === 200 ? pg.status === 200 && /Outside research/.test(pg.text) : pg.status !== 200);
    }
    ck('a bad request to the write door is refused plainly', (await call('POST', '/api/ops/ads-outside', DIR, { action: 'delete' })).status === 400 && (await call('POST', '/api/ops/ads-outside', DIR, {})).status === 400);
    ck('nobody signed out can read or press it', (await fetch(B + '/api/ops/ads-outside')).status === 403 && (await fetch(B + '/api/ops/ads-outside', { method: 'POST', body: '{"action":"run"}' })).status === 403);

    console.log('-- nothing yet: no table, nothing asked');
    let d = await view();
    ck('before anything is saved the page data is empty, the key is set, the questions are listed, and no table exists', d.exists === false && d.ai === true && d.week === null && d.notes.length === 0 && d.questions.length === 5 && d.weeks.length === 0);
    ck('the weekly job is refused without the key (401), with a wrong key too', (await cronGet('/api/ops/ads-research', {})).status === 401 && (await cronGet('/api/ops/ads-research?key=wrong', {})).status === 401);
    const pre = await cronGet('/api/ops/ads-research?dry=1');
    ck('?dry=1 says what it would do (key set, five questions, up to five searches), asks nothing and makes no table', pre.status === 200 && pre.j.preview === true && pre.j.key === true && pre.j.questions === 5 && pre.j.searches_allowed === 5 && (await sent()).length === 0 && (await view()).exists === false, JSON.stringify(pre.j));
    ck('?preview=1 does the same', (await cronGet('/api/ops/ads-research?preview=1')).j.preview === true && (await sent()).length === 0);
    const sw0 = sheetWrites();

    console.log('-- the weekly job, with a bad answer');
    await cronGet('/api/ops/ads-insights');   // the account's own numbers are in the database now (Circle and Kit read from the mock): none of it may reach the model
    await mode('bad');
    const run = await cronGet('/api/ops/ads-research');
    ck('it runs (jobs are live here): three statements kept, ten left out, one search', run.status === 200 && run.j.preview === false && run.j.state === 'ok' && run.j.kept === 3 && run.j.dropped === 10 && run.j.searches === 1, JSON.stringify(run.j));
    d = await view(); everything.push(JSON.stringify(d));
    ck('the page data has the three, each with status New, the day read, and its source link, title and the words it rests on', d.exists && d.week.state === 'ok' && d.notes.length === 3 && d.notes.every(n => n.status === 'New' && n.read_at && n.sources.length >= 1 && n.sources.every(s => /^https:\/\//.test(s.url) && s.title && s.snippet)), JSON.stringify(d.notes));
    ck('it says how many were left out (10), and how many searches were made (1)', d.week.dropped === 10 && d.week.searches === 1 && d.week.asked === 13);
    ck('every source address is a page on a site from the list', d.notes.every(n => n.sources.every(s => ALLOWED_DOMAINS.some(x => new URL(s.url).hostname === x || new URL(s.url).hostname.endsWith(`.${x}`)))));
    ck('no statement in it carries advice or a reason, or a number its source lacks', d.notes.every(n => !/\b(should|must|because|so|likely|recommend)\b/i.test(n.statement)) && !/\$4\.80|20 March|brand new way/.test(JSON.stringify(d.notes)));
    ck('the week is one set: running again the same week replaces it (three, not six)', (await cronGet('/api/ops/ads-research')).j.state === 'ok' && (await view()).notes.length === 3 && (await view()).weeks.length === 1);

    console.log('-- what the model was sent');
    const s = await sent();
    ck('two requests so far, each with the search tool and nothing else but the questions and the one line about EP’s business', s.length === 2 && s.every(b => b.tools.length === 1 && b.tools[0].type === 'web_search_20250305' && b.tools[0].name === 'web_search' && b.tools[0].max_uses === 5 && b.messages.length === 1 && b.messages[0].content === `The business: ${BUSINESS}.\nThe questions:\n${QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n')}`));
    ck('no marker name or address, no figure from the account, no campaign or topic name anywhere in what was sent', s.every(b => { const t = JSON.stringify(b); return !/Marker|example\.invalid|Synthetic|synthetic\.person|KITTXN|Kali|Winter|Meditation Pass|Spanda|@/i.test(t) && !/\$\d/.test(t) && !KEY.test(t); }));

    console.log('-- the page and the logs');
    const pg = await call('GET', '/ops/ads?view=insights', DIR); everything.push(pg.text);
    ck('the page carries the panel, its “outside information” label and the Look now button', /Outside research/.test(pg.text) && /This is outside information, not about our own ads/.test(pg.text) && /Look now/.test(pg.text));
    ck('the settings page lists the weekly job in plain words, on Mondays', /Outside research/.test((await call('GET', '/ops/settings?view=connections')).text) && /Mondays at 11:35 UTC/.test((await call('GET', '/ops/settings?view=connections')).text));
    ck('no key value on any page or answer', everything.every(t => !KEY.test(t)));
    ck('and not in the app’s log or the stand-in’s log', !KEY.test(fs.readFileSync(path.join(here, 'out/next.log'), 'utf8')) && !KEY.test(mockLog()));
    ck('nothing was written to any sheet, Circle or Kit by any of it (the Insights job, which only reads, ran first)', sheetWrites() === sw0, `${sheetWrites()} vs ${sw0}`);
    ck('Look now right after a Monday look is refused plainly (429)', (await look(DIR)).status === 429 && (await look(DIR)).j.error.includes('only just made'));
  }

  if (PHASE === 'failing') {
    console.log('-- the model’s side fails, then the search tool does');
    await mode('fail');
    let r = await cronGet('/api/ops/ads-research');
    ck('a failed call: the job says failed, nothing is kept, no table is made', r.status === 200 && r.j.state === 'failed' && (await view()).exists === false, JSON.stringify(r.j));
    const u = await look(DIR);
    ck('Look now says plainly it could not look and kept nothing (502)', u.status === 502 && /couldn’t be made just now/.test(u.j.error) && !/mock failure/.test(u.text));
    await mode('searcherror');
    r = await cronGet('/api/ops/ads-research');
    ck('the search tool reporting an error: failed too, nothing kept', r.j.state === 'failed' && (await view()).exists === false);
    await mode('good');
    const g = await cronGet('/api/ops/ads-research');
    ck('then a good answer keeps three', g.j.state === 'ok' && g.j.kept === 3 && (await view()).notes.length === 3);
  }

  if (PHASE === 'nokey') {
    console.log('-- no Anthropic key');
    const d = await view();
    ck('the page data says the key is not set, and there is no table', d.ai === false && d.exists === false);
    const pre = await cronGet('/api/ops/ads-research?dry=1');
    ck('the preview says the key is not set', pre.j.preview === true && pre.j.key === false);
    const r = await cronGet('/api/ops/ads-research');
    ck('the weekly job says no_key, asks nothing and makes no table', r.j.state === 'no_key' && (await sent()).length === 0 && (await view()).exists === false, JSON.stringify(r.j));
    const u = await look(DIR);
    ck('Look now says the key is missing and nothing was searched (503)', u.status === 503 && /Anthropic key/.test(u.j.error) && /Nothing was searched/.test(u.j.error));
    const pg = await call('GET', '/ops/ads?view=insights', DIR);
    ck('the page still opens, with the panel', pg.status === 200 && /Outside research/.test(pg.text));
  }

  if (PHASE === 'paused') {
    console.log('-- the jobs are paused (OPS_LIVE is not 1)');
    const r = await cronGet('/api/ops/ads-research');
    ck('the weekly job is skipped, and asks nothing', r.j.skipped === true && /OPS_LIVE/.test(r.j.reason) && (await sent()).length === 0);
    const pre = await cronGet('/api/ops/ads-research?dry=1');
    ck('its preview still works, and asks nothing', pre.j.preview === true && pre.j.key === true && (await sent()).length === 0);
    ck('Look now is a person pressing a button, so it works while the Monday job is paused', (await look(DIR)).status === 200 && (await sent()).length === 1);
  }
  console.log(bad ? `${bad} FAILED` : 'all ok'); process.exit(bad ? 1 : 0);
})();
