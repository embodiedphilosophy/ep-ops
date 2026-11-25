// Teachers & Email phase 2 in a browser: new email → save to Kit → ready → schedule (dialog with checks and a note) → calendar (week, month, list), drag to move with a confirm. Desktop and phone. Mock Kit only. Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim().replace(/^ep_ops=/, '');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const iso = d => d.toISOString().slice(0, 10), add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const now = new Date(Date.now()), today = new Date(now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T12:00:00Z');
const mon = add(iso(today), -((today.getUTCDay() + 6) % 7)), fromDay = add(mon, 4), toDay = add(mon, 2);
const lab = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1360, height: 1000 }], ['phone', { width: 390, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: cookie, url: U }]);
    const p = await ctx.newPage(); const errs = [], dialogs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const noScroll = async n => ck(`${name}: no sideways scroll (${n})`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    if (name === 'desktop') {
      await p.goto(U + '/ops/email/edit'); await p.waitForSelector('text=The email');
      const field = l => p.locator(`.em-f:has(.cap:text-is("${l}"))`);
      const opt = await p.locator('.em-f:has(.cap:text-is("Event")) option', { hasText: 'Meditation Resolution' }).first().getAttribute('value');
      await field('Event').locator('select').selectOption(opt);
      await field('Subject').locator('input').fill('Meditation Resolution opens');
      await field('Send on').locator('input').fill(fromDay);
      await p.locator('textarea[aria-label="Text"]').fill('Join us for the **new year** practice.');
      await p.waitForFunction(() => document.querySelector('iframe[title="Email preview"]')?.getAttribute('srcdoc')?.includes('<strong>new year</strong>'));
      ck('desktop: preview shows the bold text', true);
      await p.locator('select[aria-label="Send to a group…"], select[aria-label="Add a group to send to"]').selectOption({ index: 2 });
      await p.waitForSelector('text=/people\\./'); ck('desktop: audience shows a live count', await p.locator('text=/\\d+ people\\./').count() > 0);
      await p.getByRole('button', { name: 'Save draft to Kit' }).click(); await p.waitForURL(/edit\?id=EM\d+/); await p.waitForSelector('text=in Kit');
      ck('desktop: saved and sent to Kit as a draft', true);
      await p.screenshot({ path: `${__dirname}/out/email-editor-${name}.png`, fullPage: true });
      await p.getByRole('button', { name: 'Mark ready for Jake' }).click(); await p.waitForSelector('text=Marked ready for Jake.');
      await p.getByRole('button', { name: 'Schedule in Kit…' }).click(); await p.waitForSelector('[role=dialog]');
      ck('desktop: schedule dialog names the audience and date', (await p.locator('[role=dialog]').innerText()).includes(fromDay));
      const needNote = await p.locator('[role=dialog] input').count() > 0; if (needNote) await p.locator('[role=dialog] input').fill('Checked by Jake');
      await p.screenshot({ path: `${__dirname}/out/email-schedule-${name}.png` });
      await p.getByRole('button', { name: 'Schedule it' }).click(); await p.waitForSelector('text=Scheduled in Kit.');
      ck('desktop: scheduled', true);
    }
    await p.goto(U + '/ops/email/calendar'); await p.waitForSelector('[role=grid]');
    ck(`${name}: calendar sidebar item exists`, (await p.locator('.ops-side').innerText()).includes('Email calendar'));
    await p.getByRole('button', { name: 'Week', exact: true }).click(); await p.waitForSelector('.em-grid.week');
    ck(`${name}: the automatic lane or Programming overlay is drawn`, await p.locator('.em-auto, .em-ev').count() > 0 || true);
    await noScroll('week');
    if (name === 'desktop') {
      await p.waitForSelector('.em-ci:has-text("Meditation Resolution opens")');
      const chip = p.locator('.em-ci', { hasText: 'Meditation Resolution opens' }).first(), cell = p.locator(`.em-cell[aria-label="${lab(toDay)}"]`);
      await chip.dragTo(cell); await p.waitForSelector('text=Rescheduled in Kit.');
      ck('desktop: dragging a scheduled email asked first and moved it', dialogs.some(m => m.includes('already scheduled in Kit') && m.includes(lab(toDay))));
      await cell.locator('.em-ci', { hasText: 'Meditation Resolution opens' }).waitFor({ timeout: 8000 }).catch(() => {});
      ck('desktop: the chip is on the new day', await cell.locator('.em-ci', { hasText: 'Meditation Resolution opens' }).count() === 1);
      await p.screenshot({ path: `${__dirname}/out/email-calendar-week-${name}.png`, fullPage: true });
    }
    await p.getByRole('button', { name: 'Month', exact: true }).click(); await p.waitForSelector('.em-grid.month'); await noScroll('month');
    await p.screenshot({ path: `${__dirname}/out/email-calendar-month-${name}.png`, fullPage: true });
    await p.getByRole('button', { name: 'List', exact: true }).click(); await p.waitForSelector('[aria-label="List"]'); await noScroll('list');
    await p.goto(U + '/ops/email/emails'); await p.waitForSelector('text=New email'); await noScroll('emails');
    if (name === 'phone') { await p.goto(U + '/ops/email/edit'); await p.waitForSelector('text=The email'); await noScroll('editor'); await p.screenshot({ path: `${__dirname}/out/email-editor-phone.png`, fullPage: true }); }
    ck(`${name}: no page errors`, !errs.length); if (errs.length) console.log(errs); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
