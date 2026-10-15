// Content → Email → Weekly Scaffolding: Pilgrimage Weekly sits after Reflection, saves on a full-width tab, and reaches the email
//   node scripts/ops-test/pilgrimage.cjs   (after run.sh; the mock's Weekly Scaffolding tab has no Pilgrimage columns yet, like the real one)
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), out = __dirname + '/out';
const cookie = fs.readFileSync(out + '/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await ctx.newPage();
    await p.goto('http://localhost:3100/ops/content?tab=email', { waitUntil: 'networkidle' });
    await p.getByText(/2026-10-25/).first().click();
    await p.waitForSelector('form.ops-edit legend');
    const legends = await p.$$eval('form.ops-edit legend', ls => ls.map(l => l.textContent));
    const i = s => legends.findIndex(l => l.startsWith(s));
    ok(i('Reflection') >= 0 && i('Pilgrimage') === i('Reflection') + 1 && i('Sanskrit') === i('Pilgrimage') + 1, `${tag}: order ${legends.join(' › ')}`);
    await p.fill('#s-Pilgrimage-Title', `The Threshold (${tag})`);
    await p.fill('#s-Pilgrimage-Body', 'This week we cross over.');
    await p.fill('#s-Pilgrimage-URL', 'https://embodiedphilosophy.com/pilgrimage');
    await p.click('form.ops-edit button[type=submit]');
    await p.waitForTimeout(2500);
    const err = await p.$eval('form.ops-edit', f => f.querySelector('.bar .hint')?.textContent || '').catch(() => '');
    ok(!err, `${tag}: saved${err ? ` (said: ${err})` : ''}`);
    const ow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ow <= 0, `${tag}: no sideways scroll`);
    await p.screenshot({ path: `${out}/pilgrimage-${tag}.png`, fullPage: false });
    await ctx.close();
  }
  const html = await (await fetch('http://localhost:3100/api/ops/scaffolding?date=2026-10-25', { headers: { cookie: `ep_ops=${cookie}` } })).text();
  const at = s => html.indexOf(s);
  ok(at('The Threshold') > at('The Weekly Reflection') && at('The Threshold') < at('Sanskrit for the Week'), 'email: Pilgrimage Weekly after Reflection, before Sanskrit');
  ok(/\[if subscriber\.tags contains "Member: Wisdom School" or subscriber\.tags contains "Member: Wisdom School Plus" \]/.test(html), 'email: wrapped in the Wisdom School tag check');
  await b.close(); process.exit(fails ? 1 : 0);
})();
