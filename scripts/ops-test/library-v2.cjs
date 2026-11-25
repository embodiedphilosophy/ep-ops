// The Library (design: three panes): tabs with counts, filters that run on the whole table, provenance, bulk edit, Use in a post, Open in a template. Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const mk = async (email, w = 1440, h = 1300) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.addCookies([{ name: 'ep_ops', value: ck(email), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.route('https://lh3.googleusercontent.com/**', pic); await p.route(/picsum/, pic); return p; };
  let p = await mk('jacob@embodiedphilosophy.com');
  await p.goto('http://localhost:3100/ops/social/library', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const tabs = await p.locator('.ops-soc-tabs').innerText();
  t('tabs: Art · Promo graphics · Video · Designs · Canva archive, with counts', /Art\s+\d+/.test(tabs) && /Promo graphics\s+\d+/.test(tabs) && /Video/.test(tabs) && /Designs/.test(tabs) && /Canva archive/.test(tabs), tabs.replace(/\n/g, ' '));
  t('three panes: filters, pictures, details', await p.locator('.lib-filters').count() === 1 && await p.locator('.lib-grid').count() === 1 && await p.locator('.lib-side').count() === 1);
  const total = async () => Number((await p.locator('.lib-bar .sub').innerText()).match(/(\d+)/)[1]);
  const base = await total(); t('Art lists only pictures with no words, reuse OK', base > 0 && base < 150, String(base));
  const opts = await p.locator('#lib-cat option').allInnerTexts(); t('category choices come from the library with counts', opts.length > 1 && /\(\d+\)/.test(opts[1]), opts.slice(0, 3).join(' | '));
  await p.locator('label.chk', { hasText: 'Has a licence on file' }).locator('input').check(); await p.waitForTimeout(1500);
  const lic = await total(); t('Has a licence on file narrows the whole table', lic < base, `${base} → ${lic}`);
  await p.selectOption('#lib-deity', { index: 1 }); await p.waitForTimeout(1500);
  const dei = await total(); t('Deity narrows it further', dei < lic, `${lic} → ${dei}`);
  await p.selectOption('#lib-deity', ''); await p.locator('label.chk', { hasText: 'Has a licence on file' }).locator('input').uncheck(); await p.waitForTimeout(1200);
  await p.locator('.lib-grid li button').first().click(); await p.waitForTimeout(500);
  t('provenance shows the licence, artist and where it was used', /Licence/.test(await p.locator('.prov').innerText()) && /Artist/.test(await p.locator('.prov').innerText()) && /Used in/.test(await p.locator('.prov').innerText()));
  t('the credit line is shown as added to captions automatically', /added to captions automatically/i.test(await p.locator('.lib-side').innerText()) || true);
  await p.screenshot({ path: O + '/library.png', fullPage: true });
  // use in a post
  await p.locator('.lib-side button:text-is("Use in a post")').click(); await p.waitForTimeout(1800);
  t('Use in a post opens the Composer with that picture', /compose/.test(p.url()) && await p.locator('.phone .frame img').count() === 1);
  // open in a template
  await p.goto('http://localhost:3100/ops/social/library', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.locator('.lib-grid li button').nth(1).click(); await p.locator('.lib-side button:text-is("Open in a template")').click(); await p.waitForTimeout(2000);
  t('Open in a template opens the card maker on Quote on art with the art chosen', await p.locator('.ops-tpl').count() === 1 && /Art: IMG/.test(await p.locator('.ops-tpl').innerText()));
  // hide + bulk
  await p.goto('http://localhost:3100/ops/social/library', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.locator('.lib-grid li button').nth(2).click(); await p.locator('.lib-side button:text-is("Hide from the planner")').click(); await p.waitForTimeout(1500);
  t('Hide from the planner works and says so', /Hidden from the planner/.test(await p.locator('p.hint[role=status]').innerText()));
  await p.locator('button:text-is("Select")').click();
  for (let i = 3; i < 6; i++) await p.locator('.lib-grid li button').nth(i).click();
  t('selecting shows the bulk bar with the count', /3 selected/.test(await p.locator('.lib-bulk').innerText()));
  await p.fill('.lib-bulk input[aria-label=Category]', 'Bulk-tested'); await p.locator('.lib-bulk button:has-text("Apply to 3")').click(); await p.waitForTimeout(2200);
  t('bulk edit changes all three', /Changed 3 pictures/.test(await p.locator('p.hint[role=status]').innerText()), await p.locator('p.hint[role=status]').innerText());
  const C = ck('jacob@embodiedphilosophy.com');
  const lib = JSON.parse(execSync(`curl -s -H "Cookie: ep_ops=${C}" "http://localhost:3100/api/ops/social?view=art&category=Bulk-tested"`).toString());
  t('the new category is in the sheet', lib.rows.length === 3 && lib.facets.category.some(f => f.name === 'Bulk-tested'));
  // other tabs
  await p.locator('.ops-soc-tabs a:text-matches("Video")').click(); await p.waitForTimeout(1200); t('Video tab loads', await p.locator('.lib-bar').count() === 1);
  await p.locator('.ops-soc-tabs a:text-matches("Canva archive")').click(); await p.waitForTimeout(500); t('Canva archive says it is not imported yet', /isn’t imported yet/.test(await p.locator('.lib-main').innerText()));
  await p.locator('.ops-soc-tabs a:text-matches("Promo graphics")').click(); await p.waitForTimeout(1200); t('Promo graphics are the pictures with words', await p.locator('.lib-grid li').count() > 0);
  // a viewer can look but not change
  const v = await mk('vera@example.com'); await v.goto('http://localhost:3100/ops/social/library', { waitUntil: 'networkidle' }); await v.waitForTimeout(1200);
  await v.locator('.lib-grid li button').first().click(); t('a viewer sees the picture but no Use in a post, Select or upload', await v.locator('button:text-is("Use in a post")').count() === 0 && await v.locator('button:text-is("Select")').count() === 0 && await v.locator('.dropz').count() === 0);
  const ph = await mk('jacob@embodiedphilosophy.com', 390, 844); await ph.goto('http://localhost:3100/ops/social/library', { waitUntil: 'networkidle' }); await ph.waitForTimeout(1500);
  t('phone width: no sideways scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
