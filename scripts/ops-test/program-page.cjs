// EP Ops 2 step 4b: the program page (/ops/programs/[id]) in a browser: breadcrumb, name in Cormorant, tabs by role, Overview (count cards,
// "Is it ready?", launch timeline), Sessions (the program editor), Faculty, Launch (the Launches wizard on this program), Circle (the
// Circle panel), Recordings (this program's replays), Library, old addresses, a program not found, phone width. Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', cookie = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const as = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim();
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const ID = 'P-sadhana-fall-2026', PG = `${U}/ops/programs/${ID}`;
let EV, PE, PT; // an upcoming single event (the Fall series is over in the mock) to launch, and a session Abha teaches: found on the index, as the mock's dates move with today
(async () => {
  const b = await chromium.launch();
  const open = async (c, vp = { width: 1360, height: 1000 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
  const tabsOf = async p => (await p.locator('nav[aria-label="Program tabs"] a').allInnerTexts()).map(t => t.replace(/\s*\d+$/, '').trim()).join('|');
  const p = await open(cookie);
  await p.goto(U + '/ops/programs'); await p.waitForSelector('.pg-table');
  const hrefOf = async name => (await p.locator('.pg-name', { hasText: name }).first().getAttribute('href'));
  PE = U + await hrefOf('Practicum'); EV = decodeURIComponent(PE.split('/').pop()); PT = U + await hrefOf('Wisdom School Monthly Lecture');
  await p.goto(PG); await p.waitForSelector('.ops-tiles');
  ck('breadcrumb starts with Programs', (await p.locator('.ops-crumb').innerText()).startsWith('Programs'));
  ck('the name is the page title, in Cormorant', await p.locator('h1.ops-name').count() === 1 && /Cormorant/.test(await p.locator('h1.ops-name').evaluate(e => getComputedStyle(e).fontFamily)));
  ck('the director sees all seven tabs', (await tabsOf(p)) === 'Overview|Sessions|Faculty|Launch|Circle|Recordings|Library', await tabsOf(p));
  ck('Programs is the lit place in the sidebar', (await p.locator('.ops-nav a[aria-current=page]').innerText()).includes('Programs'));
  ck('four count cards', await p.locator('.ops-tile').count() === 4);
  ck('"Is it ready?" lists the program\'s checks or says there is nothing yet', await p.locator('section[aria-label="Is it ready?"]').count() === 1);
  ck('the launch card offers to start a launch (none yet)', /Start a launch/.test(await p.locator('section[aria-label="Launch timeline"]').innerText()));
  ck('tasks and links are on the Overview', await p.locator('section[aria-label="Tasks"]').count() === 1 && await p.locator('section[aria-label="Links"]').count() === 1);

  // Sessions: the program editor, here as a tab
  await p.getByRole('link', { name: /^Sessions/ }).click(); await p.waitForURL(/tab=sessions/); await p.waitForSelector('.ops-modules li', { timeout: 15000 });
  ck('Sessions lists the sessions and the module editor', await p.locator('.pg-sessions tbody tr').count() >= 5 && await p.locator('.ops-modules li').count() >= 5);
  ck('"Edit one session" is there for editors', await p.getByText('Edit one session').count() > 0);
  await p.goto(PG + '?tab=faculty'); ck('Faculty names who teaches', /Jacob Kyle/.test(await p.locator('section[aria-label="Faculty"]').innerText()));

  // Launch: the wizard on this program (made in the mock; nothing is scheduled or sent)
  await p.goto(PE + '?tab=launch'); await p.waitForSelector('[aria-label="Launches"]');
  ck('Launch shows only this program (no "Coming up" list, no page header)', await p.locator('#coming-up').count() === 0 && await p.locator('.soc-head').count() === 0);
  await p.getByRole('button', { name: 'New launch' }).click(); await p.waitForSelector('text=step 1 of 4');
  const evSel = await p.locator('.em-f select').first().inputValue();
  ck('the new launch starts on one of this program\'s sessions', /^E\d+/.test(evSel), evSel);
  ck('the name is filled in with the program name', (await p.locator('.em-f input').first().inputValue()).length > 3);
  await p.getByRole('button', { name: 'Next: key dates' }).click(); await p.waitForSelector('text=step 2 of 4');
  await p.locator('input[type=date]').first().fill('2026-12-20'); const dates = await p.locator('input[type=date]').count(); for (let i = 1; i < dates; i++) await p.locator('input[type=date]').nth(i).fill(`2026-12-${21 + i}`);
  await p.getByRole('button', { name: 'Next: audience' }).click(); await p.waitForSelector('text=step 3 of 4');
  await p.getByRole('button', { name: 'Next: review' }).click(); await p.waitForSelector('text=step 4 of 4');
  await p.locator('label.em-sw input').uncheck();
  await p.getByRole('button', { name: 'Create the launch' }).click(); await p.waitForURL(/tab=launch&id=L\d+/); await p.waitForSelector('[aria-label="Launch timeline"]');
  ck('creating the launch lands on its board inside the program', p.url().includes(`/ops/programs/${EV}`) && await p.locator('.em-tl-lane').count() === 4);
  ck('"All launches" goes back to this program\'s Launch tab', (await p.locator('a', { hasText: 'All launches' }).getAttribute('href')).includes(`/ops/programs/${EV}?tab=launch`));
  await p.goto(PE); await p.waitForSelector('section[aria-label="Launch timeline"] .em-tl', { timeout: 15000 });
  ck('the Overview now draws the launch timeline', await p.locator('section[aria-label="Launch timeline"] .em-tl-lane').count() === 4);
  await p.goto(U + '/ops/programs'); const row = await p.locator('tr', { hasText: 'Practicum' }).first().innerText();
  ck('the index shows the launch on the program\'s row', /Planning/.test(row), row);

  // Circle and Recordings and Library
  await p.goto(PG + '?tab=circle'); await p.waitForSelector('h3:has-text("Circle")', { timeout: 15000 });
  ck('Circle tab shows the Circle panel for this program', await p.locator('h3:has-text("Circle")').count() === 1);
  await p.goto(PG + '?tab=recordings'); await p.waitForSelector('[aria-label="Replays to post"]');
  ck('Recordings shows only replays, not the podcast or Tarka lists', await p.locator('[aria-label="CHITHEADS"]').count() === 0 && await p.locator('[aria-label="Tarka"]').count() === 0 && await p.locator('[aria-label="Posted"]').count() === 1);
  await p.goto(PG + '?tab=library'); ck('Library tab loads', await p.locator('section[aria-label="Library listing"]').count() === 1);

  // old addresses
  await p.goto(U + `/ops/events?event=${ID}`); ck('/ops/events?event=… opens the program page', p.url().startsWith(PG));
  await p.goto(U + '/ops/programs/E002'); ck('a session ID opens its program', /\/ops\/programs\//.test(p.url()) && await p.locator('h1').count() === 1, p.url());
  await p.goto(U + '/ops/programs/nothing-here'); ck('an unknown program says so, kindly', /can’t find that program/.test(await p.locator('h1').innerText()));
  await p.goto(U + '/ops/library'); ck('/ops/library still lands on the Library view', /view=library/.test(p.url()));
  await p.goto(U + '/ops/email/media'); ck('/ops/email/media still lands on Recordings', /view=recordings/.test(p.url()));
  ck('no page errors (director)', !p.errs.length, p.errs.join());

  // roles
  const fl = await open(as('floss@example.com')); await fl.goto(PG); await fl.waitForSelector('.ops-tiles');
  ck('Floss (events staff) sees all seven tabs', (await tabsOf(fl)) === 'Overview|Sessions|Faculty|Launch|Circle|Recordings|Library', await tabsOf(fl));
  const ic = await open(as('ichha@example.com')); await ic.goto(PG); await ic.waitForSelector('.ops-tiles');
  ck('Ichha (support) sees Overview, Sessions, Faculty, Launch, Recordings: no Circle push, no Library', (await tabsOf(ic)) === 'Overview|Sessions|Faculty|Launch|Recordings', await tabsOf(ic));
  await ic.goto(PG + '?tab=sessions'); ck('Ichha has no editors on Sessions', await ic.getByText('Edit one session').count() === 0 && await ic.locator('.ops-program').count() === 0);
  const te = await open(as('abha@example.com')); await te.goto(PT); await te.waitForSelector('.ops-tiles');
  ck('a teacher sees three cards and Overview, Sessions, Faculty only', await te.locator('.ops-tile').count() === 3 && (await tabsOf(te)) === 'Overview|Sessions|Faculty', await tabsOf(te));
  await te.goto(PT + '?tab=launch'); ck('a teacher asking for the Launch tab gets the Overview', await te.locator('.ops-tiles').count() === 1);
  ck('no page errors (roles)', !fl.errs.length && !ic.errs.length && !te.errs.length, [...fl.errs, ...ic.errs, ...te.errs].join());

  // phone
  const ph = await open(cookie, { width: 390, height: 800 });
  for (const tab of ['', '?tab=sessions', '?tab=faculty', '?tab=launch', '?tab=circle', '?tab=recordings', '?tab=library']) {
    await ph.goto(PG + tab); await ph.waitForSelector('h1.ops-name'); await ph.waitForTimeout(1200);
    ck(`phone ${tab || 'overview'}: no sideways scroll`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  }
  await ph.goto(PG); const small = await ph.evaluate(() => [...document.querySelectorAll('nav[aria-label="Program tabs"] a, .pg-card-head a')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43).map(e => e.innerText));
  ck('phone: the tabs are at least 44px tall', small.filter(t => !/Open|Start/.test(t)).length === 0, small.join());
  await ph.screenshot({ path: path.join(__dirname, 'out/program-page-phone.png'), fullPage: true });
  await p.goto(PE); await p.waitForSelector('.em-tl'); await p.screenshot({ path: path.join(__dirname, 'out/program-page.png'), fullPage: true });
  await b.close(); console.log(bad ? `${bad} FAILED` : 'all ok'); process.exit(bad ? 1 : 0);
})();
