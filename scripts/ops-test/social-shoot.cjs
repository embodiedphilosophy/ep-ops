// Screenshots of the Social workspace pages (desktop and phone) and a check for sideways scroll, errors and dead links. Mock only.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
const PAGES = ['social', 'social/review', 'social/compose', 'social/compose?row=13', 'social/library', 'social/library?s=promo', 'social/sources', 'social/published', 'social/rules'];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [vw, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: ck('jacob@embodiedphilosophy.com'), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('https://lh3.googleusercontent.com/**', pic); await p.route(/picsum/, pic);
    for (const pg of PAGES) {
      const r = await p.goto('http://localhost:3100/ops/' + pg, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
      const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      const name = pg.replace(/[^a-z]+/g, '-');
      await p.screenshot({ path: `${O}/soc-${name}-${vw}.png`, fullPage: true });
      console.log(vw, pg, r.status(), over ? 'OVERFLOW' : 'ok', errs.length ? errs.splice(0) : '');
      if (r.status() !== 200 || over) bad++;
    }
    await c.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
