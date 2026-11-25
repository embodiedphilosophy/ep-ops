// This Week at EP: edit an event at the source, add a missing one (one-off / recurring / course), a hand-added
// unlisted event, editable cover and caption, Rebecka (Social, no schedule rights) sees no Edit, phone width.
// Start from a fresh run.sh. node scripts/ops-test/this-week-edit.cjs
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
let fails = 0; const t = (n, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addCookies([{ name: 'ep_ops', value: ck('jacob@embodiedphilosophy.com'), domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/ops/social/this-week', { waitUntil: 'networkidle' });
  // the week of 23 Nov has a Sādhana School weekly session that isn't listed
  for (let i = 0; i < 5 && !(await p.getByText('Meditation Mondays').count()); i++) { await p.getByLabel('Earlier week').click(); await p.waitForTimeout(1200); }
  t('unlisted events offered', await p.getByText(/Also on the schedule this week, not listed/).count() > 0);
  await p.getByText(/Also on the schedule this week/).click();
  await p.getByRole('button', { name: 'Add to this post' }).first().click();
  t('hand-added event marked', await p.getByText(/Added by hand for this post/).count() > 0);
  // edit an event at the source
  const row = p.locator('.soc-rev li', { hasText: 'Living Room Lecture' }).first();
  await row.getByRole('button', { name: 'Edit' }).click();
  await row.locator('.tw-edit input').first().fill('Recognition, live in the Living Room');
  await row.getByRole('button', { name: 'Save to the Master Schedule' }).click();
  await p.waitForTimeout(2500);
  t('title saved and reread from the schedule', await p.getByText('Recognition, live in the Living Room').count() > 0);
  // cover and caption
  await p.getByPlaceholder('This week at Embodied Philosophy').fill('Coming up at EP');
  const cap = p.locator('#tw-caption'); await cap.fill('My own caption'); t('caption editable', (await cap.inputValue()) === 'My own caption');
  await p.getByRole('button', { name: 'Write it from the events again' }).click(); t('caption back to automatic', (await cap.inputValue()).includes('link in our bio'));
  // add a recurring event (the view moves to 7–13 Dec, so its second session shows)
  await p.getByLabel('Later week').click(); await p.waitForTimeout(800); await p.getByLabel('Later week').click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: '+ Add an event that’s missing' }).click();
  await p.getByLabel('A recurring event (same title each time)').check();
  const add = p.locator('.tw-add');
  await add.getByRole('textbox', { name: 'Title', exact: true }).fill('Friday Kīrtan');
  await p.waitForTimeout(800); await add.locator('select').first().selectOption('LRL');
  await add.locator('label', { hasText: 'First session' }).locator('input').fill('2026-12-04');
  await add.locator('label', { hasText: 'Time (ET)' }).locator('input').fill('6pm');
  await add.locator('label', { hasText: 'Last session' }).locator('input').fill('2026-12-25');
  t('session count previewed', await add.getByText(/4 sessions/).count() > 0);
  await add.getByRole('button', { name: 'Add to the schedule' }).click(); await p.waitForTimeout(2500);
  t('recurring event added and listed', await p.locator('.soc-rev li', { hasText: 'Friday Kīrtan' }).count() > 0);
  t('it knows its later sessions', await p.locator('.soc-rev li', { hasText: 'Friday Kīrtan' }).getByText(/2 later sessions/).count() > 0);
  await p.screenshot({ path: O + '/this-week-desktop.png', fullPage: true });
  // course
  await p.getByRole('button', { name: '+ Add an event that’s missing' }).click();
  await p.getByLabel('A course with several modules').check();
  await add.getByRole('textbox', { name: 'Course title', exact: true }).fill('Tantrāloka Āhnika 4');
  await p.waitForTimeout(800); await add.locator('select').first().selectOption('EVENT');
  await add.locator('label', { hasText: 'First session' }).locator('input').fill('2026-12-02');
  await add.locator('textarea').fill('Śāmbhava\nŚākta\nĀṇava');
  await add.getByRole('button', { name: 'Add to the schedule' }).click(); await p.waitForTimeout(2500);
  const c = p.locator('.soc-rev li', { hasText: 'Tantrāloka Āhnika 4' }).first();
  t('course added with its first module', await c.getByText(/Śākta/).count() > 0);
  await c.getByRole('button', { name: 'Edit' }).click();
  t('course editor splits program title and module', await c.getByText('This session’s module').count() > 0 && await c.getByText('This and the 1 later session').count() > 0);
  t('no page errors', !errs.length); if (errs.length) console.log(errs);
  // Rebecka: social, not schedule
  const r = await b.newContext({ viewport: { width: 390, height: 900 } });
  await r.addCookies([{ name: 'ep_ops', value: ck('rebecka@example.com'), domain: 'localhost', path: '/' }]);
  const q = await r.newPage(); await q.goto('http://localhost:3100/ops/social/this-week', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500);
  t('no schedule editing for Social-only', await q.getByRole('button', { name: 'Edit' }).count() === 0 && await q.getByText('+ Add an event that’s missing').count() === 0);
  t('phone: no sideways scroll', await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await q.screenshot({ path: O + '/this-week-phone.png', fullPage: true });
  await b.close(); console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
})();
