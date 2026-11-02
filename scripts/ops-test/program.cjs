// Programming → programs: add a program of several sessions, name its modules, change a setting for every
// session, add one more session; then open an existing series (sadhana-fall-2026) as one program.
// Writes go to the mock; check out/mock.log (WROTE …'Schedule' / 'Event Details', Change Log appends).
const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const api = (p, body) => p.evaluate(async b => { const r = await fetch('/api/ops/program', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json()) }; }, body);
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await c.newPage();
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));

  // 1. An existing series shows as one program row
  await p.goto(`${BASE}/ops/events?all=1`, { waitUntil: 'networkidle' });
  const rows = await p.locator('.ops-events .ttl').allInnerTexts();
  ok(rows.filter(t => /Heart of Recognition/.test(t)).length === 1, 'the Fall SS series is one row');

  // 2. Add a program through the form
  await p.locator('button', { hasText: '+ Add program' }).click();
  await p.fill('#pg-name', 'Spanda Kārikās: a close reading');
  await p.fill('#pg-parent', 'Wisdom School');
  await p.selectOption('#pg-track', 'EVENT');
  await p.fill('#pg-start', '2026-11-04');
  await p.fill('#pg-count', '4');
  await p.fill('#pg-teachers', 'Jacob Kyle');
  await p.fill('#pg-emails', 'jacob@embodiedphilosophy.com');
  ok(/Nov 25/.test(await p.locator('.ops-program-add').innerText()), 'preview shows the last session date');
  await p.locator('button', { hasText: 'Add 4 sessions' }).click();
  await p.waitForURL(/event=P-spanda/, { timeout: 15000 });
  await p.waitForSelector('.ops-modules li', { timeout: 15000 });
  ok(await p.locator('.ops-modules li').count() === 4, 'drawer lists 4 sessions');

  // 3. Name two modules
  const li = p.locator('.ops-modules li');
  await li.nth(0).locator('input').first().fill('The vibration of awareness');
  await li.nth(0).locator('textarea').fill('We open the first section of the Spanda Kārikās.');
  await li.nth(1).locator('input').first().fill('Sleep, dream and waking');
  await p.locator('button', { hasText: 'Save 2 modules' }).click();
  await p.waitForSelector('.ops-program .bar .hint', { timeout: 15000 });
  ok(/Saved/.test(await p.locator('.ops-program .bar .hint').innerText()), 'modules saved');

  // 4. What the website will read: Public Title "Program: Module", Summary, Series
  const g = await p.evaluate(async () => (await fetch('/api/ops/program?series=spanda-karikas-a-close-reading-2026-11')).json());
  ok(g.sessions?.[0]?.values['Public Title'] === 'Spanda Kārikās: a close reading — The vibration of awareness', 'public title = title — module (title has a colon)');
  ok(g.sessions?.[0]?.values.Summary.startsWith('We open'), 'summary saved');
  ok(g.sessions?.[2]?.values['Public Title'] === 'Spanda Kārikās: a close reading', 'untitled module shows the program name');

  // 5. For every session: course host
  await p.locator('.ops-program nav a', { hasText: 'For every session' }).click();
  await p.fill('#ps-Course\\ Host', 'Floss Harry');
  await p.locator('button', { hasText: 'Save for every session' }).click();
  await p.waitForTimeout(2500);
  const g2 = await p.evaluate(async () => (await fetch('/api/ops/program?series=spanda-karikas-a-close-reading-2026-11')).json());
  ok(g2.sessions.every(s => s.values['Course Host'] === 'Floss Harry'), 'course host on every session');

  ok(g.shared?.['Parent Program'] === 'Wisdom School', 'part of Wisdom School');

  // 5b. Rename from the heading; part-of from For every session
  await p.goto(`${BASE}/ops/events?event=P-spanda-karikas-a-close-reading-2026-11`, { waitUntil: 'networkidle' });
  ok(/Wisdom School/i.test(await p.locator('.ops-drawer .ops-parent').innerText()), 'drawer shows what it falls under');
  await p.locator('.ops-drawer .ops-title-edit button').click();
  await p.fill('.ops-title-form input', 'Spanda Kārikās Close Reading');
  await p.locator('button', { hasText: 'Save title' }).click();
  await p.waitForFunction(() => /Spanda Kārikās Close Reading/.test(document.querySelector('.ops-drawer h2')?.innerText || ''), null, { timeout: 15000 });
  const g3 = await p.evaluate(async () => (await fetch('/api/ops/program?series=spanda-karikas-a-close-reading-2026-11')).json());
  ok(g3.sessions.every(s => s.values['Program Name'] === 'Spanda Kārikās Close Reading'), 'title renamed on every session');
  ok(g3.sessions[0].values['Public Title'] === 'Spanda Kārikās Close Reading: The vibration of awareness', 'website title follows the rename');
  ok(g3.sessions.every(s => s.values['Parent Program'] === 'Wisdom School'), 'part of is kept');
  await p.locator('.ops-program nav a', { hasText: 'For every session' }).click();
  await p.fill('#ps-Parent\\ Program', 'Sādhana School');
  await p.locator('button', { hasText: 'Save for every session' }).click();
  await p.waitForTimeout(2500);
  const g4 = await p.evaluate(async () => (await fetch('/api/ops/program?series=spanda-karikas-a-close-reading-2026-11')).json());
  ok(g4.sessions.every(s => s.values['Parent Program'] === 'Sādhana School'), 'part of changed for every session');
  ok(g4.sessions[0].values['Public Title'] === 'Spanda Kārikās Close Reading: The vibration of awareness', 'part of leaves the website title alone');

  // 6. Add a session (keeps the weekly rhythm)
  const r = await api(p, { action: 'add-session', series: 'spanda-karikas-a-close-reading-2026-11' });
  ok(r.date === '2026-12-02', `added session on ${r.date}`);
  // 7. Refusals
  ok((await api(p, { action: 'create', name: 'Dup', track: 'EVENT', start: '2026-12-01', count: 2, series: 'spanda-karikas-a-close-reading-2026-11' })).status === 400, 'a used series name is refused');
  ok((await api(p, { action: 'create', name: 'Past', track: 'EVENT', start: '2020-01-01', count: 2 })).status === 400, 'a past start is refused');
  ok((await api(p, { action: 'modules', series: 'spanda-karikas-a-close-reading-2026-11', modules: [{ id: 'E001', module: 'x' }] })).status === 400, 'a session from another program is refused');

  // 8. The new program on the list, as one row; the existing series drawer opens
  await p.goto(`${BASE}/ops/events?all=1`, { waitUntil: 'networkidle' });
  ok((await p.locator('.ops-events .ttl').allInnerTexts()).filter(t => /Spanda Kārikās Close Reading/.test(t)).length === 1, 'new program is one row');
  await p.goto(`${BASE}/ops/events?event=P-sadhana-fall-2026`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ops-modules li', { timeout: 15000 });
  ok(await p.locator('.ops-modules li').count() >= 5, 'existing series opens as a program');

  // Phone width
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/ops/events?event=P-spanda-karikas-a-close-reading-2026-11`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ops-modules li', { timeout: 15000 });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on a phone');
  await p.screenshot({ path: __dirname + '/out/program-phone.png', fullPage: false });
  await b.close();
})();
