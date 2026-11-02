// Click-through: Ops → Mentee year → Month by month, the month list (what mentees see under "This month"). Renames and moves Immersion 1, edits a
// book and adds one, takes the buddy row off and puts it back, changes the reflection date and the one-to-one window. Writes go to the mock only.
//   bash scripts/ops-test/run.sh && node scripts/ops-test/month-list-edit.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/ops/mentee-year?tab=months');
  const nov = p.locator('#m-2026-11'), row = t => nov.locator('.ops-my-mlist > li', { hasText: t }), form = () => nov.locator('.ops-my-edit');
  for (const t of ['Immersion 1 · Beneath the Pose', 'Read The Truth of Yoga', 'Suggested: Yoga Body', 'Meet your buddy', 'Read Education’s End', 'One-to-one with Jacob', 'Write your first reflection']) ok(await row(t).count() === 1, 'listed: ' + t);
  ok(await nov.getByText('This month, six things').count() === 1, 'six things, as in Circle');
  await nov.screenshot({ path: __dirname + '/out/month-list-nov.png' });
  // immersion
  await row('Immersion 1').getByRole('button', { name: 'Edit' }).click();
  await form().getByLabel('Name of the weekend').fill('Under the Pose'); await form().getByLabel('Saturday', { exact: true }).fill('2026-11-21'); await form().getByLabel('Sunday', { exact: true }).fill('2026-11-22'); await form().getByLabel(/^Saturday Open Session link/).fill('https://zoom.us/j/111'); await form().getByLabel(/^Sunday Practicum link/).fill('https://zoom.us/j/222');
  await form().getByRole('button', { name: 'Save' }).click();
  await row('Immersion 1 · Under the Pose').waitFor({ timeout: 15000 }); ok((await row('Under the Pose').innerText()).includes('Sat 21 Nov – Sun 22 Nov'), 'immersion renamed and moved');
  ok(/Saturday Open Session: zoom.us\/j\/111[\s\S]*Sunday Practicum: zoom.us\/j\/222/.test(await row('Under the Pose').innerText()), 'Saturday and Sunday links saved');
  // book
  await row('Read The Truth of Yoga').getByRole('button', { name: 'Edit' }).click();
  await form().getByLabel('A line under it').fill('Begin after the weekend; a chapter a day.');
  await form().getByRole('button', { name: 'Save' }).click();
  await nov.getByText('a chapter a day').waitFor({ timeout: 15000 }); ok(true, 'book edited (Mentee Books)');
  await nov.getByRole('button', { name: '+ Add a book' }).click();
  await form().getByLabel('Book title').fill('The Subtle Body'); await form().getByLabel('Author').fill('Stefanie Syman'); await form().getByLabel('Kind').selectOption('suggested');
  await form().getByRole('button', { name: 'Add to the reading list' }).click();
  await row('Suggested: The Subtle Body').waitFor({ timeout: 15000 }); ok(true, 'book added');
  // buddy off and back
  p.once('dialog', d => d.accept());
  await row('Meet your buddy').getByRole('button', { name: 'Edit' }).click();
  await form().getByRole('button', { name: 'Remove from mentee page' }).click();
  await row('Meet your buddy').getByRole('button', { name: 'Put back on the mentee page' }).waitFor({ timeout: 15000 }); ok(true, 'buddy row taken off');
  await row('Meet your buddy').getByRole('button', { name: 'Put back on the mentee page' }).click();
  await row('Meet your buddy').getByRole('button', { name: 'Edit' }).waitFor({ timeout: 15000 }); ok(true, 'buddy row put back');
  // reflection and window
  await row('Write your first reflection').getByRole('button', { name: 'Edit' }).click();
  await form().getByLabel('Due', { exact: true }).fill('2026-11-29'); await form().getByLabel('Title', { exact: true }).fill('Your first reflection');
  await form().getByRole('button', { name: 'Save' }).click();
  await nov.getByText('Sun 29 Nov').waitFor({ timeout: 15000 }); ok((await row('Sun 29 Nov').innerText()).includes('Your first reflection'), 'reflection date and title');
  await row('One-to-one with Jacob').getByRole('button', { name: 'Edit' }).click();
  await form().getByLabel('Booking window opens').fill('2026-11-24'); await form().getByLabel('Window closes').fill('2026-11-28');
  await form().getByRole('button', { name: 'Save' }).click();
  await nov.getByText('Tue 24 Nov – Sat 28 Nov').waitFor({ timeout: 15000 }); ok(true, 'one-to-one window moved');
  // re-order: the reflection to the top
  for (let i = 0; i < 6; i++) {
    const up = row('Your first reflection').getByRole('button', { name: 'Move up' });
    if (await up.isDisabled()) break;
    await up.click(); await p.waitForTimeout(1500);
  }
  ok((await nov.locator('.ops-my-mlist').first().locator('> li .what > b').first().innerText()) === 'Your first reflection', 'reflection moved to the top');
  ok(/_order/.test(fs.readFileSync(__dirname + '/out/mock.log', 'utf8')), 'order saved');
  ok(await p.locator('#m-2027-07').locator('.ops-my-mlist').getByText('Retreat practicum').count() === 1, 'July keeps its retreat line');
  await p.setViewportSize({ width: 390, height: 844 }); await p.reload();
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no sideways scroll at phone width');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
