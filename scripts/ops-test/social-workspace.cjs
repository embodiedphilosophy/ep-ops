// The Social workspace in a browser (Content & Social v2): sidebar, Calendar (week / month / list / grid / feed, day categories, drag,
// drafts, expired banner), Review & approve, the Composer page, Library, old links, permissions, phone width. Mock only. Start from a fresh run.sh.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const secret = require('fs').readFileSync(O + '/ops_secret', 'utf8').trim();
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: secret } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const mk = async (email, w = 1440, h = 900) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.addCookies([{ name: 'ep_ops', value: ck(email), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.route('https://lh3.googleusercontent.com/**', pic); await p.route(/picsum/, pic); return p; };
  const go = async (p, path) => { await p.goto('http://localhost:3100/ops/' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(1300); };
  const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  let p = await mk('jacob@embodiedphilosophy.com', 1440, 1700);
  await go(p, 'social');
  const navText = await p.locator('.ops-side').innerText();
  t('sidebar is the eight places', ['Today', 'Programs', 'Tasks', 'People', 'Publish', 'Students', 'Business', 'Settings'].every(x => navText.includes(x)) && !/Composer|Site copy review/.test(navText), navText.replace(/\n/g, ' '));
  const tabsText = await p.locator('nav[aria-label="publish views"]').innerText();
  t('Publish has Calendar, Compose, Review and approve, Library and Published as tabs', ['Calendar', 'Compose', 'Review and approve', 'Library', 'Published'].every(x => tabsText.includes(x)), tabsText.replace(/\n/g, ' '));
  t('headline reads "Week of … at a glance"', /^Week of \d+ \w+ at a glance/.test((await p.locator('.soc-head h1').innerText()).trim()));
  t('four status cards', await p.locator('.soc-cards .soc-card').count() === 4);
  t('balance, rhythm, week ahead, coming up', await p.locator('.soc-balance').count() === 1 && await p.locator('.soc-two .soc-card').count() === 3);
  t('seven day columns each with a category slot', await p.locator('.soc-weekgrid .soc-day').count() === 7 && await p.locator('.soc-weekgrid .soc-slot').count() === 7);
  t('expired banner + drafts tray + never-used pills', await p.locator('.soc-banner').count() === 1 && await p.locator('.soc-tray').count() === 1 && await p.locator('.soc-tray .pills a').count() > 0);

  // day categories (standing, then this week only)
  await p.locator('button:text-is("Edit day categories")').click();
  const sels = p.locator('.soc-cats select'); t('a dropdown per weekday', await sels.count() === 7);
  const idx = await p.evaluate(() => [...document.querySelectorAll('.soc-weekgrid .soc-day')].findIndex(d => d.querySelector('.soc-post.proposed') && !d.classList.contains('today')));
  await sels.nth(idx).selectOption('Quote on an image'); await p.waitForTimeout(1800);
  t('the day shows its category and a fill state', /Quote on an image/.test(await p.locator('.soc-weekgrid .soc-slot').nth(idx).innerText()) && /Filled|Not filled|Missed/.test(await p.locator('.soc-weekgrid .soc-slot').nth(idx).innerText()), (await p.locator('.soc-weekgrid .soc-slot').nth(idx).innerText()).replace(/\n/g, ' | '));
  await p.locator('input[name=scope]').nth(1).check(); await sels.nth(idx).selectOption('Teacher video'); await p.waitForTimeout(1800);
  t('this week only wins over every week', /Teacher video/.test(await p.locator('.soc-weekgrid .soc-slot').nth(idx).innerText()));
  await p.locator('button:text-is("Done")').click();

  // drag a Proposed post to another day
  const from = p.locator('.soc-post.proposed[draggable=true]').first();
  const fromIdx = await p.evaluate(() => [...document.querySelectorAll('.soc-weekgrid .soc-day')].indexOf(document.querySelector('.soc-post.proposed[draggable=true]').closest('.soc-day')));
  const toIdx = fromIdx === 5 ? 4 : 5; const before = await p.locator('.soc-weekgrid .soc-day').nth(toIdx).locator('.soc-post').count();
  await from.scrollIntoViewIfNeeded(); await from.dragTo(p.locator('.soc-weekgrid .soc-day').nth(toIdx)); await p.waitForTimeout(2500);
  t('drag moves the post to the other day', await p.locator('.soc-weekgrid .soc-day').nth(toIdx).locator('.soc-post').count() === before + 1, await p.locator('p.hint').last().innerText().catch(() => ''));

  // the other views
  for (const [v, sel] of [['Month', '.soc-mgrid'], ['List', '.soc-table table'], ['Grid', '.soc-g3'], ['Feed', '.soc-feed']]) {
    await p.locator(`.soc-seg button:text-is("${v}")`).click(); await p.waitForTimeout(500);
    t(`${v} view shows`, await p.locator(sel).count() >= 1);
    if (v === 'Month') await p.screenshot({ path: O + '/soc-month.png', fullPage: true });
  }
  await p.locator('.soc-seg button:text-is("Month")').click(); await p.waitForTimeout(300);
  await p.locator('.soc-mcell:has(.big)').first().click(); await p.waitForTimeout(400);
  t('month day opens its week', await p.locator('.soc-weekgrid').count() === 1);
  await p.locator('.soc-seg button:text-is("Week")').click();

  await p.locator('button:text-is("This week")').click(); await p.waitForTimeout(300);
  // expired banner: move to drafts → tray
  const exp = await p.locator('.soc-banner strong').innerText();
  await p.locator('.soc-banner button:text-is("Move to drafts")').click(); await p.waitForTimeout(2500);
  t('expired posts move to the drafts tray', await p.locator('.soc-banner').count() === 0 && await p.locator('.soc-tray .d').count() > 0, exp);
  // drag a draft onto a future day
  const d0 = p.locator('.soc-tray .d[draggable=true]').first(); const cnt = await p.locator('.soc-weekgrid .soc-day').nth(6).locator('.soc-post').count(); // Sunday: a day that has not passed (the test ran on a Friday and Thursday refuses a draft)
  await d0.dragTo(p.locator('.soc-weekgrid .soc-day').nth(6)); await p.waitForTimeout(2500);
  if (await p.locator('.soc-weekgrid .soc-day').nth(6).locator('.soc-post').count() === cnt) { // the first drag sometimes starts before the page settles: do it by hand, in steps
    const from = await p.locator('.soc-tray .d[draggable=true]').first().boundingBox(), to = await p.locator('.soc-weekgrid .soc-day').nth(6).boundingBox();
    if (from && to) { await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down(); await p.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(2500); }
  }
  t('a draft dropped on a day is scheduled (Proposed)', await p.locator('.soc-weekgrid .soc-day').nth(6).locator('.soc-post').count() === cnt + 1, (await p.locator('p.hint, .hint').allInnerTexts()).join(' | ') + ' cnt=' + cnt + ' now=' + await p.locator('.soc-weekgrid .soc-day').nth(6).locator('.soc-post').count());

  // review & approve
  await go(p, 'social/review');
  t('review lists posts with the exact-count button', await p.locator('.soc-rev li').count() > 0 && /^Approve$/.test((await p.locator('.soc-sumbar .soc-btn').last().innerText()).trim()));
  await p.locator('.soc-rev li:not(.blocked) input').first().check();
  t('button shows the exact count', /^Approve 1 post$/.test((await p.locator('.soc-sumbar .soc-btn').last().innerText()).trim()));
  const flagged = p.locator('.soc-rev li:has(.gchip.flag):not(.blocked) input');
  if (await flagged.count()) { await flagged.first().check(); t('a flagged post needs a reason', await p.locator('.soc-rev .why').count() === 1 && await p.locator('.soc-sumbar .soc-btn').last().isDisabled()); await p.fill('.soc-rev .why', 'Cleared by Floss'); }
  await p.locator('.soc-sumbar .soc-btn').last().click(); await p.waitForTimeout(2500);
  t('approved', /approved/.test(await p.locator('p.hint').last().innerText()), await p.locator('p.hint').last().innerText());
  t('health panel beside the list', await p.locator('.health li').count() > 0);

  // composer page: build a carousel from the library, reorder, upload a video to the Drive mock, save it
  const fs = require('fs');
  if (!fs.existsSync(O + '/wide.mp4')) execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc=size=1280x720:rate=24 -t 2 -pix_fmt yuv420p -c:v libx264 ${O}/wide.mp4`);
  await go(p, 'social/compose');
  await p.locator('.ops-kinds button:text-is("Carousel")').click(); await p.fill('#c-caption', 'Five limbs, five days.');
  for (let i = 0; i < 3; i++) { await p.locator('.ops-slides button:has-text("Picture from the library")').click(); await p.waitForTimeout(900); await p.locator('.ops-se-picker .grid li button').nth(i).click(); await p.waitForTimeout(300); }
  t('3 slides added', await p.locator('.ops-slides ol li').count() === 3);
  await p.locator('.ops-slides ol li').nth(2).locator('button[aria-label^="Move slide 3 earlier"]').click();
  await p.locator('.ops-slides .upl input').setInputFiles(O + '/wide.mp4'); await p.waitForTimeout(2500);
  t('video uploaded to Drive as slide 4', await p.locator('.ops-slides ol li').count() === 4 && /Uploaded to Drive/.test(await p.locator('.ops-slides .note').innerText()));
  await p.locator('.ops-se-comp button:text-is("Add as proposed")').click(); await p.waitForTimeout(2500);
  t('carousel saved and back on the calendar', new URL(p.url()).pathname === '/ops/publish', p.url());
  await p.locator('.soc-seg button:text-is("List")').click(); await p.waitForTimeout(500);
  t('it shows as Carousel · 4, by the author', /Carousel · 4/.test(await p.locator('.soc-table').innerText()));
  // composer page + library + old links
  await go(p, 'social/compose?row=13'); t('composer is a page with the post in it', await p.locator('.ops-se-modal.page').count() === 1 && /\w/.test(await p.inputValue('#c-caption')));
  await go(p, 'social/library'); t('library opens on Art', /Art/.test(await p.locator('.ops-soc-tabs a[aria-current=page]').innerText()));
  await p.locator('.lib-grid li button').first().click(); await p.waitForTimeout(400);
  await p.locator('button:text-is("Use in a post")').click(); await p.waitForTimeout(1800);
  t('Use in a post opens the composer page with that picture', /view=compose/.test(p.url()) && await p.locator('.phone .frame img').count() === 1, p.url());
  for (const [old, now] of [['content?tab=social', '/ops/publish'], ['content?tab=social&s=review', '/ops/publish?view=review'], ['content?tab=social&s=history', '/ops/publish?view=published'], ['content?tab=social&s=quotes', '/ops/publish?view=library']]) {
    await p.goto('http://localhost:3100/ops/' + old, { waitUntil: 'networkidle' }); t(`old link ${old} → ${now}`, new URL(p.url()).pathname === now.split('?')[0] && (!now.includes('view=') || p.url().includes(now.split('?')[1])), p.url());
  }
  await go(p, 'content'); t('the old Content address lands on Publish', new URL(p.url()).pathname === '/ops/publish', p.url());
  await p.close();

  // permissions: a Publisher sees New post but not day-category editing; a viewer can't edit
  p = await mk('carolyn@example.com'); await go(p, 'social');
  t('Publisher: New post yes, day categories no', await p.locator('a:text-is("New post")').count() === 1 && await p.locator('button:text-is("Edit day categories")').count() === 0);
  await p.close();
  p = await mk('vera@example.com'); await go(p, 'social');
  t('Viewer: no New post, no banner buttons', await p.locator('a:text-is("New post")').count() === 0 && await p.locator('.soc-banner button').count() === 0);
  await p.close();

  // phone
  p = await mk('jacob@embodiedphilosophy.com', 390, 844);
  for (const pg of ['social', 'social/review', 'social/library', 'social/sources']) { await go(p, pg); t(`phone: no sideways scroll on ${pg}`, await noScroll(p)); }
  await go(p, 'social'); await p.screenshot({ path: O + '/soc-phone-calendar.png', fullPage: true });
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
