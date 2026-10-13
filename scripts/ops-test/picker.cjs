// The post editor's image picker: lists every reusable picture (paged 60 at a time), scrolls inside the editor
const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/lh3\.googleusercontent\.com|picsum\.photos/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' }));
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.locator('.ops-se-feed li').filter({ hasText: 'Proposed' }).first().locator('button').click();
    await p.locator('.ops-se-comp button:has-text("Choose from library")').click(); await p.waitForTimeout(1200);
    const count = () => p.locator('.ops-se-picker ul.grid li:not(.morecell)').count();
    console.log(vw, 'first page:', await count(), '|', await p.locator('.ops-se-picker > .hint').innerText());
    const g = p.locator('.ops-se-picker ul.grid');
    console.log('scrolls inside:', await g.evaluate(e => e.scrollHeight > e.clientHeight));
    await g.evaluate(e => e.scrollTo(0, e.scrollHeight));
    await p.locator('.ops-se-picker .morecell button').click(); await p.waitForTimeout(1200);
    console.log('after Show more:', await count(), '|', await p.locator('.ops-se-picker > .hint').innerText());
    await p.screenshot({ path: `${__dirname}/out/picker-${vw}.png` });
    await p.fill('.ops-se-picker input', 'kali-14'); await p.waitForTimeout(1500);
    console.log('search kali-14:', await count(), '| hidden IMG6 offered:', await p.locator('.ops-se-picker button[title="kali-6.jpg"]').count());
    await c.close();
  }
  console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
