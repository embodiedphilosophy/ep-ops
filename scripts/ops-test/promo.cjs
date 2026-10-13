// Publish → Email: write a planned promo email (makes the Promo Emails tab), preview it, build its Kit draft,
// add an extra email and delete it, mark a planned one "Not needed" and bring it back. Desktop, then phone.
// Writes go to the mock; check out/mock.log (ADDED TAB, WROTE, KIT DRAFT CREATED).
const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const URL = 'http://localhost:3100/ops/content?tab=email';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await c.newPage();
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  const first = p.locator('.ops-promo > li').first();
  const id = (await first.locator('.id').innerText()).replace(/[\[\]]/g, '');
  console.log('event', id);

  // 1. Write the planned email
  await first.locator('.acts .chip', { hasText: 'Edit' }).first().click();
  const f = first.locator('form.ops-promo-form');
  ok(await f.locator('input[id$="-Email"]').isDisabled(), 'planned email keeps its name');
  await f.locator('input[id$="-Subject"]').fill('Join us for the lecture');
  await f.locator('textarea[id$="-Body"]').fill('A first paragraph.\n\nA second paragraph.');
  await f.locator('input[id$="-Button-URL"]').fill('not a link');
  await f.locator('button[type=submit]').click(); await p.waitForTimeout(800);
  ok(/https/.test(await f.locator('.row.bad .hint').innerText().catch(() => '')), 'bad link is refused with a reason');
  await f.locator('input[id$="-Button-URL"]').fill('https://example.com/register');
  await f.locator('button[type=submit]').click();
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  ok(await first.locator('.what .subj', { hasText: 'Join us for the lecture' }).count() === 1, 'saved subject shows in the list');

  // 2. Preview + build
  await first.locator('.acts .chip', { hasText: 'Edit' }).first().click();
  const f2 = first.locator('form.ops-promo-form');
  const href = await f2.locator('a', { hasText: 'Preview' }).getAttribute('href');
  const prev = await c.request.get('http://localhost:3100' + href);
  const html = await prev.text();
  ok(prev.ok() && html.includes('A second paragraph.') && html.includes('example.com/register'), 'preview renders the email');
  await f2.locator('button', { hasText: 'Build Kit draft' }).click(); await p.waitForTimeout(2500);
  ok(/Draft created/.test(await f2.locator('.ops-news-out').innerText().catch(() => '')), 'Kit draft built');
  await f2.locator('button', { hasText: 'Cancel' }).click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);

  // 3. Add another, then delete it
  await first.locator('.add .chip').click();
  const f3 = first.locator('form.ops-promo-form');
  await f3.locator('input[id$="-Subject"]').fill('Last call');
  await f3.locator('button[type=submit]').click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  ok(await first.locator('.line .tag', { hasText: 'added' }).count() === 1, 'added email shows');
  const before = await first.locator('ol > li').count();
  await first.locator('.chip.danger', { hasText: 'Delete' }).click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  ok(await first.locator('ol > li').count() === before - 1, 'added email deleted');

  // 4. Not needed / bring back on the next event
  const second = p.locator('.ops-promo > li').nth(1);
  await second.locator('.chip', { hasText: 'Not needed' }).first().click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  ok(await second.locator('li.skip').count() === 1 && /0 of 0/.test(await second.locator('.h .n').innerText()), 'planned email marked not needed');
  await second.locator('.chip', { hasText: 'Bring back' }).click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  ok(await second.locator('li.skip').count() === 0, 'brought back');
  await p.screenshot({ path: `${__dirname}/out/promo-desktop.png`, fullPage: true });

  // 5. Phone: list and open form fit
  const ph = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ph.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const q = await ph.newPage();
  await q.goto(URL, { waitUntil: 'networkidle' });
  await q.locator('.ops-promo > li').first().locator('.acts .chip', { hasText: 'Edit' }).first().click(); await q.waitForTimeout(500);
  ok(await q.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'no sideways scroll on a phone with the form open');
  await q.screenshot({ path: `${__dirname}/out/promo-phone.png`, fullPage: true });
  await b.close();
})();
