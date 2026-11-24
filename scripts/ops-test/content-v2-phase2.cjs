// Phase 2 in a browser: rhythm + week-ahead cards on the Plan, Review & approve (exact count, reason for flags, blocked can't be ticked), Health. Mock only.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [vw, size] of [['desktop', [1366, 900]], ['phone', [390, 844]]]) {
    const c = await b.newContext({ viewport: { width: size[0], height: size[1] } });
    await c.addCookies([{ name: 'ep_ops', value: ck('carolyn@example.com'), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('https://lh3.googleusercontent.com/**', pic); await p.route('https://picsum.photos/**', pic);
    const go = async s => { await p.goto('http://localhost:3100/ops/content?tab=social&s=' + s, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); };
    await go('plan');
    t(`${vw}: week-ahead card`, /of the next 7 days/.test(await p.locator('.ops-rhythm .card').first().innerText()), (await p.locator('.ops-rhythm .card').first().innerText()).replace(/\n/g, ' '));
    t(`${vw}: rhythm card`, await p.locator('.ops-rhythm .card').count() === 2);
    await go('review');
    const n = await p.locator('.ops-rev-list li').count(); t(`${vw}: review lists proposed posts`, n > 0, String(n));
    t(`${vw}: blocked can't be ticked`, await p.locator('.ops-rev-list li.blocked input:disabled').count() === await p.locator('.ops-rev-list li.blocked').count());
    if (vw === 'desktop') {
      await p.locator('.ops-rev-list li:not(.blocked) input').first().check();
      const label = await p.locator('.ops-se-bar button.primary').innerText(); t('button shows the exact count', /^Approve 1 post$/.test(label), label);
      const flagged = p.locator('.ops-rev-list li:has(.gchip.flag):not(.blocked) input'); 
      if (await flagged.count()) { await flagged.first().check(); t('flagged tick asks for a reason', await p.locator('.ops-rev-list .why').count() === 1 && await p.locator('.ops-se-bar button.primary').isDisabled()); await p.fill('.ops-rev-list .why', 'Cleared by Floss'); t('reason enables approve', await p.locator('.ops-se-bar button.primary').isEnabled()); }
      await p.screenshot({ path: O + '/v2p2-review-desktop.png' });
      await p.locator('.ops-se-bar button.primary').click(); await p.waitForTimeout(2500);
      t('approved message', /approved/.test(await p.locator('.ops-se-bar .hint').last().innerText()), await p.locator('.ops-se-bar .hint').last().innerText());
    } else await p.screenshot({ path: O + '/v2p2-review-phone.png' });
    await go('health');
    t(`${vw}: health lists items`, await p.locator('.ops-health li').count() > 0);
    const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1); t(`${vw}: no sideways scroll on health`, !over);
    if (vw === 'phone') { await go('plan'); t('phone: no sideways scroll on plan', !(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))); await p.screenshot({ path: O + '/v2p2-plan-phone.png' }); }
    await c.close();
  }
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
