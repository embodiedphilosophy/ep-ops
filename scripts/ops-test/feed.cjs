const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('**/api/**', r => r.request().method() === 'GET' || r.request().url().includes('/api/ops/social') ? r.continue() : r.abort());
    await p.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/><circle cx="200" cy="230" r="90" fill="#d9c6a4"/></svg>' }));
    await p.route('https://picsum.photos/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#4a6d8a"/></svg>' }));
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${__dirname}/out/feed-${vw}.png`, fullPage: true });
    console.log(vw, 'overflow:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), '| tiles:', await p.locator('.ops-se-feed li').count());
    await p.locator('.ops-se-feed li').filter({ hasText: 'Proposed' }).nth(1).locator('button').click(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${__dirname}/out/composer-${vw}.png` });
    if (vw === 'desktop') {
      await p.fill('#c-caption', 'Edited right in the feed.');
      console.log('save label:', await p.locator('.ops-se-comp button[type=submit]').innerText());
      await p.locator('.ops-se-comp button:has-text("Choose from library")').click(); await p.waitForTimeout(1200);
      await p.locator('.ops-se-picker button').nth(1).click();
      await p.screenshot({ path: `${__dirname}/out/composer-edited.png` });
      await p.locator('.ops-se-comp button[type=submit]').click(); await p.waitForTimeout(2000);
      console.log('msg:', await p.locator('.ops-se-comp .words > .hint').innerText().catch(() => '-'));
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      console.log('closed:', await p.locator('.ops-se-modal').count() === 0, '| first caption now:', await p.locator('.ops-se-feed .cap').first().innerText());
      await p.locator('.ops-se-feed button').nth(1).click(); await p.waitForTimeout(300);
      const w1 = await p.locator('.ops-se-comp .when').innerText();
      await p.locator('.ops-se-comp button[aria-label="Next post"]').click(); await p.waitForTimeout(300);
      console.log('next:', w1, '→', await p.locator('.ops-se-comp .when').innerText());
      const before = await p.locator('.ops-se-bar .pills').innerText();
      const appr = p.locator('.ops-se-comp .bar button:text-is("Approve")');
      if (await appr.count()) { await appr.click(); await p.waitForTimeout(2000); console.log('approve:', before, '→', await p.locator('.ops-se-bar .pills').innerText()); }
    } else {
      console.log('phone composer overflow:', await p.evaluate(() => document.querySelector('.ops-se-modal').scrollWidth - innerWidth));
      await p.locator('.ops-se-modal').evaluate(el => el.scrollTo(0, 99999)); await p.waitForTimeout(200);
      await p.screenshot({ path: `${__dirname}/out/composer-phone-bottom.png` });
    }
    await c.close();
  }
  console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
