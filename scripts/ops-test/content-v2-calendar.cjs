// Calendar (Week / Month), day categories and drag to reschedule. Mock only. Start from a fresh run.sh.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const secret = require('fs').readFileSync(O + '/ops_secret', 'utf8').trim();
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: secret } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const mk = async (email, w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.addCookies([{ name: 'ep_ops', value: ck(email), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.route('https://lh3.googleusercontent.com/**', pic); return p; };
  const go = async p => { await p.goto('http://localhost:3100/ops/content?tab=social&s=calendar', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); };

  let p = await mk('carolyn@example.com', 1366, 900); await go(p);
  t('week shows 7 days', await p.locator('.ops-cal-grid.week .day').count() === 7);
  t('posts appear as cards', await p.locator('.ops-cal-grid .post').count() > 0);
  t('open feed slot shown on an empty future day', await p.locator('.ops-cal-grid .slot').count() > 0);

  // day categories: Carolyn is a Publisher (not an approver) so she can't edit; Jacob can
  t('Publisher has no category editor', await p.locator('button:text-is("Edit day categories")').count() === 0);
  await p.close();
  p = await mk('jacob@embodiedphilosophy.com', 1366, 900); await go(p);
  await p.locator('button:text-is("Edit day categories")').click();
  const sels = p.locator('.ops-cal-cats select'); t('a dropdown per weekday', await sels.count() === 7);
  // pick the weekday of the first future day in view that has a Proposed post
  const target = p.locator('.ops-cal-grid .day:not(.today) .post.s-Proposed').first().locator('xpath=ancestor::div[contains(@class,"day")]');
  const idx = await p.evaluate(() => [...document.querySelectorAll('.ops-cal-grid .day')].findIndex(d => d.querySelector('.post.s-Proposed') && !d.classList.contains('today')));
  const pillar = await p.locator('.ops-cal-grid .day').nth(idx).locator('.post').first().evaluate(() => '');
  await sels.nth(idx).selectOption('Quote on an image'); await p.waitForTimeout(1800);
  const sl = await p.locator('.ops-cal-grid .day').nth(idx).locator('.sl').innerText().catch(() => '');
  t('day shows a fill state after setting a category', /Filled|Not filled|Missed/.test(sl), sl);
  t('category label on the day', /Quote on an image/.test(await p.locator('.ops-cal-grid .day').nth(idx).locator('.cat').innerText().catch(() => '')));
  // this week only
  await p.locator('input[name=scope]').nth(1).check(); await sels.nth(idx).selectOption('Teacher video'); await p.waitForTimeout(1800);
  t('this-week override wins', /Teacher video/.test(await p.locator('.ops-cal-grid .day').nth(idx).locator('.cat').innerText()));
  await p.screenshot({ path: O + '/v2cal-week-desktop.png' });

  // drag a proposed post to the last day of the week that is today or later
  const from = p.locator('.ops-cal-grid .post.s-Proposed[draggable=true]').first();
  const fromDay = await p.evaluate(() => { const d = document.querySelector('.ops-cal-grid .post.s-Proposed[draggable=true]').closest('.day'); return [...document.querySelectorAll('.ops-cal-grid .day')].indexOf(d); });
  const toIdx = 6 === fromDay ? 5 : 6;
  const before = await p.locator('.ops-cal-grid .day').nth(toIdx).locator('.post').count();
  await p.locator('button:text-is("Edit day categories")').click(); await from.scrollIntoViewIfNeeded(); await from.dragTo(p.locator('.ops-cal-grid .day').nth(toIdx)); await p.waitForTimeout(2500);
  const msg = await p.locator('.ops-se-bar .hint').innerText().catch(() => '');
  t('drag reschedules (or says why not)', /Moved to|Pick today/.test(msg), msg);
  if (/Moved to/.test(msg)) t('the post is now on the new day', await p.locator('.ops-cal-grid .day').nth(toIdx).locator('.post').count() === before + 1);

  // month view
  await p.locator('button:text-is("Month")').click(); await p.waitForTimeout(500);
  t('month shows 42 cells', await p.locator('.ops-cal-grid.month .day').count() === 42);
  await p.screenshot({ path: O + '/v2cal-month-desktop.png' });
  await p.locator('.ops-cal-grid.month .more:has-text("post")').first().click(); await p.waitForTimeout(500);
  t('clicking a day opens its week', await p.locator('.ops-cal-grid.week .day').count() === 7);
  await p.close();

  // API: a creator can't change day categories
  const r = execSync(`curl -s -H "Cookie: ep_ops=${ck('cleo@example.com')}" -H 'Content-Type: application/json' -X POST http://localhost:3100/api/ops/social -d '{"view":"plan","dayCategory":{"weekday":"Monday","category":"x","scope":"standing"}}'`).toString();
  t('creator refused on day categories', /Only editors/.test(r), r.slice(0, 80));

  // phone
  p = await mk('jacob@embodiedphilosophy.com', 390, 844); await go(p);
  t('phone: no sideways scroll (week)', !(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await p.screenshot({ path: O + '/v2cal-week-phone.png' });
  await p.locator('button:text-is("Month")').click(); await p.waitForTimeout(500);
  t('phone: no sideways scroll (month)', !(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
