// Carousels, event promo, Meet the teacher and This Week at EP in a browser. Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const c = await b.newContext({ viewport: { width: 1440, height: 1500 } });
  const C = ck('jacob@embodiedphilosophy.com');
  await c.addCookies([{ name: 'ep_ops', value: C, domain: 'localhost', path: '/' }]);
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.route('https://lh3.googleusercontent.com/**', pic); await p.route(/picsum/, pic);
  const go = async path => { await p.goto('http://localhost:3100/ops/' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); };

  // --- This Week at EP
  await go('social/this-week');
  t('sidebar lists This Week at EP', /This Week at EP/i.test(await p.locator('nav[aria-label=Dashboard]').innerText()));
  t('headline and the locked-to-schedule promise', /This Week at/.test(await p.locator('.soc-head h1').innerText()) && /Nothing posts until/.test(await p.locator('.soc-head p').innerText()));
  t('next week lists events and flags missing facts', await p.locator('.soc-rev li.blocked').count() > 0 && /Missing in the Master Schedule/.test(await p.locator('.soc-rev').innerText()));
  await p.locator('button[aria-label="Earlier week"]').click(); await p.waitForTimeout(1500);
  t('this week has complete events, none of them Sādhana School weekly', await p.locator('.soc-rev li').count() >= 2 && !/Sādhana School/.test(await p.locator('.soc-rev').innerText()), String(await p.locator('.soc-rev li').count()));
  await p.locator('.tw-strip img').first().waitFor({ timeout: 25000 }).catch(() => {});
  const n = await p.locator('.soc-rev li input[type=checkbox]:checked').count();
  t('slides drawn: cover + one per event + closing', await p.locator('.tw-strip img').count() === n + 2, `${await p.locator('.tw-strip img').count()} for ${n}`);
  await p.locator('.soc-rev li:first-child input[type=text], .soc-rev li:first-child input:not([type])').first().fill('Come and join us.'); await p.waitForTimeout(1500);
  await p.screenshot({ path: O + '/thisweek.png', fullPage: true });
  await p.locator('button:text-is("Save as a proposed post")').click(); await p.locator('p.hint[role=status]').waitFor({ timeout: 40000 }).catch(() => {});
  t('saves a proposed post for Sunday 9:00 ET', /proposed post for .* at 9:00 ET/.test(await p.locator('p.hint[role=status]').innerText().catch(() => '')));
  const plan = JSON.parse(execSync(`curl -s -H "Cookie: ep_ops=${C}" "http://localhost:3100/api/ops/social?view=plan"`).toString());
  const row = plan.rows.find(r => r.values.template_id === 'thisweek');
  t('the post is standing, Proposed, 09:00, a carousel', !!row && row.values.is_standing === 'TRUE' && row.values.status === 'Proposed' && row.values.publish_time_ET === '09:00' && row.values.media_kind === 'carousel' && JSON.parse(row.values.slides_json).length === n + 2);

  // --- Composer: educational carousel from a template
  await go('social/compose');
  await p.locator('.ops-kinds button:text-is("Carousel")').click(); await p.locator('button:text-is("Make slides from a template")').click(); await p.waitForTimeout(500);
  t('carousel templates offered (not the single cards)', await p.locator('.ops-tpl .chip:text-is("Educational carousel")').count() === 1 && await p.locator('.ops-tpl .chip:text-is("Tarka quote card")').count() === 0);
  t('This Week at EP is built on its own page, not offered here', await p.locator('.ops-tpl .chip:text-is("This Week at EP")').count() === 0);
  await p.fill('#car-title', 'Five limbs, five days'); await p.fill('#car-sub', 'A short series');
  await p.locator('textarea[aria-label="Slide 1 words"]').fill('The restraints: how we meet the world.'); await p.locator('input[aria-label="Slide 1 heading"]').fill('Yama');
  await p.locator('textarea[aria-label="Slide 2 words"]').fill('The observances: how we meet ourselves.'); await p.locator('input[aria-label="Slide 2 heading"]').fill('Niyama');
  await p.locator('.ops-tpl button:text-is("+ Add a slide")').click(); await p.locator('textarea[aria-label="Slide 3 words"]').fill('A steady, comfortable seat.');
  await p.locator('.ops-tpl .stage img').nth(4).waitFor({ timeout: 30000 }).catch(() => {});
  t('a strip of 5 slides (cover, 3, closing)', await p.locator('.ops-tpl .stage img').count() === 5, String(await p.locator('.ops-tpl .stage img').count()));
  await p.locator('.ops-tpl button:text-matches("Use these 5 slides")').click(); await p.waitForTimeout(9000);
  t('the slides become the post’s carousel', await p.locator('.ops-slides ol li').count() === 5, String(await p.locator('.ops-slides ol li').count()));
  await p.fill('#c-caption', 'Five limbs.'); await p.locator('.ops-se-comp button:text-is("Add as proposed")').click(); await p.waitForTimeout(2500);

  // --- Composer: event promo (refuses without facts) and Meet the teacher
  await go('social/compose');
  await p.locator('button:text-is("Make a card")').click(); await p.locator('.ops-tpl .chip:text-is("Event / course promo")').click(); await p.waitForTimeout(800);
  const opts = await p.locator('#tpl-event option').allInnerTexts();
  t('events come from the Master Schedule and show what is missing', opts.some(o => /missing/.test(o)) && opts.some(o => /Living Room Lecture/.test(o) && !/missing/.test(o)), opts.slice(0, 4).join(' | '));
  await p.selectOption('#tpl-event', { label: opts.find(o => /missing/.test(o)) }); await p.waitForTimeout(400);
  t('a missing fact blocks the card and says which', /Missing in the Master Schedule/.test(await p.locator('.ops-tpl .hint.err').first().innerText()));
  await p.selectOption('#tpl-event', { label: opts.find(o => /Living Room Lecture/.test(o) && !/missing/.test(o)) });
  await p.locator('.ops-tpl .stage img').waitFor({ timeout: 25000 }).catch(() => {});
  t('event promo draws', await p.locator('.ops-tpl .stage img').count() === 1);
  await p.locator('.ops-tpl .chip:text-is("Meet the teacher")').click(); await p.waitForTimeout(500);
  await p.selectOption('#tpl-teacher', { index: 1 }); await p.locator('.ops-tpl .stage img').waitFor({ timeout: 25000 }).catch(() => {});
  t('Meet the teacher draws and notes the profile is not yet approved', await p.locator('.ops-tpl .stage img').count() === 1 && /should OK/.test(await p.locator('.ops-tpl').innerText()));
  await p.screenshot({ path: O + '/cards-teacher.png', fullPage: true });
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
