// Teachers & Email phase 4b in a browser: directory, review queue (diff, approve), a profile with headshot crops, desktop and phone. Mock only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1360, height: 1000 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = [], dl = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dl.push(d.message()); d.accept(); });
    const noScroll = async n => ck(`${name}: no sideways scroll (${n})`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.goto(U + '/ops/content?tab=review'); ck(`${name}: the old Review tab lands on the Teachers review queue`, p.url().includes('/ops/email/teachers?tab=review'));
    await p.waitForSelector('[aria-label="Bios waiting"]');
    ck(`${name}: the sidebar has Teachers and no longer has Site copy review`, (await p.locator('.ops-side').innerText()).includes('Teachers') && !(await p.locator('.ops-side').innerText()).includes('Site copy review'));
    await p.waitForSelector('.em-diff .add'); ck(`${name}: a change shows added words against what is live`, await p.locator('.em-diff .add').count() > 0);
    ck(`${name}: course pages are in the queue now`, await p.locator('[aria-label="Course pages"]').count() === 1);
    await noScroll('review'); await p.screenshot({ path: `${__dirname}/out/email-teachers-review-${name}.png`, fullPage: true });
    if (name === 'desktop') {
      const li = p.locator('[aria-label="Bios waiting"] li', { hasText: 'Abha' });
      await li.getByRole('button', { name: 'Approve for the website' }).click(); await p.waitForSelector('text=Abha Rajbhandari is live on the website.');
      ck('desktop: approving asked first and put her live', dl.some(m => m.includes('on the website')));
    }
    await p.goto(U + '/ops/email/teachers'); await p.waitForSelector('[aria-label="Directory"] li');
    ck(`${name}: the directory shows who needs what`, await p.locator('.gchip', { hasText: 'Needs update' }).count() > 0 && (name === 'phone' || await p.locator('.gchip', { hasText: 'Looks like a test entry' }).count() === 1)); // the phone run comes after the desktop run hid the test entry
    if (name === 'desktop') {
      await p.getByRole('button', { name: /^Test entries/ }).click(); ck('desktop: the test filter lists one', await p.locator('[aria-label="Directory"] > ul > li').count() === 1); await p.getByRole('button', { name: 'Clear out the test entries' }).click(); await p.waitForSelector('text=Test entries hidden.'); ck('desktop: clearing out asked and said nothing is deleted', dl.some(m => m.includes('not deleted'))); }
    await noScroll('directory');
    await p.goto(U + '/ops/email/teachers?email=nataraj%40example.com'); await p.waitForSelector('[aria-label="Headshot"] img');
    await p.waitForFunction(() => [...document.querySelectorAll('[aria-label="Headshot"] .em-crops img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
    ck(`${name}: all three crops load`, await p.locator('[aria-label="Headshot"] .em-crops img').count() === 3);
    ck(`${name}: publish targets are shown, Circle as copy-by-hand`, (await p.locator('[aria-label="Where this appears"]').innerText()).includes('Copy by hand'));
    ck(`${name}: the stale bio is flagged`, await p.locator('text=Ask them to refresh it').count() === 1);
    await noScroll('profile'); await p.screenshot({ path: `${__dirname}/out/email-teachers-profile-${name}.png`, fullPage: true });
    ck(`${name}: no page errors`, !errs.length); if (errs.length) console.log(errs); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
