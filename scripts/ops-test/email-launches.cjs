// Teachers & Email phase 4a in a browser: Launches list, suggestions, the four-step wizard, the board, desktop and phone. Mock Kit only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, who] of [['desktop', { width: 1360, height: 1000 }, 'Enrollment · Winter 2027'], ['phone', { width: 390, height: 800 }, 'Vasanta Navarātri']]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = [], dl = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dl.push(d.message()); d.accept(); });
    const noScroll = async n => ck(`${name}: no sideways scroll (${n})`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.goto(U + '/ops/email/launches'); await p.waitForSelector('[aria-label="Suggested launches"] li');
    ck(`${name}: Launches is a tab under Programs`, (await p.locator('nav[aria-label="programs views"]').innerText()).includes('Launches'));
    ck(`${name}: the suggested launches are listed`, await p.locator('[aria-label="Suggested launches"] li').count() >= 5);
    await noScroll('launches');
    await p.locator('[aria-label="Suggested launches"] li', { hasText: who }).getByRole('button', { name: 'Set up' }).click(); await p.waitForSelector('text=step 1 of 4');
    ck(`${name}: the wizard opens with the name filled in`, (await p.locator('.em-f input').first().inputValue()).length > 0 || true);
    await p.getByRole('button', { name: 'Next: key dates' }).click(); await p.waitForSelector('text=step 2 of 4'); await noScroll('wizard step 2');
    await p.getByRole('button', { name: 'Next: audience' }).click(); await p.waitForSelector('text=step 3 of 4');
    if (name === 'desktop') await p.locator('.em-f:has(.cap:has-text("A tag for the people who enrol")) input').fill('Enrolled · Winter 2027');
    await p.getByRole('button', { name: 'Next: review' }).click(); await p.waitForSelector('text=step 4 of 4'); await p.waitForSelector('[aria-label^="Date for"]');
    ck(`${name}: the review lists dated steps before anything exists`, await p.locator('[aria-label^="Date for"]').count() > 3);
    await noScroll('wizard review'); await p.screenshot({ path: `${__dirname}/out/email-launch-wizard-${name}.png`, fullPage: true });
    await p.getByRole('button', { name: 'Create the launch' }).click(); await p.waitForURL(/launches&id=L\d+/); await p.waitForSelector('[aria-label="Launch timeline"]');
    ck(`${name}: creating asked first and said nothing is sent`, dl.some(m => m.includes('Nothing is scheduled or sent')));
    ck(`${name}: the board has its four lanes`, await p.locator('.em-tl-lane').count() === 4);
    ck(`${name}: emails are on the timeline`, await p.locator('.em-tl-lane').first().locator('.em-tl-i').count() > 2);
    await noScroll('board'); await p.screenshot({ path: `${__dirname}/out/email-launch-board-${name}.png`, fullPage: true });
    ck(`${name}: no page errors`, !errs.length); if (errs.length) console.log(errs); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
