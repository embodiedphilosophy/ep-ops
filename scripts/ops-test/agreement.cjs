// The agreement step of teacher onboarding (/teach): the built-in General Teaching Agreement, a director trying it
// as a teacher (nothing saved), the teacher signing it (archived on Faculty Invitations), finishing blocked until
// signed, the step gone once signed, staff skipping it, and the Ops views. Start from a fresh run.sh.
// Writes go to the mock (out/mock.log); nothing is emailed (RESEND_API_KEY is unset).
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
const OUT = __dirname + '/out';
const cookie = fs.readFileSync(OUT + '/cookie.txt', 'utf8').trim();
const mint = email => execSync(`node ${__dirname}/cookie.mjs ${email}`, { env: process.env }).toString().trim();
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const call = (p, path, body) => p.evaluate(async ([u, b]) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; }, [path, body]);
const get = (p, path) => p.evaluate(async u => (await fetch(u)).json(), path);
const invWrites = () => fs.readFileSync(OUT + '/mock.log', 'utf8').split('\n').filter(l => /Faculty Invitations/.test(l) && /WROTE|APPENDED|CREATED/.test(l)).length;

(async () => {
  const b = await chromium.launch();
  const ctx = async (email, vp = { width: 1366, height: 900 }) => {
    const c = await b.newContext({ viewport: vp });
    await c.addCookies([{ name: 'ep_ops', value: email ? mint(email) : cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => console.log('PAGE ERROR', email || 'jacob', e.message)); return p;
  };
  const jacob = await ctx('');

  // 1. Ops: the general agreement is offered for invitations, and Mary shows as having one to sign
  await jacob.goto(`${BASE}/ops/people?view=invitations`, { waitUntil: 'networkidle' });
  ok(await jacob.locator('option', { hasText: 'General Teaching Agreement' }).count() > 0, 'invitation form offers the General Teaching Agreement');
  const list = await get(jacob, '/api/ops/onboarding');
  const mary = (list.people || []).find(x => x.email === 'mary@example.com');
  ok(mary && /agreement to sign/i.test(mary.status), `Faculty → Onboarding says Mary has an agreement to sign (${mary?.status})`);
  ok(!/agreement/i.test((list.people || []).find(x => x.email === 'floss@example.com')?.status || ''), 'staff (Floss) aren’t asked');

  // 2. A director trying it as Mary: the step is there, signing saves nothing
  const before = invWrites();
  await jacob.goto(`${BASE}/teach?as=mary@example.com`, { waitUntil: 'networkidle' });
  ok(await jacob.locator('.t-rail li', { hasText: 'Agreement' }).count() === 1, 'trying it out: Agreement step listed');
  await jacob.locator('.t-rail li button', { hasText: 'Agreement' }).click().catch(() => {});
  await jacob.locator('button', { hasText: /Start|Let’s begin|Begin|Continue/ }).first().click().catch(() => {});
  await jacob.waitForSelector('.t-contract', { timeout: 10000 });
  const txt = await jacob.locator('.t-contract').innerText();
  ok(/GENERAL TEACHING AGREEMENT/.test(txt) && /CHITHEADS Live with Mary Reilly Nichols/.test(txt) && /as agreed with EP in writing/.test(txt) && !/\{\{/.test(txt), 'agreement lists her offerings, no placeholders left');
  await jacob.fill('#t-sig', 'Mary Reilly Nichols');
  await jacob.locator('.t-consent input').check();
  await jacob.locator('button', { hasText: 'Sign the agreement' }).click();
  await jacob.waitForSelector('text=Your agreement is signed', { timeout: 10000 }).catch(() => {});
  ok(/nothing was saved/.test(await jacob.locator('main').last().innerText()), 'trying it out says nothing was saved');
  ok(invWrites() === before, 'trying it out wrote nothing');

  // 3. Mary herself, on a phone: finishing is blocked, she signs, it is archived
  const m = await ctx('mary@example.com', { width: 390, height: 844 });
  await m.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  const fin = await call(m, '/api/teach/finish', {});
  ok(fin.status === 400, `finishing before signing is refused (${fin.error})`);
  ok((await call(m, '/api/teach/agreement', { name: 'Mary Reilly Nichols', agree: false })).status === 400, 'no consent tick → refused');
  ok((await call(m, '/api/teach/agreement', { name: 'M', agree: true })).status === 400, 'no real name → refused');
  await m.locator('.t-rail li button', { hasText: 'Agreement' }).click().catch(() => {});
  await m.locator('button', { hasText: /Start|Let’s begin|Begin|Continue/ }).first().click().catch(() => {});
  await m.waitForSelector('.t-contract');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'agreement step fits a phone');
  await m.screenshot({ path: OUT + '/agreement-phone.png', fullPage: true });
  ok(await m.locator('button', { hasText: 'Sign the agreement' }).isDisabled(), 'sign button waits for name and tick');
  await m.fill('#t-sig', 'Mary Reilly Nichols');
  await m.locator('.t-consent input').check();
  await m.locator('button', { hasText: 'Sign the agreement' }).click();
  await m.waitForSelector('text=Your agreement is signed', { timeout: 15000 });
  ok(invWrites() > before, 'signed agreement archived on Faculty Invitations');
  await m.locator('button', { hasText: 'Continue to your bio' }).click();
  ok(/Bio & headshot/i.test(await m.locator('main').last().innerText()), 'continues to Bio & headshot');
  const again = await call(m, '/api/teach/agreement', { name: 'Mary Reilly Nichols', agree: true });
  ok(again.ok && again.agreement.status === 'signed', 'signing twice keeps the first signature');
  const fin2 = await call(m, '/api/teach/finish', {});
  ok(!/agreement/i.test(fin2.error || ''), 'finishing is no longer blocked by the agreement');

  // 4. Reload: the step is gone; Ops shows the archive
  await m.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  ok(await m.locator('.t-rail li', { hasText: 'Agreement' }).count() === 0, 'once signed, no Agreement step');
  await jacob.goto(`${BASE}/ops/people?view=invitations`, { waitUntil: 'networkidle' });
  const row = jacob.locator('.ops-invites li', { hasText: 'Mary Reilly Nichols' }).first();
  ok(/signed during onboarding/.test(await row.innerText()), 'Invitations lists it as signed during onboarding');
  const href = await row.locator('a', { hasText: /agreement|contract/i }).first().getAttribute('href').catch(() => '');
  if (href) {
    await jacob.goto(BASE + href, { waitUntil: 'networkidle' });
    const doc = await jacob.locator('main').last().innerText();
    ok(/Mary Reilly Nichols/.test(doc) && /Fingerprint [0-9a-f]{16}/.test(doc) && /Jacob Kyle/.test(doc), 'printable signed copy with fingerprint and countersignature');
  } else ok(false, 'link to the signed agreement on the invitation row');
  ok(!/agreement to sign/i.test(((await get(jacob, '/api/ops/onboarding')).people || []).find(x => x.email === 'mary@example.com')?.status || ''), 'Faculty → Onboarding no longer says to sign');

  // 5. Staff are never asked
  const floss = await ctx('floss@example.com');
  await floss.goto(`${BASE}/teach`, { waitUntil: 'networkidle' });
  ok(await floss.locator('.t-rail li', { hasText: 'Agreement' }).count() === 0, 'staff see no Agreement step');
  ok((await call(floss, '/api/teach/agreement', { name: 'Floss Harry', agree: true })).status === 400, 'staff can’t sign one');

  await b.close();
})();
