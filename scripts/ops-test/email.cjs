const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch();
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage();
    await p.goto('http://localhost:3100/ops/content?tab=email', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
    await p.screenshot({ path: `${__dirname}/out/email-${vw}.png`, fullPage: true });
    console.log(vw, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    if (vw === 'desktop') console.log((await p.locator('main section').first().innerText()).slice(0, 1500));
    await c.close();
  }
  await b.close();
})();
