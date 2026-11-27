// Teachers & Email phase 1 in a browser: This week, Emails (filters, attach with confirm, put away), Programming panel, phone width. Mock only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await p.goto(U + '/ops/content'); ck(`${name}: the old Content address lands on Publish`, new URL(p.url()).pathname === '/ops/publish'); await p.goto(U + '/ops/email'); ck(`${name}: the old This week address lands on the This week view`, p.url().includes('view=week'));
    await p.waitForSelector('text=Needs attention'); await p.waitForSelector('text=On this week');
    ck(`${name}: Publish is in the sidebar and has the Emails tab`, (await p.locator('.ops-side').innerText()).includes('Publish') && (await p.locator('nav[aria-label="publish views"]').innerText()).includes('Emails'));
    ck(`${name}: Kit banner shows connected`, await p.locator('text=Kit is connected').count() > 0);
    await p.getByRole('button', { name: /Show Programming/ }).click(); await p.waitForSelector('aside[aria-label="Programming"] li');
    ck(`${name}: Programming panel lists events`, await p.locator('aside[aria-label="Programming"] li').count() > 0);
    ck(`${name}: no sideways scroll (This week)`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.screenshot({ path: `${__dirname}/out/email-week-${name}.png`, fullPage: true });
    await p.goto(U + '/ops/email/emails?show=unlinked'); await p.waitForSelector('text=Road to Resolution ' + (name === 'desktop' ? '1' : '2'));
    ck(`${name}: Not matched filter opens from the link`, await p.locator('[aria-pressed="true"]', { hasText: 'Not matched' }).count() === 1);
    if (name === 'desktop') {
      const row = p.locator('.em-row', { hasText: 'Road to Resolution 1' });
      await row.locator('select').selectOption({ label: /Meditation Resolution/.source ? undefined : undefined }).catch(() => {});
      const opt = await row.locator('select option', { hasText: 'Meditation Resolution' }).first().getAttribute('value');
      await row.locator('select').selectOption(opt); await row.getByRole('button', { name: 'Attach' }).click();
      await p.waitForSelector('text=Matched to Meditation Resolution');
      ck('desktop: attach asked for a confirm that names Kit', dialogs.some(m => m.includes('internal description in Kit')));
      await p.getByRole('button', { name: /^To tidy/ }).click(); await p.waitForSelector('text=Old draft');
      await p.locator('input[type=checkbox]').first().check(); await p.getByRole('button', { name: /Put away 1 selected/ }).click();
      await p.waitForSelector('text=1 put away'); ck('desktop: put away confirms that nothing is deleted', dialogs.some(m => m.includes('Nothing is deleted')));
    }
    ck(`${name}: no sideways scroll (Emails)`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.screenshot({ path: `${__dirname}/out/email-emails-${name}.png`, fullPage: true });
    ck(`${name}: no page errors`, !errs.length); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
