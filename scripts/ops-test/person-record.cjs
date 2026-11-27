// EP Ops 2 step 5, the person record (/ops/people/[id]): Overview, Profile and headshot, Invitations and onboarding, Hours, Access, by role;
// the older profile addresses; phone width. Mock only (no database, so hours show the clock note). Needs a fresh run.sh.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const tabs = async p => (await p.locator('nav[aria-label="Person tabs"] a').allInnerTexts()).map(x => x.replace(/\d+$/, '').trim()).join('|');
(async () => {
  const b = await chromium.launch();
  const as = async (c_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: c_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
  const flat = async p => (await p.locator('main.ops').innerText()).replace(/\s+/g, ' ');
  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/people/nataraj%40example.com'); await p.waitForSelector('.ops-name');
  ck('a faculty record: name in the serif heading, breadcrumb back to People', (await p.locator('h1.ops-name').innerText()) === 'Nataraj Chaitanya' && await p.locator('.ops-crumb a[href="/ops/people"]').count() === 1);
  ck('guest faculty: Overview, Profile, Invitations (no Hours, no Access)', (await tabs(p)) === 'Overview|Profile and headshot|Invitations and onboarding');
  ck('Overview says what they need', /What they need.*Bio is more than a year old/.test(await flat(p)) && await p.locator('.ops-tile').count() >= 3);
  await p.goto(U + '/ops/people/nataraj%40example.com?tab=profile'); await p.waitForSelector('[aria-label="Headshot"] img');
  await p.waitForFunction(() => [...document.querySelectorAll('[aria-label="Headshot"] .em-crops img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  ck('Profile and headshot: the profile editor, three crops, publish targets', await p.locator('[aria-label="Profile"]').count() === 1 && await p.locator('[aria-label="Headshot"] .em-crops img').count() === 3 && (await p.locator('[aria-label="Where this appears"]').innerText()).includes('Copy by hand'));
  ck('no second page header inside the record', await p.locator('.soc-head').count() === 0 && await p.locator('h1').count() === 1);
  await p.goto(U + '/ops/people/nataraj%40example.com?tab=invitations'); await p.waitForSelector('#iv-email');
  ck('Invitations: the form is filled in with their name and email', (await p.inputValue('#iv-email')) === 'nataraj@example.com' && (await p.inputValue('#iv-name')) === 'Nataraj Chaitanya');
  ck('Invitations: their onboarding is previewed as they will see it', await p.locator('[aria-label="Their onboarding"]').count() === 1);
  await p.goto(U + '/ops/people/abha%40example.com?tab=profile'); await p.waitForSelector('text=Waiting for review');
  ck('a submitted bio shows its Approve button (not pressed: nothing is written)', await p.getByRole('button', { name: 'Approve for the website' }).count() >= 1);
  await p.goto(U + '/ops/people/tova%40example.com?tab=profile'); await p.waitForSelector('[aria-label="Their onboarding"], .ops-name');
  ck('someone with no profile is offered one', /No profile yet/.test(await flat(p)) && await p.getByRole('button', { name: 'Start a profile' }).count() === 1);
  // staff
  await p.goto(U + '/ops/people/floss%40example.com'); await p.waitForSelector('.ops-name');
  ck('a staff record for a director: Overview, Hours, Access', (await tabs(p)) === 'Overview|Hours|Access');
  ck('staff who host show what is coming up', /Coming up/.test(await flat(p)));
  await p.goto(U + '/ops/people/floss%40example.com?tab=hours'); ck('Hours: the clock note when there is no database', /time clock starts/.test(await flat(p)));
  await p.goto(U + '/ops/people/floss%40example.com?tab=access'); ck('Access: roles, and the Remove button', /Project Manager/.test(await flat(p)) && await p.getByRole('button', { name: 'Remove' }).count() === 1);
  await p.goto(U + '/ops/people/mary%40example.com?tab=access'); ck('a teacher on the team can be sent their onboarding link', await p.getByRole('button', { name: 'Send onboarding link' }).count() === 1);
  await p.goto(U + '/ops/people/nobody%40example.com'); ck('an unknown person is said so, kindly', /We can’t find that person/.test(await flat(p)));
  await p.goto(U + '/ops/people/floss%40example.com?tab=invitations'); ck('a tab that does not exist for them falls back to Overview', /Coming up|What they need/.test(await flat(p)));
  // the older addresses
  await p.goto(U + '/ops/email/teachers?email=nataraj%40example.com'); await p.waitForSelector('.ops-name');
  ck('/ops/email/teachers?email= opens the record on Profile', /\/ops\/people\/nataraj/.test(p.url()) && /tab=profile/.test(p.url()));
  await p.goto(U + '/ops/people?email=mary%40example.com'); await p.waitForSelector('.ops-name'); ck('/ops/people?email= opens the record', /\/ops\/people\/mary/.test(p.url()));
  // roles
  const fl = await as(cookie('floss@example.com')); await fl.goto(U + '/ops/people/floss%40example.com'); await fl.waitForSelector('.ops-name');
  ck('Floss on her own record: Overview, Hours, Access', (await tabs(fl)) === 'Overview|Hours|Access');
  await fl.goto(U + '/ops/people/ichha%40example.com'); ck('Floss on Ichha: no Hours (only a director sees others’ hours)', (await tabs(fl)) === 'Overview|Access');
  const ic = await as(cookie('ichha@example.com')); await ic.goto(U + '/ops/people/ichha%40example.com'); await ic.waitForSelector('.ops-name');
  ck('Ichha on her own record: Overview and Hours, no Access', (await tabs(ic)) === 'Overview|Hours');
  await ic.goto(U + '/ops/people/nataraj%40example.com?tab=profile'); await ic.waitForSelector('[aria-label="Headshot"] img');
  ck('Ichha sees the profile but cannot edit it (no Save, no upload)', await ic.getByRole('button', { name: 'Save', exact: true }).count() === 0 && await ic.getByText('Upload a new headshot').count() === 0);
  ck('Ichha is not offered Invitations on a faculty record', !(await tabs(ic)).includes('Invitations'));
  await ic.goto(U + '/ops/people/floss%40example.com?tab=hours'); ck('Ichha cannot open Floss’s hours', !/time clock starts|This month/.test(await flat(ic)));
  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 });
  for (const u of ['/ops/people/nataraj%40example.com', '/ops/people/nataraj%40example.com?tab=profile', '/ops/people/nataraj%40example.com?tab=invitations', '/ops/people/floss%40example.com?tab=access']) {
    await ph.goto(U + u); await ph.waitForSelector('.ops-name'); await ph.waitForTimeout(800);
    ck(`phone: no sideways scroll (${u.replace('/ops/people/', '')})`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  }
  await ph.screenshot({ path: __dirname + '/out/person-record-phone.png', fullPage: true });
  await p.goto(U + '/ops/people/nataraj%40example.com'); await p.screenshot({ path: __dirname + '/out/person-record-desktop.png', fullPage: true });
  ck('no page errors', !p.errs.length && !ph.errs.length && !fl.errs.length && !ic.errs.length); if (p.errs.length) console.log(p.errs);
  await b.close(); process.exit(bad ? 1 : 0);
})();
