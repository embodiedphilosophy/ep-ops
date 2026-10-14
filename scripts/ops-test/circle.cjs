// Events drawer → Circle panel: status per session, "Set up course in Circle" and "Push to Circle".
// Needs the mock with Circle writes on and the app allowed to write to (mock) Circle:
//   source scripts/ops-test/env.sh && export CIRCLE_EVENT_SYNC=live MOCK_CIRCLE_WRITES=1, then start mock + app
//   node scripts/ops-test/circle.cjs        (screenshots in out/, Circle writes in out/mock.log as CIRCLE WRITE)
const { chromium } = require('./pw.cjs');
const fs = require('fs');
const out = __dirname + '/out';
const cookie = fs.readFileSync(out + '/cookie.txt', 'utf8').trim();
const shot = (page, n) => page.screenshot({ path: `${out}/circle-${n}.png` });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  let fails = 0;
  const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    const open = async key => {
      await page.goto(`http://localhost:3100/ops/events?all=1&event=${key}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.ops-drawer h3:has-text("Circle")');
      await page.waitForFunction(() => !document.querySelector('.ops-drawer')?.textContent.includes('Checking Circle'), null, { timeout: 15000 });
    };
    // A Sādhana School session: its event goes in the existing space
    await open('2026-10-28-ss');
    const drawer = page.locator('.ops-drawer');
    await shot(page, `ss-before-${vw}`);
    ok(await drawer.locator('button:has-text("Push to Circle")').count() === 1, `${vw}: SS drawer has Push to Circle`);
    if (vw === 'desktop') {
      await drawer.locator('button:has-text("Push to Circle")').click();
      await page.waitForSelector('.ops-drawer .ops-note p', { timeout: 20000 });
      await page.waitForTimeout(800);
      await shot(page, `ss-after-${vw}`);
      ok((await drawer.textContent()).includes('Live in Circle'), 'SS session shows Live in Circle after the push');
    }
    // A standalone course: set up its spaces first
    await open('2026-11-14-event');
    await shot(page, `course-before-${vw}`);
    ok(await drawer.locator('button:has-text("Set up course in Circle")').count() === (vw === 'desktop' ? 1 : 0), `${vw}: course set-up button ${vw === 'desktop' ? 'shown before set-up' : 'gone after set-up'}`);
    if (vw === 'desktop') {
      await drawer.locator('button:has-text("Set up course in Circle")').click();
      await page.waitForSelector('.ops-drawer .ops-note p', { timeout: 20000 });
      await page.waitForTimeout(800);
      await shot(page, `course-setup-${vw}`);
      await drawer.locator('button:has-text("Push to Circle")').click();
      await page.waitForFunction(() => document.querySelector('.ops-drawer .ops-note')?.textContent.includes('lessons'), null, { timeout: 20000 });
      await page.waitForTimeout(800);
      await shot(page, `course-after-${vw}`);
      ok((await drawer.textContent()).includes('Live in Circle'), 'course sessions live after the push');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `${vw}: no sideways scroll (${overflow}px)`);
    ok(!errs.length, `${vw}: no page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
