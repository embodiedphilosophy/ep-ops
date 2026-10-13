// Course Library: Circle sync → New from Circle → link onboarding → publish (checklist, catalog row, site refresh)
// → Circle and onboarding changes flagged and cleared → Circle unpublish hides the card → skip, access map, phone width.
// Everything goes to the mock (fake Circle is read only). Check out/mock.log: CIRCLE GET, WROTE 'catalog', SITE REVALIDATE-COURSES.
const { chromium } = require('./pw.cjs');
const fs = require('fs');
const cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const BASE = 'http://localhost:3100', MOCK = 'http://localhost:4555';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const setCircle = body => fetch(MOCK + '/circle/__set', { method: 'POST', body: JSON.stringify(body) });
const setCell = (range, v) => fetch(`${MOCK}/v4/spreadsheets/x/values/${encodeURIComponent(range)}`, { method: 'PUT', body: JSON.stringify({ values: [[v]] }) });
const OUT = __dirname + '/out';
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await c.newPage();
  p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
  const sync = async () => { await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Check Circle now' }).click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500); await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' }); };
  const tile = async name => Number(await p.locator('.ops-tile', { hasText: name }).locator('.n').innerText());

  await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' });
  ok(await p.getByText('Circle hasn’t been checked yet').count() === 1, 'before the first check the desk says so');
  ok(await p.locator('.ops-empty-box').count() === 1, 'empty state shown');

  // 1. Sync
  await sync();
  ok(await tile('New from Circle') === 3, 'three Circle courses become New from Circle (the discussion space is ignored)');
  ok(await p.getByText('Meditation Mondays: November').count() > 0, 'cover/title row for a course');
  const heart = p.locator('.ops-lib-row', { hasText: 'The Heart of Recognition' });
  ok(await heart.getByText('Pre-filled from onboarding').count() === 1, 'matched by Circle ID: Heart of Recognition is pre-filled');
  ok(await p.locator('.ops-lib-row', { hasText: 'Meditation Mondays: November' }).getByText('Pre-filled from onboarding').count() === 0, 'no ID match: not linked yet');
  ok((await heart.locator('.mono', { hasText: '$495' }).count()) === 1, 'price comes from the Circle paywall');
  ok(await heart.getByText(/of 9 fields/).count() === 1, 'n of 9 fields bar');
  await p.screenshot({ path: OUT + '/library-new.png', fullPage: true });

  // 2. Link by hand and publish Meditation Mondays
  await p.locator('.ops-lib-row', { hasText: 'Meditation Mondays: November' }).getByRole('link', { name: 'Prepare listing' }).click();
  await p.waitForLoadState('networkidle');
  ok(await p.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Publish is disabled with nothing filled in');
  await p.getByLabel('Link to onboarding submission').selectOption({ label: 'Meditation Mondays: November · submitted' });
  await p.waitForTimeout(1200);
  ok((await p.locator('textarea').first().inputValue()).includes('A month of Monday practice'), 'linking pre-fills the description');
  ok(await p.getByText('From onboarding · Course Pages tab').count() >= 1, 'pre-filled field shows its source');
  ok(await p.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'still disabled: programme, kind and card label missing');
  await p.getByRole('button', { name: 'Meditation Mondays', exact: true }).first().click();
  await p.getByRole('button', { name: 'Live practice' }).click();
  await p.getByRole('button', { name: 'Live', exact: true }).click();
  await p.getByRole('button', { name: 'Meditation', exact: true }).click();
  await p.getByLabel(/Card label/).fill('NOVEMBER 2026');
  ok(await p.locator('[data-testid=filters]').innerText().then(t => /Meditation Mondays/.test(t) && /Live practice/.test(t) && /Meditation/.test(t)), 'preview lists every filter the item appears under');
  ok(await p.locator('.site-card .lab').innerText() === 'NOVEMBER 2026', 'live preview shows the card label');
  ok(await p.getByRole('button', { name: 'Publish', exact: true }).isEnabled(), 'Publish enabled once the checklist passes');
  await p.screenshot({ path: OUT + '/library-prepare.png', fullPage: true });
  await p.getByRole('button', { name: 'Publish', exact: true }).click();
  await p.getByRole('button', { name: 'Update listing' }).waitFor();
  ok(await p.getByRole('button', { name: 'Unpublish' }).count() === 1, 'after publishing: Update listing and Unpublish');
  ok(await p.getByText(/website was asked to refresh/).count() === 1, 'staff are told the site was asked to refresh');
  let log = fs.readFileSync(OUT + '/mock.log', 'utf8');
  ok(/APPENDED catalog/.test(log), 'catalog row written');
  ok(/SITE REVALIDATE-COURSES POST secret ok/.test(log), 'revalidate-courses called with the shared secret');

  // 3. Multi-teacher programme blocked until every faculty member has submitted
  await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' });
  await p.locator('.ops-lib-row', { hasText: 'The Heart of Recognition' }).getByRole('link', { name: 'Prepare listing' }).click();
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Sādhana School', exact: true }).click();
  await p.getByRole('button', { name: 'Course', exact: true }).click();
  await p.getByLabel(/Card label/).fill('FALL 2026');
  ok(await p.locator('.ops-checklist li', { hasText: 'Waiting on' }).count() === 1, 'checklist names who hasn’t submitted');
  ok(await p.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), 'Publish blocked until every faculty member has submitted');
  ok(await p.locator('.ops-sessions li').count() >= 5, 'sessions come from the programming calendar');

  // 4. Changed in Circle: price and title change
  await setCircle({ spaces: JSON.parse(JSON.stringify([
    { id: 2001, name: 'Meditation Mondays: November (Extended)', slug: 'mm-nov', space_type: 'course', status: 'published', cover_image_url: 'http://localhost:4555/img/cover.png' },
    { id: 2002, name: 'The Heart of Recognition', slug: 'heart', space_type: 'course', status: 'published', cover_image_url: '' },
    { id: 2003, name: 'Spanda Karikas: a close reading', slug: 'spanda', space_type: 'course', status: 'draft', cover_image_url: '' }])),
    paywalls: [{ id: 301, name: 'Meditation Mondays', prices: [{ amount: 20, currency: 'usd', interval: 'month' }], checkout_url: 'https://ss.example.com/checkout/301', space_ids: [2001] },
      { id: 302, name: 'Fall 2026 season', prices: [{ amount: 495, currency: 'usd', interval: 'one_time' }], checkout_url: 'https://ss.example.com/checkout/302', space_ids: [2002] }] });
  await sync();
  await p.goto(BASE + '/ops/library?tab=changed', { waitUntil: 'networkidle' });
  const row = p.locator('.ops-lib-row', { hasText: 'Meditation Mondays' });
  ok(await row.getByText(/Changed in Circle:.*Title.*Price|Changed in Circle:.*Price.*Title/).count() === 1, 'Changed in Circle flag lists title and price');
  await p.screenshot({ path: OUT + '/library-changed.png', fullPage: true });
  await row.getByRole('button', { name: 'Mark as seen' }).click();
  await p.waitForTimeout(1200);
  await p.goto(BASE + '/ops/library?tab=changed', { waitUntil: 'networkidle' });
  ok(await p.locator('.ops-lib-row').count() === 0, 'Mark as seen clears the flag');

  // 5. Changed in onboarding: not live until Update
  await setCell("'Course Pages'!G4", 'A month of Monday practice, now with a Saturday sit.');
  await sync();
  await p.goto(BASE + '/ops/library?tab=changed', { waitUntil: 'networkidle' });
  ok(await p.getByText(/Changed in onboarding:.*Description/).count() === 1, 'onboarding edit after publishing is flagged');
  ok(await p.getByText(/Not live until you press Update/).count() === 1, 'and says it is not live until Update');
  const catBefore = (fs.readFileSync(OUT + '/mock.log', 'utf8').match(/WROTE 'catalog'/g) || []).length;
  await p.locator('.ops-lib-row', { hasText: 'Meditation Mondays' }).getByRole('link', { name: 'Review' }).click();
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Update listing' }).click();
  await p.getByText(/refresh/).first().waitFor();
  ok((await p.locator('textarea').first().inputValue()).includes('Saturday sit'), 'Update brings in the teacher’s edit');
  await p.goto(BASE + '/ops/library?tab=changed', { waitUntil: 'networkidle' });
  ok(await p.locator('.ops-lib-row').count() === 0, 'Update clears the onboarding flag');
  await p.goto(BASE + '/ops/library?tab=published', { waitUntil: 'networkidle' });
  ok(await p.locator('.ops-lib-row').count() === 1, 'it is in Published');

  // 6. Unpublished in Circle → hidden at the next sync
  await setCircle({ spaces: [
    { id: 2001, name: 'Meditation Mondays: November (Extended)', slug: 'mm-nov', space_type: 'course', status: 'draft', cover_image_url: '' },
    { id: 2002, name: 'The Heart of Recognition', slug: 'heart', space_type: 'course', status: 'published', cover_image_url: '' },
    { id: 2003, name: 'Spanda Karikas: a close reading', slug: 'spanda', space_type: 'course', status: 'draft', cover_image_url: '' }] });
  await sync();
  await p.goto(BASE + '/ops/library?tab=skipped', { waitUntil: 'networkidle' });
  ok(await p.getByText(/Hidden on the site because it was unpublished in Circle/).count() === 1, 'a course unpublished in Circle is hidden on the site at the next sync');
  log = fs.readFileSync(OUT + '/mock.log', 'utf8');
  ok(/unpublished/.test(log.split("WROTE").filter(l => /catalog/.test(l)).pop() || ''), 'catalog row written as unpublished');

  // 7. Skip and bring back
  await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' });
  const before = await tile('Skipped');
  await p.locator('.ops-lib-row', { hasText: 'Spanda' }).getByRole('button', { name: 'Skip' }).click();
  await p.waitForTimeout(1200);
  await p.goto(BASE + '/ops/library?tab=skipped', { waitUntil: 'networkidle' });
  ok(await p.locator('.ops-lib-row', { hasText: 'Spanda' }).count() === 1, 'skipped item moves to Skipped');
  await p.locator('.ops-lib-row', { hasText: 'Spanda' }).getByRole('button', { name: 'Bring back' }).click();
  await p.waitForTimeout(1200);

  // 8. Access map
  await p.goto(BASE + '/ops/library', { waitUntil: 'networkidle' });
  ok(await p.getByText(/still need.* a mapping/).count() === 1, 'unmapped paywalls are listed as needing a mapping');
  await p.getByLabel('Access for The Heart of Recognition').selectOption('sadhana_school');
  await p.locator('.ops-map li', { hasText: 'Heart of Recognition' }).getByRole('button', { name: 'Save' }).click();
  await p.waitForTimeout(800);
  await p.reload({ waitUntil: 'networkidle' });
  ok(await p.getByLabel('Access for The Heart of Recognition').inputValue() === 'sadhana_school', 'access mapping saved');

  // 9. Circle was never written to
  log = fs.readFileSync(OUT + '/mock.log', 'utf8');
  ok(!/BLOCKED circle/.test(log), 'no write was ever attempted against Circle');

  // 10. Phone width
  const m = await b.newContext({ viewport: { width: 390, height: 844 } });
  await m.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const q = await m.newPage();
  for (const [name, url] of [['library', '/ops/library'], ['prepare', '/ops/library/' + (await (async () => { await q.goto(BASE + '/ops/library?tab=skipped', { waitUntil: 'networkidle' }); return (await q.locator('.ops-lib-row .ttl').first().getAttribute('href')).split('/').pop(); })())]]) {
    await q.goto(BASE + url, { waitUntil: 'networkidle' });
    const over = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 0, `phone width: no sideways scroll on ${name} (${over})`);
    await q.screenshot({ path: `${OUT}/library-${name}-phone.png`, fullPage: true });
  }
  await b.close();
})();
