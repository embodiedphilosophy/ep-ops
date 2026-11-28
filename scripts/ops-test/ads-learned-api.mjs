// Ads › What we've learned, at API level (needs the app on :3100 started by ads-learned.sh). `source env.sh`, then:
//   node ads-learned-api.mjs none       no Meta key: who may see it, "not connected", no request to Meta, no table, the hourly job's gates, the once-a-minute limit's 429
//   node ads-learned-api.mjs full1      Meta key set (switch OFF), the mock's 'history' world: nothing yet, a preview (campaign list only, no table), a rate limit once, then 8 of 20 weeks (left mid-way for the browser)
//   node ads-learned-api.mjs full2      the rest of the import; the statements (each re-checked here), their ads with Ads Manager links, phrased by the model and checked, nothing personal anywhere, only reads at Meta
//   node ads-learned-api.mjs bad        the model answers badly as well (wrong side, a reason, advice, a number nobody gave, a cited number that doesn't exist, unknown group): every bad one is dropped, code's own text stays
//   node ads-learned-api.mjs nokey|failmodel   no key / the model fails: the plain statements, the model never asked
//   node ads-learned-api.mjs large1|large2|guard   a BIG account (the Meta mock's world 'large', slow pages), the app started with a very short run budget (MOCK_HISTORY_BUDGET): large1 = one hourly run answers JSON in time with a progress note and
//                       the part-way state is saved (left for the browser); large2 = the next runs carry on to the end; guard = a press that would run past the server's time guard still answers JSON, with what was done
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as V from '../../lib/ops/insightsverify.js';

