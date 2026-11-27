// EP Ops 2 step 6, Publish › Compose: one frame with an Email / Post / Video switch hosting the existing editors in three columns
// (details, preview, checks), the older addresses (?view=compose, ?view=compose-email, /ops/social/compose, /ops/email/edit), the
// composer's own type= and date=, roles, phone width. Nothing is saved or sent. Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
(async () => {
  const b = await chromium.launch();
  const as = async (v, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: v, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const kinds = async p => (await p.locator('.pub-kinds a').allInnerTexts()).join('|');
  const x = async (p, sel) => (await p.locator(sel).first().boundingBox()).x;
  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/publish?view=compose'); await p.waitForSelector('.cmp-cols');
  ck('Compose with no kind is a New post (the old address)', (await p.locator('h1').innerText()).includes('New post') && await p.locator('.pub-kinds a[aria-current=page]', { hasText: 'Post' }).count() === 1);
  ck('the switch offers Email, Post and Video cut to a director', (await kinds(p)) === 'Email|Post|Video cut');
  ck('post: details, then preview, then picture and checks, left to right', (await x(p, '.cmp-details')) < (await x(p, '.cmp-phone')) && (await x(p, '.cmp-phone')) < (await x(p, '.cmp-media')));
  ck('post: the guardrail checks are on the right', (await x(p, '.cmp-guard')) > (await x(p, '.cmp-phone')));
  await p.goto(U + '/ops/publish?view=compose&type=Practice&date=2026-12-09'); await p.waitForSelector('.cmp-cols');
  ck('the composer’s own type= and date= still seed a new post', await p.locator('#c-pillar').inputValue() === 'Practice' && await p.locator('#c-publish_date').inputValue() === '2026-12-09');
  await p.goto(U + '/ops/publish?view=compose&row=3'); await p.waitForSelector('.cmp-cols'); ck('?row= edits that post', (await p.locator('h1').innerText()).includes('Edit post'));
  await p.goto(U + '/ops/social/compose?row=3'); await p.waitForSelector('.cmp-cols'); ck('/ops/social/compose?row= lands on it, query kept', p.url().includes('row=3') && p.url().includes('view=compose'));
  // email
  await p.locator('.pub-kinds a', { hasText: 'Email' }).click(); await p.waitForSelector('.em-edit');
  ck('the switch opens a new email', p.url().includes('kind=email') && (await p.locator('h1').innerText()).includes('New email'));
  ck('email: details, then preview, then checks, left to right', (await x(p, '.em-edit section[aria-label=Details]')) < (await x(p, '.em-pre')) && (await x(p, '.em-pre')) < (await x(p, '.em-checks')));
  ck('email: Checks says they appear once saved', /once the email is saved/.test(await p.locator('.em-checks').innerText()));
  for (const u of ['/ops/publish?view=compose-email', '/ops/email/edit', '/ops/publish?view=compose&kind=email&date=2026-12-09']) { await p.goto(U + u); await p.waitForSelector('.em-edit'); ck(`${u} opens the email editor`, true); }
  ck('?date= still fills the send date', await p.locator('input[type=date]').first().inputValue() === '2026-12-09');
  ck('the email editor still saves only with a subject (Save disabled)', await p.getByRole('button', { name: 'Save', exact: true }).isDisabled());
  // video
  await p.goto(U + '/ops/publish?view=compose&kind=video'); await p.waitForSelector('.pub-compose.k-video');
  ck('video: the picker page loads for a director', /video cut/i.test(await p.locator('h1').innerText()) && await p.locator('a[href="/ops/publish?view=video"]').count() >= 1);
  await p.goto(U + '/ops/publish?view=video'); ck('the Video view still lists proposals and the review queue', await p.locator('nav[aria-label=YouTube] a').count() === 4);
  // roles
  const fl = await as(cookie('floss@example.com')); await fl.goto(U + '/ops/publish?view=compose&kind=video'); await fl.waitForSelector('.cmp-cols');
  ck('Floss asking for a Video cut gets the post composer, and no Video choice', (await kinds(fl)) === 'Email|Post');
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops/publish?view=compose'); ck('a teacher is sent away', !new URL(te.url()).pathname.startsWith('/ops/publish'));
  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 });
  for (const k of ['post', 'email', 'video']) {
    await ph.goto(U + `/ops/publish?view=compose&kind=${k}`); await ph.waitForSelector('.pub-compose'); await ph.waitForTimeout(600);
    ck(`phone ${k}: no sideways page scroll`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  }
  ck('phone: the switch buttons are 44px tall', (await ph.locator('.pub-kinds a').first().boundingBox()).height >= 44);
  ck('no page errors', [p, fl, ph].every(z => !z.errs.length));
  await b.close(); console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
})();
