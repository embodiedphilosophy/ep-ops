// Teachers & Email phase 3 in a browser: reminder rules (edit, audience, switch on, make now) and the newsletter (list, start an issue, verse, save, build, schedule). Desktop and phone. Mock Kit only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1360, height: 1000 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = [], dl = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dl.push(d.message()); d.accept(); });
    const noScroll = async n => ck(`${name}: no sideways scroll (${n})`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.goto(U + '/ops/email/reminders'); await p.waitForSelector('[aria-label="Rules"] li');
    ck(`${name}: five rules, listed off`, await p.locator('[aria-label="Rules"] > ul > li').count() === 5);
    ck(`${name}: Student reminders is a Settings tab`, (await p.locator('nav[aria-label="settings views"]').innerText()).includes('Student reminders'));
    ck(`${name}: Handled elsewhere explains Meditation Mondays`, await p.locator('text=Kit’s own automation sends this').count() === 1);
    await noScroll('reminders');
    if (name === 'desktop') {
      const li = p.locator('[aria-label="Rules"] > ul > li').first();
      await li.getByRole('switch').click(); await p.waitForSelector('text=Choose who gets it');
      ck('desktop: switching on with no audience is refused in plain words', true);
      await li.getByRole('button', { name: 'Edit' }).click();
      await li.locator('select[aria-label="Add a group"]').selectOption({ index: 1 }); await li.getByRole('button', { name: 'Save' }).click(); await p.waitForSelector('text=Saved.');
      await li.getByRole('switch').click(); await p.waitForFunction(() => document.querySelector('[role=switch]')?.checked);
      await p.waitForSelector('[aria-label^="Coming up for"] .gchip');
      ck('desktop: the rule lists what it will make', await p.locator('text=Will be made').count() > 0);
      await li.getByRole('button', { name: 'Make them now' }).click(); await p.waitForSelector('text=/\\d+ made, \\d+ skipped/');
      ck('desktop: Make them now asked first and made drafts', dl.some(m => m.includes('Nothing is sent right now')));
      await p.screenshot({ path: `${__dirname}/out/email-reminders-${name}.png`, fullPage: true });
    } else await p.screenshot({ path: `${__dirname}/out/email-reminders-${name}.png`, fullPage: true });
    await p.goto(U + '/ops/email/newsletter'); await p.waitForSelector('[aria-label="Issues"] li');
    ck(`${name}: issues are numbered by what went out`, await p.locator('text=No. 1').count() > 0 && await p.locator('text=No. 2').count() > 0);
    ck(`${name}: an unsent past issue is Skipped`, await p.locator('.gchip.bad', { hasText: 'Skipped' }).count() > 0);
    await noScroll('newsletter');
    if (name === 'desktop') {
      await p.getByRole('button', { name: /^Start / }).click(); await p.waitForURL(/newsletter\?date=/); await p.waitForSelector('text=Sanskrit verse');
      ck('desktop: a new issue is made in Ops with a number', await p.locator('h1', { hasText: /No\. \d/ }).count() === 1);
      await p.locator('select[aria-label="Choose a verse"]').selectOption({ index: 1 }); await p.waitForSelector('text=Verse added.'); await p.waitForSelector('[lang=sa]');
      ck('desktop: the verse is copied with its Devanagari', (await p.locator('[lang=sa]').innerText()).includes('ॐ'));
      const field = l => p.locator(`.em-f:has(.cap:text-is("${l}"))`);
      await field('Subject').locator('input').fill('Beginning again'); await field('Reflection').locator('textarea').fill('What stays when everything moves.');
      await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForSelector('text=Saved.');
      await p.getByRole('button', { name: 'Save draft to Kit' }).click(); await p.waitForSelector('text=Kit draft made.');
      ck('desktop: building the Kit draft asked first', dl.some(m => m.includes('Nothing is scheduled or sent')));
      await p.getByRole('button', { name: /Schedule for Sunday/ }).click(); await p.waitForSelector('[role=dialog]');
      ck('desktop: schedule dialog says Sunday 9:00 ET and who gets it', (await p.locator('[role=dialog]').innerText()).includes('9:00 ET'));
      await p.screenshot({ path: `${__dirname}/out/email-newsletter-${name}.png`, fullPage: true });
      const needs = await p.locator('[role=dialog] input').count(); if (needs) await p.locator('[role=dialog] input').fill('Jake read it');
      await p.getByRole('button', { name: 'Schedule it' }).click(); await p.waitForSelector('text=Scheduled in Kit.');
      ck('desktop: scheduled', true);
    } else {
      await p.locator('[aria-label="Issues"] a', { hasText: 'View' }).first().click(); await p.waitForSelector('text=Sanskrit verse'); await noScroll('issue');
      await p.screenshot({ path: `${__dirname}/out/email-newsletter-${name}.png`, fullPage: true });
    }
    ck(`${name}: no page errors`, !errs.length); if (errs.length) console.log(errs); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
