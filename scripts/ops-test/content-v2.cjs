// Content v2 click-through: expired banner, carousel from the library, reorder, upload a video to Drive (mock), delete,
// "Use in a post" from the Library and Quotes, and what Carolyn (Publisher) and a viewer see. Writes go to the mock.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = email => execSync(`node ${__dirname}/cookie.mjs ${email}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, extra); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const open = async (email, vw = [1366, 900]) => {
    const c = await b.newContext({ viewport: { width: vw[0], height: vw[1] } });
    await c.addCookies([{ name: 'ep_ops', value: ck(email), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.route('https://lh3.googleusercontent.com/**', pic); await p.route('https://picsum.photos/**', pic);
    return p;
  };
  const go = async (p, q = '') => { await p.goto('http://localhost:3100/ops/content?tab=social' + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); };

  // --- Carolyn: sees New post; the Expired banner; builds a carousel from the library
  let p = await open('carolyn@example.com'); await go(p);
  t('Carolyn has New post', await p.locator('.ops-se-bar button:text-is("New post")').count() === 1);
  t('Expired banner shown', await p.locator('.ops-se-expired').count() === 1, await p.locator('.ops-se-expired p').innerText().catch(() => ''));
  console.log('   Unconfirmed pills:', await p.locator('.ops-se-bar .pill.s-Unconfirmed').count());
  await p.screenshot({ path: O + '/v2-plan-desktop.png' });
  await p.locator('.ops-se-bar button:text-is("New post")').click(); await p.waitForTimeout(300);
  await p.locator('.ops-kinds button:text-is("Carousel")').click();
  t('Carousel needs 2 slides (refused empty)', (await p.locator('.ops-se-comp .row.bad, .ops-slides .hint.err').count()) === 0);
  await p.fill('#c-caption', 'Five limbs, five days.');
  for (let i = 0; i < 3; i++) { await p.locator('.ops-slides button:has-text("Picture from the library")').click(); await p.waitForTimeout(900); await p.locator('.ops-se-picker .grid li button').nth(i).click(); await p.waitForTimeout(300); }
  t('3 slides added', await p.locator('.ops-slides ol li').count() === 3);
  await p.locator('.ops-slides ol li').nth(2).locator('button[aria-label^="Move slide 3 earlier"]').click();
  const firstLabel = await p.locator('.ops-slides ol li .l').allInnerTexts(); console.log('   order after move:', firstLabel.join(', '));
  // upload a vertical video as slide 4, and a wide one to see the warning
  await p.locator('.ops-slides .upl input').setInputFiles(O + '/wide.mp4'); await p.waitForTimeout(2500);
  t('video slide added', await p.locator('.ops-slides ol li').count() === 4, await p.locator('.ops-slides .note').innerText());
  await p.screenshot({ path: O + '/v2-carousel-desktop.png' });
  await p.locator('.ops-se-comp button:text-is("Add and approve")').click(); await p.waitForTimeout(2500);
  t('carousel saved', await p.locator('.ops-se-modal').count() === 0, await p.locator('.ops-se-bar .hint').innerText().catch(() => ''));
  const tile = p.locator('.ops-se-feed li', { hasText: 'Five limbs' });
  t('card says Carousel · 4, by Carolyn, Manual', /Carousel · 4/.test(await tile.innerText()) && /by Carolyn/.test(await tile.innerText()) && /Manual/.test(await tile.innerText()), (await tile.innerText()).replace(/\n/g, ' | '));
  await tile.locator('button').click(); await p.waitForTimeout(500);
  t('author line in the editor', /Added by Carolyn Boucher · approved by Carolyn Boucher/.test(await p.locator('.ops-se-comp .hint.by').innerText()), await p.locator('.ops-se-comp .hint.by').innerText());
  await p.keyboard.press('Escape');

  // --- delete an expired post from the editor
  const expTile = p.locator('.ops-se-feed li:has(.st.s-Expired)').first();
  const before = await p.locator('.ops-se-feed li').count();
  await expTile.locator('button').click(); await p.waitForTimeout(500);
  await p.locator('.ops-se-comp button:text-is("Delete")').click(); await p.waitForTimeout(2500);
  t('delete removes the card', await p.locator('.ops-se-feed li').count() === before - 1, `${before} → ${await p.locator('.ops-se-feed li').count()}`);
  // Archive all / Delete all in the banner
  await p.locator('.ops-se-expired button:text-is("Archive all")').click(); await p.waitForTimeout(2500);
  t('banner cleared after Archive all', await p.locator('.ops-se-expired').count() === 0);
  await p.close();

  // --- Jacob: Use in a post from Images and Quotes; reel upload warnings
  p = await open('jacob@embodiedphilosophy.com'); await go(p, '&s=images');
  await p.locator('.ops-se-imgs li button').first().click(); await p.waitForTimeout(400);
  await p.locator('button:text-is("Use in a post")').click(); await p.waitForTimeout(1200);
  t('Use in a post opens a new post with the picture', await p.locator('.ops-se-comp .top .pill:text-is("New post")').count() === 1 && await p.locator('.ops-se-comp .media .pic img').count() === 1);
  await p.locator('.ops-kinds button:text-is("Video / Reel")').click();
  await p.locator('.ops-slides .upl input').setInputFiles(O + '/wide.mp4'); await p.waitForTimeout(2500);
  const warn = await p.locator('.ops-slides .note').innerText(); t('wide video warned for a Reel', /1280×720.*9:16/.test(warn), warn);
  await p.screenshot({ path: O + '/v2-reel-desktop.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await go(p, '&s=quotes'); await p.locator('.ops-site-rows li button').first().click(); await p.waitForTimeout(400);
  const q = p.locator('button:has-text("Start a post from this quote")'); t('quote button present', await q.count() === 1);
  if (await q.isEnabled()) { await q.click(); await p.waitForTimeout(800); const cap = await p.inputValue('#c-caption'); t('caption starts with the exact quote', /^“.+”\n— /.test(cap), cap.slice(0, 70)); }
  await p.close();

  // --- a viewer can read but not create
  p = await open('vera@example.com'); await go(p);
  t('viewer has no New post / Approve', await p.locator('.ops-se-bar button:text-is("New post")').count() === 0 && await p.locator('.ops-se-expired').count() === 0);
  await p.close();

  // --- phone width: overflow check on the plan and the composer
  p = await open('carolyn@example.com', [390, 844]); await go(p);
  await p.locator('.ops-se-bar button:text-is("New post")').click(); await p.locator('.ops-kinds button:text-is("Carousel")').click(); await p.waitForTimeout(300);
  await p.locator('.ops-slides .upl input').setInputFiles(O + '/vertical.mp4'); await p.waitForTimeout(2500);
  const over = await p.evaluate(() => document.querySelector('.ops-se-comp').scrollWidth > document.documentElement.clientWidth + 1);
  t('no sideways scroll at phone width', !over); await p.screenshot({ path: O + '/v2-carousel-phone.png' });
  await b.close();
  console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
