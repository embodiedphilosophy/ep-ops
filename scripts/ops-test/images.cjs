// Content → Social: the Image Library as two tabs, Art (no words on the picture) and Promo Images (words on it),
// and the post editor's picker offering Art only. The mock marks every 5th picture (kali-0, kali-5…) as has_text.
const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/lh3\.googleusercontent\.com|picsum\.photos/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' }));
    const api = async (q) => (await c.request.get('http://localhost:3100/api/ops/social?' + q)).json();
    const art = await api('view=art'), promo = await api('view=promo'), old = await api('view=images'), pick = await api('view=art&pick=1&q=kali-1');
    ok(art.total === 120 && promo.total === 30, `${vw}: Art ${art.total}, Promo Images ${promo.total} (expected 120 / 30)`);
    ok(old.total === art.total, `${vw}: old "images" link shows Art`);
    ok(!pick.rows.some(r => String(r.values.has_text).toUpperCase() === 'TRUE'), `${vw}: picker offers no Promo Images (${pick.rows.length} matches for kali-1)`);
    await p.goto('http://localhost:3100/ops/content?tab=social&s=promo', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const tabs = await p.locator('.ops-se nav a').allInnerTexts();
    ok(tabs.includes('Art') && tabs.includes('Promo Images') && !tabs.includes('Images'), `${vw}: tabs ${tabs.join(' | ')}`);
    ok(await p.locator('.ops-se-imgs li').count() === 30, `${vw}: Promo Images tab lists 30`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${vw}: no sideways scroll`);
    await p.screenshot({ path: `${__dirname}/out/images-promo-${vw}.png` });
    // the post editor's picker
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.locator('.ops-se-feed li').filter({ hasText: 'Proposed' }).first().locator('button').click();
    await p.locator('.ops-se-comp button:has-text("Choose from library")').click(); await p.waitForTimeout(1200);
    ok(await p.locator('.ops-se-picker button[title="kali-10.jpg"]').count() === 0 && await p.locator('.ops-se-picker button[title="kali-11.jpg"]').count() >= 0, `${vw}: picker leaves out kali-10 (has words)`);
    await p.fill('.ops-se-picker input', 'kali-15'); await p.waitForTimeout(1500);
    ok(await p.locator('.ops-se-picker ul.grid li:not(.morecell)').count() === 0, `${vw}: searching a Promo Image finds nothing in the picker`);
    await c.close();
  }
  ok(!errs.length, 'page errors: ' + (errs.join(' | ') || 'none')); await b.close();
})();
