// EP Ops 2 step 6, Publish › Calendar: email, social, video and automatic reminders on one calendar, the kind chips, month / week / list,
// Social and Email kinds opening the full old calendars, the older addresses, the views by role, phone width. Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
(async () => {
  const b = await chromium.launch();
  const as = async (v, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: v, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const tabs = async p => (await p.locator('nav[aria-label="publish views"] a').allInnerTexts()).join('|');
  const chips = async p => (await p.locator('.pub-chips a').allInnerTexts()).map(x => x.replace(/\s+\d+$/, '').trim()).join('|');
  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/publish'); await p.waitForSelector('.pub-grid .pub-it');
  ck('the director sees the Publish views', (await tabs(p)).startsWith('Calendar|Review and approve|Compose|Library|Published|') && (await tabs(p)).endsWith('Reminder sends|Video'));
  ck('kind chips: All, Email, Social, Video, Automatic', (await chips(p)) === 'All|Email|Social|Video|Automatic');
  ck('the month grid has email, social and automatic items on it', await p.locator('.pub-it.k-email').count() > 0 && await p.locator('.pub-it.k-social').count() > 0 && await p.locator('.pub-it.k-auto').count() > 0);
  ck('every item names its kind', (await p.locator('.pub-it .k').allInnerTexts()).every(t => /^(Email|Social|Video|Automatic)/.test(t)));
  ck('programming overlay shows, and can be switched off', await p.locator('.pub-ev').count() > 0 && (await p.getByLabel('Programming overlay').uncheck(), await p.locator('.pub-ev').count() === 0));
  ck('the key names the kinds', /Email\s*Social\s*Video\s*Automatic/.test(await p.locator('.pub-key').innerText()));
  ck('"Checks across channels" gathers the old warnings', await p.locator('[aria-label="Checks across channels"] li').count() > 0);
  await p.getByRole('button', { name: 'Week' }).click(); await p.waitForSelector('.pub-grid.week .pub-it');
  ck('Week shows seven days', await p.locator('.pub-grid.week .pub-cell').count() === 7);
  await p.getByRole('button', { name: 'List' }).click(); await p.waitForSelector('.pub-list');
  ck('List shows dated rows', await p.locator('.pub-list li').count() > 0);
  await p.goto(U + '/ops/publish?layout=week'); await p.waitForSelector('.pub-grid.week'); ck('?layout=week opens the week', true);
  // items open the right editor
  await p.goto(U + '/ops/publish'); await p.locator('.pub-it.k-social').first().click(); await p.waitForSelector('.cmp-cols');
  ck('a social item opens the Post composer in Compose', /view=compose&row=\d+/.test(p.url()) && await p.locator('.pub-kinds a[aria-current=page]', { hasText: 'Post' }).count() === 1);
  await p.goto(U + '/ops/publish'); await p.locator('a.pub-it.k-email').first().click(); await p.waitForSelector('[aria-label="Emails"]');
  ck('an email that is only in Kit opens the Emails in Kit list (adopting it is on the Email kind)', /view=email$/.test(p.url()));
  // kinds
  await p.goto(U + '/ops/publish?show=email'); await p.waitForSelector('.em-grid');
  ck('Email chip shows the full email calendar (drag to move, Programming panel)', await p.locator('.em-views button').count() === 3 && await p.getByRole('button', { name: /Programming/ }).count() === 1 && await p.locator('.pub-grid').count() === 0);
  await p.goto(U + '/ops/publish?show=social'); await p.waitForSelector('.soc-weekgrid');
  ck('Social chip shows the full Social calendar (five views, day categories, drafts tray)', await p.locator('.soc-seg button').count() === 5 && await p.locator('[aria-label="Day categories"]').count() === 1 && await p.locator('.soc-tray').count() === 1);
  await p.goto(U + '/ops/publish?show=auto'); await p.waitForSelector('.pub-grid');
  ck('Automatic chip shows only automatic items', await p.locator('.pub-it:not(.k-auto)').count() === 0 && /Reminder sends/.test(await p.locator('main.ops').innerText()));
  await p.goto(U + '/ops/publish?show=video'); ck('Video chip works for a director and says where proposals are', /Proposals, the review queue/.test(await p.locator('main.ops').innerText()));
  // older addresses
  await p.goto(U + '/ops/social'); ck('/ops/social lands on the calendar', new URL(p.url()).pathname === '/ops/publish');
  await p.goto(U + '/ops/email/calendar'); await p.waitForSelector('.em-grid'); ck('/ops/email/calendar lands on the Email kind', p.url().includes('show=email'));
  await p.goto(U + '/ops/publish?view=email-calendar'); await p.waitForSelector('.em-grid'); ck('?view=email-calendar still works', true);
  await p.goto(U + '/ops/publish?view=reminders'); await p.waitForSelector('[aria-label="Handled elsewhere"]');
  ck('Reminder sends view reads the sends and points to the rules in Settings', await p.locator('a[href="/ops/settings?view=reminders"]').count() >= 1);
  await p.goto(U + '/ops/email/reminders'); ck('the reminder rules stay in Settings', p.url().includes('/ops/settings'));
  // roles
  const fl = await as(cookie('floss@example.com')); await fl.goto(U + '/ops/publish'); await fl.waitForSelector('.pub-grid .pub-it');
  ck('Floss sees no Video chip or tab', !(await chips(fl)).includes('Video') && !(await tabs(fl)).includes('Video'));
  const ca = await as(cookie('carolyn@example.com')); await ca.goto(U + '/ops/publish'); await ca.waitForSelector('.pub-grid .pub-it');
  ck('the Social role sees the calendar', (await chips(ca)) === 'All|Email|Social|Automatic');
  ck('the "New…" menu offers only what the role can make (Carolyn: a post, not an email)', (await ca.locator('.pub-menu a').allTextContents()).join('|') === 'New post');
  const ve = await as(cookie('vera@example.com')); await ve.goto(U + '/ops/publish'); await ve.waitForSelector('.pub-grid .pub-it');
  ck('a viewer sees the calendar but no "New…" menu', await ve.locator('.pub-menu').count() === 0);
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops/publish'); ck('a teacher is sent away from Publish', !new URL(te.url()).pathname.startsWith('/ops/publish'));
  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 }); await ph.goto(U + '/ops/publish'); await ph.waitForSelector('.pub-grid .pub-it');
  ck('phone: no sideways page scroll', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  ck('phone: the grid scrolls inside its panel', await ph.evaluate(() => { const s = document.querySelector('.pub-scroll'); return s.scrollWidth > s.clientWidth; }));
  ck('phone: chips and buttons are 44px tall', (await ph.locator('.pub-chip').first().boundingBox()).height >= 44 && (await ph.locator('.pub-menu summary').boundingBox()).height >= 44);
  await ph.screenshot({ path: __dirname + '/out/publish-calendar-phone.png', fullPage: true });
  ck('no page errors', [p, fl, ca, ph].every(x => !x.errs.length));
  await b.close(); console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
})();
