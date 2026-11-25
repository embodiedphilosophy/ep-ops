// Coming up & campaigns and Team & roles in a browser, desktop and phone width (needs run.sh). Mock only.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie.replace(/^ep_ops=/, ''), url: 'http://localhost:3100' }]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:3100/ops/social/campaigns'); await p.waitForSelector('[aria-label="Coming up"] li');
    if (name === 'desktop') {
      await p.locator('[aria-label="Coming up"] li').first().getByRole('button', { name: 'Campaign' }).click();
      await p.waitForSelector('text=Add 6 to the calendar as proposals'); await p.getByRole('button', { name: /Add 6 to the calendar/ }).click(); await p.waitForSelector('text=All on the calendar');
    } else await p.waitForSelector('text=Doors open');
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (over) { bad++; console.log('FAIL overflow', name); }
    await p.screenshot({ path: `${__dirname}/out/campaigns-${name}.png`, fullPage: true });
    await p.goto('http://localhost:3100/ops/social/team'); await p.waitForSelector('text=Who signs off on what');
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) { bad++; console.log('FAIL team overflow', name); }
    await p.screenshot({ path: `${__dirname}/out/team-${name}.png`, fullPage: true });
    if (errs.length) { bad++; console.log('FAIL page errors', errs); }
    console.log('ok', name); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
