// Before/after screenshots for the final sweep: the same pages at 1360 and 390 wide, GET only. Usage:
//   node scripts/ops-test/sweep-shots.cjs <outDir> <label>      then   python3 scripts/ops-test/sweep-diff.py <outDir> before after
const { chromium } = require('./pw.cjs');
const fs = require('fs');
const [,, outDir, label] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const PAGES = [['today', '/ops'], ['programs', '/ops/programs'], ['programs-cal', '/ops/programs?layout=calendar'], ['program', '/ops/programs/P-sadhana-fall-2026'], ['people', '/ops/people'], ['publish', '/ops/publish'], ['publish-social', '/ops/publish?show=social'], ['publish-review', '/ops/publish?view=review'], ['publish-library', '/ops/publish?view=library'], ['publish-compose', '/ops/publish?view=compose'], ['students', '/ops/students'], ['business', '/ops/business'], ['settings', '/ops/settings'], ['tasks', '/ops/tasks']];
(async () => {
  const b = await chromium.launch();
  for (const [vw, w, h] of [['1360', 1360, 900], ['390', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    await page.route('**/api/**', r => r.request().method() === 'GET' ? r.continue() : r.abort());
    for (const [name, p] of PAGES) {
      const res = await page.goto('http://localhost:3100' + p, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: `${outDir}/${label}-${name}-${vw}.png`, fullPage: true });
      console.log(vw, name, res.status(), overflow > 0 ? `H-OVERFLOW ${overflow}px` : 'ok');
    }
    await ctx.close();
  }
  await b.close();
})();
