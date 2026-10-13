const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' }));
    await p.route('https://picsum.photos/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#4a6d8a"/></svg>' }));
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    const tiles = await p.locator('.ops-se-feed li').count();
    await p.locator('.ops-se-bar button:text-is("New post")').click(); await p.waitForTimeout(300);
    if (vw === 'phone') { await p.screenshot({ path: `${__dirname}/out/newpost-phone.png` }); await c.close(); continue; }
    // empty add is refused
    await p.locator('.ops-se-comp button:text-is("Add as proposed")').click(); await p.waitForTimeout(800);
    console.log('refused:', await p.locator('.ops-se-comp .row.bad label').allInnerTexts(), '|', await p.locator('.ops-se-comp .media > .hint').allInnerTexts());
    await p.fill('#c-caption', 'Nine nights of the Goddess.');
    await p.locator('button:text-is("Insert a snippet")').click(); await p.waitForTimeout(1000);
    await p.locator('.ops-se-ins button').first().click();
    await p.locator('button:text-is("Insert a quote")').click(); await p.waitForTimeout(1000);
    console.log('quotes offered:', await p.locator('.ops-se-ins li').count());
    await p.locator('.ops-se-ins button').first().click();
    console.log('caption now:', JSON.stringify(await p.inputValue('#c-caption')));
    await p.fill('#c-linked_event', 'Song of the Goddess — 2026-10-11');
    await p.locator('.ops-se-comp .upl input').setInputFiles(__dirname + '/out/upload-test.png'); await p.waitForTimeout(2500);
    await p.locator('button:has-text("Use this crop")').click(); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${__dirname}/out/newpost-desktop.png` });
    await p.locator('.ops-se-comp button:text-is("Add and approve")').click(); await p.waitForTimeout(2500);
    console.log('modal closed:', await p.locator('.ops-se-modal').count() === 0, '| bar:', await p.locator('.ops-se-bar .hint').innerText().catch(() => '-'), '| tiles', tiles, '→', await p.locator('.ops-se-feed li').count());
    await c.close();
  }
  console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
