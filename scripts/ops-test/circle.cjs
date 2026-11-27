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
  // the mock's dates move with today: find an upcoming Sādhana session and an upcoming standalone course on the index
  const f0 = await b.newContext(); await f0.addCookies([{ name: 'ep_ops', value: cookie.replace(/^ep_ops=/, ''), domain: 'localhost', path: '/' }]);
  const fp = await f0.newPage(); await fp.goto('http://localhost:3100/ops/programs'); await fp.waitForSelector('.pg-table');
  const keys = (await fp.locator('.pg-name').evaluateAll(a => a.map(x => decodeURIComponent(x.getAttribute('href').split('/').pop())))); await f0.close();
  const COURSES = keys.filter(k => /-event$/.test(k) && k >= '2026-12-03'), SS = COURSES[1];
  const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    const open = async key => {
      await page.goto(`http://localhost:3100/ops/programs/${key}?tab=circle`, { waitUntil: 'networkidle' });
      await page.waitForSelector('main.ops h3:has-text("Circle")');
      await page.waitForFunction(() => !document.querySelector('main.ops')?.textContent.includes('Checking Circle'), null, { timeout: 15000 });
    };
    // A second standalone course (the mock's Sādhana sessions are over): its panel offers the set-up, nothing is pushed
    await open(SS);
    const drawer = page.locator('main.ops');
    ok(await drawer.locator('button:has-text("Set up course in Circle")').count() === 1, `${vw}: the Circle tab offers the course set-up`);
    // A standalone course: set up its spaces first
    await open(COURSES[0]);
    await shot(page, `course-before-${vw}`);
    ok(await drawer.locator('button:has-text("Set up course in Circle")').count() === (vw === 'desktop' ? 1 : 0), `${vw}: course set-up button ${vw === 'desktop' ? 'shown before set-up' : 'gone after set-up'}`);
    if (vw === 'desktop') {
      await drawer.locator('button:has-text("Set up course in Circle")').click();
      await page.waitForSelector('main.ops .ops-note p', { timeout: 20000 });
      await page.waitForTimeout(800);
      await shot(page, `course-setup-${vw}`);
      await drawer.locator('button:has-text("Push to Circle")').click();
      await page.waitForFunction(() => document.querySelector('main.ops .ops-note')?.textContent.includes('lesson'), null, { timeout: 20000 });
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
