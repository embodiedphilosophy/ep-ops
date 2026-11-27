// Ads PR 1: Settings › Connections and jobs › Meta ads row, and "nothing at page load". Run by ads-settings.sh, once per mode (the app is restarted
// with different settings each time): node ads-settings.cjs none|dry|live. Mock only (the Meta mock on :4556 sees every request).
//   none: no Meta settings (as today)   dry: the key, ad account, pixel and Page set, the switch off   live: the switch on (at the mock)
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', MODE = process.argv[2] || 'none'; let bad = 0;
const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const WANT = {
  none: { label: 'Not connected', set: 1, text: /Not connected\./ },
  dry: { label: 'Dry run — nothing is sent to Meta', set: 5, text: /Dry run — nothing is sent to Meta\./ },
  live: { label: 'Live', set: 6, text: /Live\./ },
}[MODE];
const metaLog = async () => (await (await fetch('http://localhost:4556/__log')).json());
(async () => {
  await fetch('http://localhost:4556/__reset');
  const b = await chromium.launch();
  const as = async (ck_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e))); return p; };
  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('[aria-label="Meta ads settings"]');
  const row = p.locator('[aria-label="Connections"] tr', { hasText: 'Meta ads' });
  const text = await row.innerText();
  ck(`[${MODE}] the Meta ads row is in the systems list (eight systems)`, await p.locator('[aria-label="Connections"] tbody tr').count() === 8 && await row.count() === 1);
  ck(`[${MODE}] it says “${WANT.label}”`, WANT.text.test(text));
  const items = await p.locator('[aria-label="Meta ads settings"] li').allInnerTexts();
  ck(`[${MODE}] the six settings are listed by name, ${WANT.set} of them in place`, items.length === 6 && ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PIXEL_ID', 'META_PAGE_ID', 'META_IG_USER_ID', 'META_ADS_LIVE'].every(n => items.some(i => i.includes(n))) && items.filter(i => !/not set$/.test(i)).length === WANT.set, items.join(' | '));
  ck(`[${MODE}] the safety switch line reads ${MODE === 'live' ? 'live' : 'not set'}`, /META_ADS_LIVE\)?: (live|not set)$/.test(items.find(i => i.includes('META_ADS_LIVE')) || '') && items.find(i => i.includes('META_ADS_LIVE')).endsWith(MODE === 'live' ? 'live' : 'not set'));
  const html = await p.content();
  ck(`[${MODE}] no value is on the page (not the key, the account, the pixel or the Page)`, !/mock-ads-token|act_MOCK1|PIX1|PAGE1|IG1/.test(html));
  ck(`[${MODE}] read only: no buttons or links in the row`, await row.locator('button, a, input').count() === 0);
  ck(`[${MODE}] the director’s sidebar has the Ads place (added in Ads PR 2), and it works in every mode`, /\bAds\b/.test(await p.locator('nav').first().innerText()) && (await (await fetch(U + '/ops/ads', { headers: { Cookie: `ep_ops=${DIRECTOR}` }, redirect: 'manual' })).status) === 200);
  ck(`[${MODE}] opening Settings asked Meta nothing`, (await metaLog()).total === 0);

  // roles: only directors open Connections and jobs
  for (const [who, name] of [['floss@example.com', 'Floss'], ['irene@example.com', 'Irene'], ['carolyn@example.com', 'Carolyn'], ['rebecka@example.com', 'Rebecka'], ['ichha@example.com', 'Ichha'], ['stephanie@example.com', 'Stephanie (Payroll)'], ['abha@example.com', 'a teacher']]) {
    const q = await as(cookie(who)); const r = await q.goto(U + '/ops/settings?view=connections', { waitUntil: 'domcontentloaded' });
    ck(`[${MODE}] ${name} does not see the Meta ads row`, !/Meta ads|META_ADS/.test(await q.content()), q.url());
    await q.context().close();
  }

  // phone width
  const ph = await as(DIRECTOR, { width: 390, height: 800 });
  await ph.goto(U + '/ops/settings?view=connections'); await ph.waitForSelector('[aria-label="Meta ads settings"]');
  ck(`[${MODE}] phone width: the page does not scroll sideways`, await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ck(`[${MODE}] phone width: the table scrolls inside its own box`, await ph.evaluate(() => { const w = document.querySelector('[aria-label="Connections"] .ops-table-wrap'); return !!w && getComputedStyle(w).overflowX !== 'visible'; }));
  fs.mkdirSync(path.join(__dirname, 'out/ads'), { recursive: true });
  await ph.screenshot({ path: path.join(__dirname, `out/ads/settings-${MODE}-390.png`), fullPage: true });
  await p.screenshot({ path: path.join(__dirname, `out/ads/settings-${MODE}-1360.png`), fullPage: true });

  // (g) nothing at page load: every place's pages, as a director; then the mock must still have seen nothing
  const pages = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8')).map(x => x[1]);
  const codes = [];
  for (const u of pages) { const r = await fetch(U + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${DIRECTOR}` } }); await r.arrayBuffer(); codes.push(r.status); }
  ck(`[${MODE}] ${pages.length} pages loaded as a director (none broke)`, codes.every(c => c < 500), codes.join(','));
  ck(`[${MODE}] loading every page asked Meta nothing, in any mode (even Live)`, (await metaLog()).total === 0);
  // The database: loading pages never makes the Ads tables (the app's log has no mention), and only Ads code may use the store.
  const srcHit = execFileSync('grep', ['-rlE', 'ensureAdsTables|adsstore|adsdb|ads_campaigns', path.join(__dirname, '../../app'), path.join(__dirname, '../../lib')]).toString().split('\n').filter(f => f && !/lib\/ops\/ads[a-z]*\.js$|app\/api\/ops\/ads\/route\.js$/.test(f));
  ck(`[${MODE}] only Ads code uses the Ads store (lib/ops/ads*.js and the Ads route): no other page, API or library file (Ads PR 2: the store is used by Ads, and by nothing else)`, srcHit.length === 0, srcHit.join(' '));
  let traced = ''; try { traced = execFileSync('grep', ['-rlE', 'electric-sql', path.join(__dirname, '../../.next/server'), '--include=*.nft.json']).toString().trim(); } catch (e) { traced = ''; }
  ck(`[${MODE}] the build does not trace PGlite (a test tool) into any route`, traced === '', traced);
  const log = fs.readFileSync(path.join(__dirname, 'out/next.log'), 'utf8');
  ck(`[${MODE}] the app's log has no Ads database or Meta line, and no key`, !/ads_|ensureAds|\[meta-ads\]|mock-ads-token/.test(log));
  await b.close();
  console.log(bad ? `${bad} FAILED` : 'all ok'); process.exit(bad ? 1 : 0);
})();
