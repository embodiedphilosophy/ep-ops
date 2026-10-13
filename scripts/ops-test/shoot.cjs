const { chromium } = require('./pw.cjs');
const fs = require('fs');
const [,, outDir, label] = process.argv;
const cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const pages = JSON.parse(fs.readFileSync(__dirname + '/pages.json', 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: vw === 'phone' ? 2 : 1 });
    await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    // Failed loads by address; outside hosts the sandbox can't reach (images, fonts) are noise, not bugs
    // Known local-only noise: Vercel Analytics (exists only on Vercel) and images proxied from report.embodiedphilosophy.com
    const NOISE = /\/_vercel\/insights|\/kalighat\//;
    page.on('response', r => { if (r.status() >= 400 && !NOISE.test(r.url())) errs.push(`${r.status()} ${r.url().replace('http://localhost:3100', '').slice(0, 120)}`); });
    page.on('requestfailed', r => { if (r.url().startsWith('http://localhost') && !NOISE.test(r.url())) errs.push(`failed ${r.url().slice(0, 120)}`); });
    // Never let the browser trigger writes
    await page.route('**/api/**', r => r.request().method() === 'GET' ? r.continue() : (errs.push('blocked ' + r.request().url()), r.abort()));
    for (const [name, path] of pages) {
      errs.length = 0;
      const res = await page.goto('http://localhost:3100' + path, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (name.startsWith('drawer')) await page.screenshot({ path: `${outDir}/${label}-${name}-${vw}.png` });
      else await page.screenshot({ path: `${outDir}/${label}-${name}-${vw}.png`, fullPage: true });
      if (name === 'admin') try { await page.click('.ops-tasks .more', { timeout: 2000 }); await page.waitForTimeout(200); const el = await page.$('.ops-tasks li:has(.ops-act)'); await el.screenshot({ path: `${outDir}/${label}-actions-${vw}.png` }); } catch {}
      console.log(vw, name, res.status(), page.url().replace('http://localhost:3100', ''), overflow > 0 ? `H-OVERFLOW ${overflow}px` : '', errs.join(' | '));
    }
    await ctx.close();
  }
  await b.close();
})();
