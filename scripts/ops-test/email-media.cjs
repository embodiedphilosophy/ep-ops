// Teachers & Email phase 4c in a browser: Media (replays to post, Mark posted, posted list, Tarka placeholder), desktop and phone. Mock only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1360, height: 1000 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.goto(U + '/ops/content?tab=media'); ck(`${name}: the old Content → Media link lands on the new page`, p.url().includes('view=recordings'));
    await p.waitForSelector('[aria-label="Replays to post"] li');
    ck(`${name}: Recordings is a tab under Programs`, (await p.locator('nav[aria-label="programs views"]').innerText()).includes('Recordings'));
    ck(`${name}: Tarka has its placeholder`, await p.locator('[aria-label="Tarka"]').count() === 1);
    const li = p.locator('[aria-label="Replays to post"] li').first(), title = await li.locator('b').innerText();
    await li.locator('input').fill('not a link'); await li.getByRole('button', { name: 'Mark posted' }).click(); await p.waitForSelector('text=Paste the Circle link');
    ck(`${name}: a bad link is refused in plain words`, true);
    await li.locator('input').fill(`https://community.example.com/c/replays/${name}`); await li.getByRole('button', { name: 'Mark posted' }).click();
    await p.waitForSelector(`text=${title}: replay link saved.`); await p.waitForSelector('[aria-label="Posted"] a');
    ck(`${name}: it moved to Posted with its link`, await p.locator('[aria-label="Posted"] a', { hasText: `/${name}` }).count() === 1);
    ck(`${name}: no sideways scroll`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.screenshot({ path: `${__dirname}/out/email-media-${name}.png`, fullPage: true });
    ck(`${name}: no page errors`, !errs.length); if (errs.length) console.log(errs); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
