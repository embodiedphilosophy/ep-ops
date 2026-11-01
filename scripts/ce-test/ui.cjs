// Click-through of the Circle CE page (public/circle/ce.js) in a stand-in Circle page, with the site API mocked.
// Screenshots at desktop and phone width in scripts/ce-test/out/. No network.
// Run: node scripts/ce-test/ui.cjs   (Playwright: the cloud image has it in /opt/node-tools)
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = fs.readFileSync(path.join(__dirname, '../../public/circle/ce.js'), 'utf8');
const MODS = { classical: ['Origins and Hidden History', 'Classical Yoga', 'The Five Vṛttis', 'The Eight Limbs', 'The Cause of Suffering', 'The Yoga Canon'], meditation: ['The Benefits of a Meditation Practice', 'Spiritual Microdosing', 'Working with Metaphor, Mantra & Meditation', 'Healing Stress'] };
const row = (slug, title, hours, category, status, done, total, extra = {}) => ({ slug, title, hours, category, modules: MODS[slug] || ['Module one', 'Module two', 'Module three'], status, lessonsDone: done, lessonsTotal: total, percent: total ? Math.round(done / total * 100) : (status === 'reflect' ? 100 : 0), cert: null, url: 'https://ss.embodiedphilosophy.com/c/' + slug, ...extra });
const summary = (afterReflect) => ({
  eligible: true, today: '2026-10-15', renewal: '2027-03-01',
  cycle: { start: '2024-03-01', end: '2027-03-01', set: true, hours: afterReflect ? 35 : 23, need: 30, met: !!afterReflect },
  certifiedHours: afterReflect ? 35 : 23, availableHours: 115,
  byCategory: afterReflect ? { 'Yoga Humanities': 19.5, 'Anatomy & Physiology': 3.5, 'Techniques, Training & Practice': 12 } : { 'Yoga Humanities': 19.5, 'Anatomy & Physiology': 3.5 },
  rows: [
    afterReflect ? row('meditation', 'Meditation for Real Life', 12, 'Techniques, Training & Practice', 'certified', 8, 8, { percent: 100, cert: { id: 'EP-CE-2026-0142', status: 'issued', issuedAt: '2026-10-15T12:00:00Z', pdf: 'https://www.embodiedphilosophy.com/api/ce/certificate/EP-CE-2026-0142?k=x' } })
      : row('meditation', 'Meditation for Real Life', 12, 'Techniques, Training & Practice', 'reflect', 8, 8, { percent: 100 }),
    row('sound', 'Sound, Mantra & Sacred Speech', 14, 'Techniques, Training & Practice', 'progress', 4, 10),
    row('myth', 'Myth, Shadow & the Inner Journey', 56, 'Yoga Humanities', 'progress', 3, 25),
    row('classical', 'Classical Yoga & the Yoga Sūtras', 19.5, 'Yoga Humanities', 'certified', 12, 12, { percent: 100, cert: { id: 'EP-CE-2026-0101', status: 'issued', issuedAt: '2026-08-02T12:00:00Z', pdf: 'https://www.embodiedphilosophy.com/api/ce/certificate/EP-CE-2026-0101?k=x' } }),
    row('subtle', 'The Subtle Body: Chakras, Prāṇa & Breath', 3.5, 'Anatomy & Physiology', 'certified', 5, 5, { percent: 100, cert: { id: 'EP-CE-2026-0120', status: 'issued', issuedAt: '2026-09-18T12:00:00Z', pdf: '#' } }),
    row('death', 'Death, Dreams & the Luminous Mind', 10, 'Yoga Humanities', 'new', 0, 6),
  ],
});
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f4f2ee}</style></head><body>
<div class="[container-type:inline-size] bg-secondary"><div>Circle's own page content</div></div>
<script>window.circleUser = { signedIn: true, identityToken: 'test', isAdmin: false };</script></body></html>`;

(async () => {
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => pw.chromium.launch());
  const errors = [];
  for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
    let reflected = false, posts = [];
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'ss.embodiedphilosophy.com' && u.pathname === '/c/ce-credits') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE + `<script>${SCRIPT}</script>` });
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/api/member/session') return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ session: 's', firstName: 'Maya', tier: { tier: 'wisdom_plus' } }) });
      if (u.pathname === '/api/member/ce' && route.request().method() === 'GET') return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify(summary(reflected)) });
      if (u.pathname === '/api/member/ce') {
        const b = JSON.parse(route.request().postData() || '{}'); posts.push(b);
        if (b.action === 'reflect' && b.r1.split(/\s+/).length < 15) return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'Please write a few sentences for each question' }) });
        if (b.action === 'renewal') return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ ...summary(reflected), renewal: b.renewal }) });
        reflected = true;
        return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ cert: { id: 'EP-CE-2026-0142', status: 'issued', emailed: true }, summary: summary(true) }) });
      }
      if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return route.continue();
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://ss.embodiedphilosophy.com/c/ce-credits');
    await page.waitForSelector('.epc-h1');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`${label}: horizontal overflow on tracker`);
    await page.screenshot({ path: path.join(OUT, `ui-${label}-tracker.png`), fullPage: true });
    // Open modules, filter, then reflect
    await page.click('[data-act=toggle][data-slug=classical]');
    await page.click('[data-filter=certified]');
    if ((await page.$$('.epc-row')).length !== 2) errors.push(`${label}: certified filter should show 2`);
    await page.click('[data-filter=all]');
    await page.click('.epc-banner [data-act=reflect]');
    await page.waitForSelector('[data-form=reflect]');
    await page.screenshot({ path: path.join(OUT, `ui-${label}-reflect.png`), fullPage: true });
    // Too short → error, text kept
    await page.fill('#epc-q1', 'Too short'); await page.fill('#epc-q2', 'Also short'); await page.fill('#epc-nm', 'Maya Albright');
    await page.check('.epc-attest input');
    await page.click('[data-form=reflect] button[type=submit]');
    await page.waitForSelector('.epc-err');
    if ((await page.inputValue('#epc-q1')) !== 'Too short') errors.push(`${label}: reflection text lost after an error`);
    await page.fill('#epc-q1', 'The pathway changed how I hold attention in class, moving from technique to a felt sense of rest that I can now name and return to without strain.');
    await page.fill('#epc-q2', 'I will open each class with five minutes of breath awareness and metaphor before any posture work.');
    await page.click('[data-form=reflect] button[type=submit]');
    await page.waitForSelector('.epc-done');
    await page.screenshot({ path: path.join(OUT, `ui-${label}-issued.png`), fullPage: true });
    await page.click('[data-act=back]');
    await page.waitForSelector('.epc-cards');
    // Renewal edit
    await page.click('[data-act=renewal]'); await page.fill('#epc-rd', '2027-04-01'); await page.click('[data-form=renewal] button[type=submit]');
    await page.waitForSelector('[data-act=renewal]');
    if (!posts.some(p => p.action === 'renewal' && p.renewal === '2027-04-01')) errors.push(`${label}: renewal not posted`);
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error('UI problems:\n' + errors.join('\n')); process.exit(1); }
  console.log('CE page click-through passed · screenshots in scripts/ce-test/out/ui-*.png');
})();
