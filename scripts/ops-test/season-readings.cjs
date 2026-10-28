// Ops → Settings → Sādhana School → "Reading assignments" (the Season Readings tab behind each season page's Readings tab).
// The tab is not in the mock sheet at first, so this covers "Create it" (which fills in Fall 2026 from data/season-readings-seed.json),
// the editor's kind menu and file field, and adding a reading. Writes go to the mock; check out/mock.log.
// Run: bash scripts/ops-test/run.sh, then node scripts/ops-test/season-readings.cjs
const { chromium } = require('./pw.cjs');
const assert = require('assert/strict');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:3100/ops/settings?t=sreadings', { waitUntil: 'networkidle' });
    const nav = await p.locator('.ops-set-nav a').allInnerTexts();
    assert.ok(nav.includes('Reading assignments'), 'listed in Settings: ' + nav);
    await p.getByText('isn’t in the calendar sheet yet').or(p.locator('button:text-is("Add a row")')).first().waitFor();
    if (await p.locator('button:text-is("Create it")').count()) { await p.locator('button:text-is("Create it")').click(); await p.waitForSelector('.ops-site-row', { timeout: 60000 }); }
    const rows = await p.locator('.ops-site-row').allInnerTexts();
    assert.equal(rows.length >= 39, true, vw + ': Fall 2026 is filled in: ' + rows.length);
    assert.ok(rows.some(r => /session 2 · session/.test(r) && /self-display/.test(r)), 'week 2 heading row');
    await p.screenshot({ path: `${__dirname}/out/season-readings-${vw}.png` });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, true, vw + ': sideways scroll');
    if (vw === 'desktop') {
      await p.locator('button:has-text("Add a row")').click();
      await p.fill('#s-season', 'fall-2026'); await p.fill('#s-session', '3');
      await p.selectOption('#s-kind', 'suggested');
      await p.fill('#s-title', 'Isabelle Ratié, On recognition'); await p.fill('#s-pages', 'pp. 3–19');
      assert.equal(await p.locator('.ops-file label.chip').count(), 1, 'the file field offers an upload');
      await p.fill('#s-file_url', 'https://example.test/ratie.pdf');
      await p.screenshot({ path: `${__dirname}/out/season-readings-add.png` });
      await p.locator('button:text-is("Add")').click(); await p.waitForTimeout(1500);
      assert.ok((await p.locator('.ops-site-row').allInnerTexts()).some(r => /Ratié/.test(r)), 'new reading added');
    }
    await c.close();
  }
  await b.close();
  assert.deepEqual(errs, [], 'page errors');
  console.log('season readings settings: ok');
})().catch(e => { console.error(e); process.exit(1); });