const PHASE = process.argv[2] || 'none';
const B = 'http://localhost:3100', MOCK = 'http://localhost:4555', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch {} return { status: r.status, text, j, loc: r.headers.get('location') || '' }; };
const CRON = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
const cron = (q = '', headers = CRON) => fetch(`${B}/api/ops/ads-history${q}`, { headers }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const view = async (c = DIR) => (await call('GET', '/api/ops/ads-learned', c)).j;
const meta = async (reset = false) => (await fetch(`${META}/__log${reset ? '?reset=1' : ''}`)).json();
const mmode = q => fetch(`${META}/__mode?${q}`);
const mockLog = () => fs.readFileSync(path.join(here, 'out/mock.log'), 'utf8');
const appLog = () => { try { return fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { return ''; } };
const sheetWrites = () => mockLog().split('\n').filter(l => /^(WROTE|ADDED|APPENDED|COPIED|RENAMED|CIRCLE WRITE|KIT (DRAFT|TAG|DESC|REFUSED)|BLOCKED)/.test(l)).length;
const anthropicLog = async (reset = false) => (await fetch(`${MOCK}/__anthropic-log${reset ? '?reset=1' : ''}`)).json();
const PERSON = /MARKER-COPY|marker\.buyer|example\.invalid|Synthetic Person|synthetic\.person/i;
const everyone = [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn (Publisher)', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']];
const statements = v => [...v.working, ...v.not_working];
const recheck = f => V.verifyClaim(f.text, f.metrics.map(m => m.id), new Map(f.metrics.map(m => [m.id, m])), [f.label]);

(async () => {
  const seen = [];   // every page and answer, searched for personal values at the end
  const note = r => { seen.push(r.text); return r; };

  if (PHASE === 'none') {
    await fetch(`${META}/__reset`); await fetch(`${MOCK}/__anthropic-log?reset=1`);
    console.log('-- who may see it');
    for (const [who, email, want] of [['director (Jacob)', null, 200], ['Rebecka (Ads role)', 'rebecka@example.com', 200], ...everyone.map(([w, e]) => [w, e, 403])]) {
      const c = email ? cookie(email) : DIR;
      ck(`${who}: the API answers ${want}, and its write door ${want === 200 ? 'is open' : 'says 403'}`, (await call('GET', '/api/ops/ads-learned', c)).status === want && (want === 200 ? true : (await call('POST', '/api/ops/ads-learned', c, { action: 'run' })).status === 403));
      const pg = note(await call('GET', '/ops/ads?view=learned', c));
      ck(`${who}: the What we’ve learned tab ${want === 200 ? 'opens, as the current tab' : 'is not reachable'}`, want === 200 ? pg.status === 200 && /What we’ve learned/.test(pg.text) && /aria-current="page">What we’ve learned</.test(pg.text) : pg.status !== 200);
    }
    ck('the hourly job: no key 401, wrong key 401', (await cron('', {})).status === 401 && (await cron('?key=wrong', {})).status === 401);
    console.log('-- Meta not connected, nothing read yet');
    let v = await view();
    ck('the page data is empty and says Meta is not connected (with the words)', v.exists === false && v.meta.connected === false && /META_ADS_TOKEN/.test(v.meta.text) && v.working.length === 0 && v.not_working.length === 0 && v.coverage === null);
    const pre = await cron('?dry=1');
    ck('the job in preview: Meta not connected, nothing made', pre.status === 200 && pre.j.preview === true && pre.j.notConnected === true);
    const live = await cron('');
    ck('the job for real (jobs live): says not connected, no table, nothing asked', live.status === 200 && live.j.notConnected === true && live.j.skipped === undefined && (await view()).exists === false);
    const run = await call('POST', '/api/ops/ads-learned', DIR, { action: 'run' });
    ck('“Read the history now” without Meta: a plain answer (not connected), no error', run.status === 200 && run.j.run.notConnected === true && run.j.view.exists === false);
    const again = await call('POST', '/api/ops/ads-learned', DIR, { action: 'run' });
    ck('a second press inside a minute is refused with 429, saying how long to wait', again.status === 429 && /only just read/.test(again.j.error) && again.j.wait > 0 && again.j.wait <= 60, JSON.stringify(again.j));
    ck('an unknown action is refused', (await call('POST', '/api/ops/ads-learned', DIR, { action: 'delete' })).status === 400);
    ck('Meta was asked nothing at all, by any of that', (await meta()).total === 0);
    ck('no model was asked', (await anthropicLog()).length === 0);
  }

  if (PHASE === 'full1') {
    await fetch(`${META}/__reset`); await fetch(`${META}/__world?name=history`); await fetch(`${MOCK}/__anthropic-log?reset=1`);
    console.log('-- nothing read yet');
    let v = await view();
    ck('the page data: Meta is connected, nothing read, no table', v.exists === false && v.meta.connected === true && v.coverage === null);
    note(await call('GET', '/ops/ads?view=learned'));
    ck('opening the page asks Meta nothing', (await meta()).total === 0);
    const pre = await cron('?dry=1');
    const log = await meta(true);
    ck('the job in preview: 20 weeks to read, would read 8, asked Meta for the campaign list only, made no table', pre.j.preview === true && pre.j.weeks.total === 20 && /Would read up to 8 of the 20 weeks/.test(pre.j.note) && log.requests.length === 1 && /campaigns$/.test(log.requests[0].path) && (await view()).exists === false, JSON.stringify(pre.j));
    console.log('-- a rate limit once, then the import resumes');
    await mmode('rateLimitInsightsOnce=1'); await mmode('pageSize=9');
    const r1 = await cron('');
    ck('run 1: Meta asks us to slow down on the first week; the run stops, says so, has read nothing', r1.j.rate_limited === true && r1.j.weeks.read === 0 && /slow down/.test(r1.j.note), JSON.stringify(r1.j));
    v = await view();
    ck('the page data shows 0 of 20 weeks, still importing, and that it is going slower than usual', v.exists === true && v.coverage.weeks_done === 0 && v.coverage.weeks_total === 20 && v.coverage.importing && v.coverage.slowed);
    const r2 = await cron('');
    ck('run 2: eight weeks read, 12 left', r2.j.weeks.read === 8 && r2.j.weeks.left === 12 && r2.j.rate_limited === false, JSON.stringify(r2.j.weeks));
    v = await view();
    ck('the page data: 8 of 20 weeks, the statements so far are provisional (no Newer / Still true labels)', v.coverage.weeks_done === 8 && v.coverage.importing && v.read_no === 0 && statements(v).length > 0 && statements(v).every(f => f.status === ''));
    const ml = await meta();
    ck('Meta saw only reads, the key never in a URL', ml.requests.length > 0 && ml.requests.every(x => !x.write && !x.tokenInUrl && x.auth));
  }

  if (['full2', 'bad', 'nokey', 'failmodel'].includes(PHASE)) {
    if (PHASE !== 'full2') { await fetch(`${META}/__reset`); await fetch(`${META}/__world?name=history`); await fetch(`${MOCK}/__anthropic-log?reset=1`); await mmode('pageSize=9'); if (PHASE === 'bad') await fetch(`${MOCK}/__insights?bad=1`); }
    const sw0 = sheetWrites();
    console.log('-- the rest of the import');
    let r, n = 0; do { r = await cron(''); n++; } while (r.j.weeks?.left > 0 && n < 8);
    ck(`every week is read, in ${PHASE === 'full2' ? 'two more' : 'three'} runs of at most eight weeks`, r.j.weeks.left === 0 && r.j.weeks.done === 20 && n === (PHASE === 'full2' ? 2 : 3), JSON.stringify([n, r.j.weeks]));
    const idle = await cron('');
    ck('another run changes nothing: no week read, no new analysis', idle.j.weeks.read === 0 && idle.j.analysed === false);
    const v = await view();
    note({ text: JSON.stringify(v) });
    const fts = statements(v);
    ck('the page data: all 20 weeks read, read number 1, every statement Newer', v.coverage.weeks_done === 20 && !v.coverage.importing && v.read_no === 1 && fts.length >= 10 && fts.every(f => f.status === 'newer' && f.status_text === 'Newer'));
    ck('“What’s working” has video ads and the warm list; “What isn’t” has carousel ads and no narrowing', v.working.some(f => f.label === 'Video ads') && v.working.some(f => /already know EP/.test(f.label)) && v.not_working.some(f => f.label === 'Carousel ads') && v.not_working.some(f => /no audience narrowing/.test(f.label)));
    ck('working statements are ahead of 1.5× (or cheaper sign-ups), the others behind (or dearer)', v.working.every(f => f.side === 'ahead') && v.not_working.every(f => f.side === 'behind'));
    ck('each statement, re-checked here: its numbers exist and match, no reason, no advice', fts.every(f => recheck(f) === '' && !V.reasoningWord(f.text)), fts.filter(f => recheck(f)).map(f => f.text + ' → ' + recheck(f)).join(' | '));
    ck('each statement names its reliability and cites its numbers with ids (see the numbers)', fts.every(f => /^(Enough to read|Early sign)$/.test(f.reliability_text) && f.metrics.length >= 5 && f.metrics.every(m => /^m\d+$/.test(m.id))));
    ck('each statement lists the ads behind it with a link to Ads Manager (account and campaign in the link)', fts.every(f => f.sources.length > 0 && f.sources.every(s => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=H_C\d$/.test(s.url) && s.ad_id && s.name)));
    ck('the groups with too little to say are listed apart (the barely-run Yoga Sutras campaign), not as statements', v.not_enough.some(g => /Yoga Sutras/.test(g.label)) && !fts.some(f => /Yoga Sutras/.test(f.label)));
    ck('the 1.5× line and the thresholds are in the page data', v.thresholds.target === 1.5 && v.thresholds.enough.spend_cents === 50000 && v.thresholds.early.purchases === 5);
    ck('the totals: sales ads and sign-up ads, as Meta counts them', v.totals.purchase.ads === 29 && v.totals.lead.ads === 10);
    console.log('-- the model only phrases; code checks');
    const al = await anthropicLog(), hist = al.filter(x => /history_findings/.test(x));
    if (PHASE === 'nokey' || PHASE === 'failmodel') {
      ck(PHASE === 'nokey' ? 'no model key: it was never asked' : 'the model failed: it was asked', PHASE === 'nokey' ? hist.length === 0 : hist.length > 0);
      ck('every statement is the plain one code wrote', fts.every(f => f.by === 'code') && v.phrasing === (PHASE === 'nokey' ? 'no_key' : 'failed'), v.phrasing);
      ck(`the page says so in plain words (${PHASE === 'nokey' ? 'the key isn’t set up' : 'written directly from the numbers'})`, /Learned|learned/.test((await call('GET', '/ops/ads?view=learned')).text) && v.ai === (PHASE === 'failmodel'));
    } else {
      ck('the model was asked (by name of what it was asked: findings only)', hist.length >= 1 && hist.every(x => JSON.parse(x).messages[0].content.includes('history_findings')));
      const sent = hist.join('\n');
      ck('what it saw is group names and numbers only: no ad name, no campaign name, no word of any ad, no email', !PERSON.test(sent) && !/Ad \d+ ·/.test(sent) && !/enrollment|Tantra: summer|Newsletter sign-ups|Blog traffic|H_AD|H_C\d/.test(sent) && /Video ads/.test(sent), sent.slice(0, 200));
      const phr = v.phrase;
      ck('some statements were phrased by the model and passed the check', v.phrasing === 'model' && phr.used >= 5 && fts.some(f => f.by === 'model'), JSON.stringify(phr));
      ck('the ones it was not asked about (outside the top twelve) are code’s own', fts.some(f => f.by === 'code'));
      if (PHASE === 'bad') {
        ck('its bad answers were dropped, one by one (wrong side, a reason, advice, a made-up number, a number that does not exist, an unknown group, a statement with no numbers)', phr.dropped >= 6, JSON.stringify(phr));
        ck('none of the bad words reached the page', !fts.some(f => /9\.9|because|spend more|987654|Quiet\.|does not exist/.test(f.text)));
        const top = fts.reduce((a, b) => (b.spend_cents > a.spend_cents ? b : a));
        ck('the biggest finding (whose phrasing was the wrong side) kept code’s own statement', top.by === 'code' && /returned \d\.\d\d×/.test(top.text), top.text);
      } else ck('nothing was dropped from a good answer', phr.dropped === 0, JSON.stringify(phr));
    }
    console.log('-- privacy, reads only');
    const ml = await meta();
    ck('Meta saw only reads, the key never in a URL', ml.requests.length > 20 && ml.requests.every(x => !x.write && !x.tokenInUrl && x.auth));
    ck('nothing was written to any sheet, Circle, Kit or the calendar', sheetWrites() === sw0);
    const pages = [note(await call('GET', '/ops/ads?view=learned')), note(await call('GET', '/ops/ads', cookie('rebecka@example.com'))), note(await call('GET', '/api/ops/ads-learned', cookie('rebecka@example.com')))];
    ck('no word of any ad, no marker, no email in the page, the API answer or the model’s requests', pages.every(p => p.status === 200) && !seen.some(t => PERSON.test(t)) && !al.some(x => PERSON.test(x)));
    ck('the app’s own log has no key, no Ads table line and no marker', !/mock-ads-token|mock-anthropic-key|ads_history|MARKER-COPY|marker\.buyer/.test(appLog()));
    if (PHASE === 'full2') {
      const rb = await call('GET', '/api/ops/ads-learned', cookie('rebecka@example.com'));
      ck('Rebecka (Ads role) sees the same statements', rb.status === 200 && statements(rb.j).length === fts.length);
      ck('Rebecka still cannot open Business', (await call('GET', '/ops/business', cookie('rebecka@example.com'))).status !== 200);
    }
  }
  if (PHASE === 'large1') {
    await fetch(`${META}/__reset`); await fetch(`${META}/__world?name=large`); await mmode('pageSize=200'); await mmode('slowPageMs=60');
    console.log('-- a big account, one run with a short budget');
    await cron('');   // the first run also makes the tables (slow in a test database), so the one measured below starts from a steady state
    const t0 = Date.now(), r1 = await cron('');
    ck('the hourly job answers 200 and JSON inside its budget (not an error, not a hang), with a plain note on how far it got', r1.status === 200 && r1.j.error === undefined && Date.now() - t0 < 6000 && /so far/.test(r1.j.note) && r1.j.note === r1.j.progress && !!r1.j.structure_progress, JSON.stringify([Date.now() - t0, r1.status, r1.j.note]));
    const v = await view();
    ck('the page data shows the import part-way: how many ad sets or ads are read, and the weeks not yet done', v.exists === true && v.coverage.importing === true && !!v.coverage.structure && v.coverage.structure.sets + v.coverage.structure.ads > 0 && v.coverage.weeks_done === 0, JSON.stringify(v.coverage));
    ck('Meta saw only reads', (await meta()).requests.every(x => !x.write && !x.tokenInUrl && x.auth));
  }
  if (PHASE === 'large2') {
    console.log('-- the next runs carry on from where it stopped');
    let r, n = 0, ok = true, slow = 0;
    do { const t0 = Date.now(); r = await cron(''); n++; if (r.status !== 200 || r.j.error !== undefined) ok = false; slow = Math.max(slow, Date.now() - t0); } while ((r.j.weeks?.left > 0 || r.j.structure_progress) && n < 40);
    ck('every run answered 200 with JSON inside its budget, and in a few runs everything is read', ok && slow < 6000 && n < 40 && r.j.weeks.left === 0, JSON.stringify([n, slow, r.j.weeks]));
    const v = await view();
    ck('the page data: the ads and all the weeks are read, nothing part-way, the statements made once', v.coverage.importing === false && v.coverage.structure === null && v.coverage.partial_week === null && v.coverage.weeks_done === v.coverage.weeks_total && v.coverage.weeks_total >= 2 && v.read_no === 1, JSON.stringify(v.coverage));
    ck('Meta saw only reads, the key never in a URL', (await meta()).requests.every(x => !x.write && !x.tokenInUrl && x.auth));
  }
  if (PHASE === 'guard') {
    await fetch(`${META}/__reset`); await fetch(`${META}/__world?name=large`); await mmode('pageSize=200'); await mmode('slowPageMs=300');
    console.log('-- a press that would run past the server’s time guard');
    const t0 = Date.now(), run = await call('POST', '/api/ops/ads-learned', DIR, { action: 'run' }), took = Date.now() - t0;
    ck('the server answered in time (the guard is 1.5 seconds here), with status 200 and JSON, not an error', run.status === 200 && run.j.ok === true && took < 5000, JSON.stringify([took, run.status, run.text.slice(0, 120)]));
    ck('it says in plain words that the read was stopped for time, that what was read is kept and that the next press carries on', run.j.run?.timedOut === true && /stopped just before the server’s time limit/.test(run.j.run.note) && /kept/.test(run.j.run.note) && /carries on/.test(run.j.run.note), run.j.run?.note);
    ck('the answer carries the page data too (so the page can show how far it got)', !!run.j.view && run.j.view.meta?.connected === true);
    ck('no secret, address or key in the answer', !/mock-ads-token|https?:\/\//.test(run.text));
  }
  if (PHASE === 'none') ck('no word of any ad, no marker in anything the page said', !seen.some(t => PERSON.test(t)));
  console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
