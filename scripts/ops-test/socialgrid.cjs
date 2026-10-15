// Content → Social: type strip and filter, grid preview (swap by buttons), Published grid, picker "used" badges, hashtag warning.
const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/><circle cx="200" cy="230" r="90" fill="#d9c6a4"/></svg>';
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('**/api/**', r => r.request().method() === 'GET' || r.request().url().includes('/api/ops/social') ? r.continue() : r.abort());
    await p.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }));
    await p.route('https://picsum.photos/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }));
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    console.log(vw, 'type chips:', await p.locator('.ops-se-types .chip').count(), '| tags on tiles:', await p.locator('.ops-se-feed .tag').count());
    await p.locator('.ops-se-types .chip', { hasText: 'Practice' }).first().click(); await p.waitForTimeout(300);
    console.log(' filtered tiles:', await p.locator('.ops-se-feed li').count());
    await p.locator('.ops-se-types .chip', { hasText: 'All types' }).click();
    await p.locator('.ops-se-mode button', { hasText: 'Grid preview' }).click(); await p.waitForTimeout(500);
    const tiles = await p.locator('.ops-se-gridprev ul.g3').first().locator('li').count();
    console.log(' grid tiles upcoming:', tiles, '| already out:', await p.locator('.ops-se-gridprev ul.done li').count(), '| overflow:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await p.screenshot({ path: `${__dirname}/out/grid-${vw}.png`, fullPage: true });
    if (vw === 'desktop') {
      const first = p.locator('.ops-se-gridprev ul.g3').first().locator('li .st');
      const before = await first.allInnerTexts();
      await p.locator('.ops-se-gridprev .mv button:has-text("Earlier")').first().click(); await p.waitForTimeout(1500);
      console.log(' swap:', before.slice(0, 2).join(' | '), '→', (await first.allInnerTexts()).slice(0, 2).join(' | '), '|', await p.locator('.ops-se-bar .hint').innerText().catch(() => ''));
      await p.locator('.ops-se-gridprev ul.g3').first().locator('li button').first().click(); await p.waitForTimeout(400);
      await p.fill('#c-hashtags', '#a #b #c #d #e #f');
      console.log(' hashtag warning:', await p.locator('.warnline').innerText().catch(() => 'MISSING'));
      await p.locator('.ops-se-comp button:has-text("Choose from library")').click(); await p.waitForTimeout(1200);
      console.log(' used tags in picker:', await p.locator('.ops-se-picker .usedtag').count());
      await p.screenshot({ path: `${__dirname}/out/grid-composer.png` });
      await p.keyboard.press('Escape');
    }
    await p.locator('.ops-se-site-tabs a, .ops-site-tabs a', { hasText: 'Published' }).first().click().catch(async () => p.goto('http://localhost:3100/ops/content?tab=social&s=history'));
    await p.waitForTimeout(1500);
    console.log(' published tiles:', await p.locator('.ops-se-pubgrid li').count(), '| overflow:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await p.screenshot({ path: `${__dirname}/out/published-${vw}.png`, fullPage: true });
    await c.close();
  }
  console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
