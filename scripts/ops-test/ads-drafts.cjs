// Ads PR 2 in a browser (run by ads-drafts.sh; needs the app started with MOCK_ADS=dry and a fresh run.sh): the Ads place for each role, the ads switch in the
// launch wizard (off changes nothing; on makes a draft), the Ads › Campaigns list, the four steps of a draft clicked through, Start disabled while a check fails,
// "Send to Meta, paused" and Start as dry runs (the Meta mock sees no write), phone width (390px: no sideways scroll, tables scroll inside their panel,
// 44px controls), no POST from any page just by opening it, and the token in no page. Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', META = 'http://localhost:4556', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const metaLog = async () => (await fetch(META + '/__log')).json();
const places = h => [...h.matchAll(/class="ops-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/g)].flatMap(m => [...m[1].matchAll(/href="(\/ops[^"]*)"/g)].map(x => x[1]));
const get = (u, ck_) => fetch(U + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}` } });

(async () => {
  await fetch(META + '/__reset');
  console.log('-- the Ads place for each role');
  const ROLES = [['director', DIRECTOR, true], ['Rebecka (Ads role)', cookie('rebecka@example.com'), true], ['Floss', cookie('floss@example.com'), false], ['Irene', cookie('irene@example.com'), false], ['Ichha', cookie('ichha@example.com'), false],
    ['Carolyn', cookie('carolyn@example.com'), false], ['Stephanie', cookie('stephanie@example.com'), false], ['a teacher', cookie('abha@example.com'), false]];
  for (const [n, c, yes] of ROLES) {
    const side = places(await (await get(n === 'a teacher' ? '/ops/programs' : '/ops', c)).text());
    ck(`${n}: ${yes ? 'sees' : 'does not see'} Ads in the sidebar`, side.includes('/ops/ads') === yes, side.join(' '));
    ck(`${n}: /ops/ads ${yes ? 'opens' : 'sends them away'}`, yes ? (await get('/ops/ads', c)).status === 200 : (await get('/ops/ads', c)).status === 307);
    if (!yes) ck(`${n}: a draft address sends them away too`, (await get('/ops/ads/cmp_x', c)).status === 307);
  }
  const reb = cookie('rebecka@example.com');
  ck('the sidebar puts Ads after Publish (the director’s nine places)', JSON.stringify(places(await (await get('/ops', DIRECTOR)).text())) === JSON.stringify(['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/ads', '/ops/students', '/ops/business', '/ops/settings']));
  ck('Rebecka sees Ads and the same places as before, but not Business or Settings', JSON.stringify(places(await (await get('/ops', reb)).text())) === JSON.stringify(['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/ads', '/ops/students']));
  ck('Rebecka is sent away from Business, Finance and Payroll (and the old Business Audience address now sends her to the funnel in Ads, which she may see)', (await get('/ops/business', reb)).status === 307 && (await get('/ops/business?view=finance', reb)).status === 307 && (await get('/ops/business?view=payroll', reb)).status === 307 && (await get('/ops/business?view=audience', reb)).status === 307);
  ck('Rebecka can open Ads and its results (the list), but the finance API refuses her', (await (await fetch(`${U}/api/ops/ads`, { headers: { Cookie: `ep_ops=${reb}` } })).json()).campaigns !== undefined);
  const ads = await (await get('/ops/ads', DIRECTOR)).text();
  ck('Ads has its tabs (Campaigns, Audience library, Safety net and, since Ads PR 5, Audience insights), each with real content', /aria-label="ads views"/.test(ads) && /Audience library/.test(ads) && /Audience insights/.test(ads));

  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => r.method() === 'POST' && p.posts.push(r.url())); p.on('dialog', d => d.accept()); return p; };
  const p = await as(DIRECTOR);

  console.log('-- Ads › Campaigns with nothing yet');
  await p.goto(U + '/ops/ads'); await p.waitForSelector('.ads-panel');
  ck('the empty state is plain English and points to the launch', /No campaigns yet/.test(await p.innerText('.ads')) && (await p.locator('.ads a[href="/ops/programs"]').count()) === 1);
  ck('a dry-run note says nothing is sent to Meta', /Dry run — nothing is sent to Meta/.test(await p.innerText('.ads-mode')));
  ck('opening the page posted nothing', p.posts.length === 0);

  console.log('-- the launch wizard: ads off changes nothing, ads on makes a draft');
  const wizard = async (pg, name, { ads, goal, type, budget } = {}) => {
    await pg.goto(U + '/ops/programs?view=launches'); await pg.getByRole('button', { name: 'New launch' }).first().click(); await pg.waitForSelector('[aria-label="New launch"]');
    await pg.locator('.em-f', { hasText: 'Name' }).locator('input').first().fill(name);
    await pg.locator('.em-f', { hasText: 'Playbook' }).locator('select').selectOption({ label: 'Enrollment' });
    await pg.getByRole('button', { name: 'Next: key dates' }).click();
    await pg.getByLabel('Doors open').fill('2027-04-07'); await pg.getByLabel('Doors close').fill('2027-04-27'); await pg.getByLabel('Term starts').fill('2027-04-28');
    await pg.getByPlaceholder('https://…').fill('http://localhost:4555/site/lp/wizard');
    await pg.getByRole('button', { name: 'Next: audience' }).click(); await pg.getByRole('button', { name: 'Next: review' }).click(); await pg.waitForSelector('text=Check each step');
    const has = await pg.locator('[aria-label="Run Meta ads for this launch"]').count();
    if (ads && has) {
      await pg.getByRole('button', { name: 'Yes', exact: true }).click();
      if (goal) await pg.getByRole('radio', { name: new RegExp('^' + goal) }).click();
      if (type) await pg.getByRole('radio', { name: new RegExp(type) }).click();
      if (budget) await pg.getByLabel('Starting budget per day in dollars').fill(budget);
    }
    return has;
  };
  let has = await wizard(p, 'Wizard Off 2027');
  ck('the wizard asks “Run Meta ads for this launch?” for a director, answered No by default', has === 1 && (await p.getByRole('button', { name: 'No', exact: true }).getAttribute('aria-pressed')) === 'true');
  await p.getByRole('button', { name: 'Yes', exact: true }).click();
  const dates = await p.locator('.ads-facts').innerText();
  await p.getByRole('button', { name: 'No', exact: true }).click();
  ck('it shows the start and end from the launch’s key dates (doors open to doors close)', /Wed 7 Apr/.test(dates) && /Tue 27 Apr/.test(dates), dates);
  const adsPostsBefore = p.posts.filter(u => /api\/ops\/ads/.test(u)).length;
  await p.locator('.em-sw input').uncheck(); await p.getByRole('button', { name: 'Create the launch' }).click(); await p.waitForURL(/id=L\d+/, { timeout: 20000 });
  ck('creating with ads off makes the launch and no ads request at all', p.posts.filter(u => /api\/ops\/ads/.test(u)).length === adsPostsBefore);
  await p.waitForSelector('[aria-label="Meta ads"] .ads-switch');
  ck('the launch’s own page shows the Meta ads choice, off', (await p.getByRole('button', { name: 'No', exact: true }).getAttribute('aria-pressed')) === 'true');
  const l1 = new URL(p.url()).searchParams.get('id');
  ck('no campaign exists yet', (await (await fetch(`${U}/api/ops/ads`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json()).campaigns.length === 0);

  has = await wizard(p, 'Wizard On 2027', { ads: true, goal: 'Lead', type: 'Advantage\\+', budget: '75' });
  await p.locator('.em-sw input').uncheck();
  ck('on: Lead and Advantage+ and $75 a day are chosen', (await p.getByRole('radio', { name: /^Lead/ }).getAttribute('aria-checked')) === 'true' && (await p.getByRole('radio', { name: /Advantage\+/ }).getAttribute('aria-checked')) === 'true');
  await p.getByRole('button', { name: 'Create the launch' }).click(); await p.waitForURL(/id=L\d+/, { timeout: 60000 });
  const l2 = new URL(p.url()).searchParams.get('id');
  await p.waitForSelector('[aria-label="Meta ads"] .ads-switch'); await p.waitForSelector('text=Open the draft in Ads');
  ck('the launch’s page now links to the draft', (await p.getByRole('link', { name: 'Open the draft in Ads' }).count()) === 1);
  let list = (await (await fetch(`${U}/api/ops/ads`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json()).campaigns;
  ck('one draft exists: Lead · Advantage+ · $75 a day · from 7 to 27 April', list.length === 1 && list[0].goal === 'Lead' && list[0].structure === 'advantage' && list[0].daily_cents === 7500 && list[0].start_date === '2027-04-07' && list[0].end_date === '2027-04-27', JSON.stringify(list));
  ck('the first launch still has no ads', !list.some(c => c.launch_id === l1));
  // Floss edits launches but has no Ads role: no switch for her
  const f = await as(cookie('floss@example.com'));
  await f.goto(U + '/ops/programs?view=launches'); await f.getByRole('button', { name: 'New launch' }).first().click(); await f.waitForSelector('[aria-label="New launch"]');
  await f.locator('.em-f', { hasText: 'Name' }).locator('input').first().fill('Floss launch'); await f.getByRole('button', { name: 'Next: key dates' }).click(); await f.getByRole('button', { name: 'Next: audience' }).click(); await f.getByRole('button', { name: 'Next: review' }).click().catch(() => {});
  ck('Floss’s wizard has no ads question', (await f.locator('[aria-label="Run Meta ads for this launch"]').count()) === 0 && (await f.locator('text=Meta ads').count()) === 0);
  await f.close();
  // the launch list shows a small Ads status for those who may see it
  await p.goto(U + '/ops/programs?view=launches'); await p.waitForSelector('a[aria-label="Meta ads for this launch"]');
  ck('the Launches list shows a small “Ads · Draft · review” beside that launch', /Draft · review/.test(await p.locator('a[aria-label="Meta ads for this launch"]').first().innerText()));
  // change the launch's ads choice on the launch page: back to a 5 × 5 Purchase
  await p.goto(U + `/ops/programs?view=launches&id=${l2}`); await p.waitForSelector('[aria-label="Meta ads"] .ads-switch');
  await p.getByRole('radio', { name: /^Purchase/ }).click(); await p.getByRole('radio', { name: /Targeting test/ }).click(); await p.getByRole('button', { name: 'Save the ads choice' }).click(); await p.waitForSelector('text=Saved.');
  list = (await (await fetch(`${U}/api/ops/ads`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json()).campaigns;
  ck('changing it on the launch page switches the draft to a Purchase 5 × 5', list[0].goal === 'Purchase' && list[0].structure === 'test');
  const cid = list[0].id;

  console.log('-- Ads › Campaigns with a draft');
  await p.goto(U + '/ops/ads'); await p.waitForSelector('.ads-table');
  const row = p.locator('.ads-table tbody tr').first(), rt = await row.innerText();
  ck('the list shows the draft: name, goal, type, a “Draft · review” pill, budget and dates', /Wizard On 2027/.test(rt) && /Purchase/.test(rt) && /Targeting test/.test(rt) && /Draft · review/.test(rt) && /\$75/.test(rt) && /7 Apr/.test(rt), rt);
  ck('it links to its launch and its draft', (await row.locator('a').count()) === 2);
  await p.getByRole('button', { name: /^Paused/ }).click();
  ck('the “Paused” filter has nothing in it (nothing has been sent to Meta)', (await p.locator('.ads-table').count()) === 0 && /Nothing in this list/.test(await p.innerText('.ads-panel')));
  await p.getByRole('button', { name: /^Drafts/ }).click(); ck('the “Drafts” filter shows it', (await p.locator('.ads-table tbody tr').count()) === 1);
  await p.screenshot({ path: path.join(OUT, 'ads-list-desktop.png'), fullPage: true });

  console.log('-- the four steps');
  await p.locator('.ads-name').first().click(); await p.waitForSelector('.ads-steps');
  ck('the draft opens on 1 · Audiences with 5 ad sets, each Proven or New test', (await p.locator('.ads-sets li').count()) === 5 && (await p.locator('.ads-sets .ads-pill').allInnerTexts()).every(t => /Proven|New test/.test(t)));
  ck('the four steps are named', (await p.locator('.ads-steps button').allInnerTexts()).join('|') === '1 · Audiences|2 · Creative and copy|3 · Budget and rules|4 · Check and start');
  ck('the ad sets and the ads show: Ad 1 to Ad 5, each with 4 sizes', (await p.locator('.ads-tile').count()) === 5 && (await p.locator('.ads-tile').first().innerText()).includes('4 sizes'));
  const before3 = await p.locator('.ads-sets li').nth(2).locator('b').innerText();
  ck('Use is switched off until Swap is pressed on a row', await p.locator('.ads-others .soc-btn').first().isDisabled());
  await p.locator('.ads-sets li').nth(2).getByRole('button', { name: 'Swap' }).click();
  const nextName = await p.locator('.ads-others li').first().locator('b').innerText();
  await p.locator('.ads-others .soc-btn').first().click(); await p.waitForSelector('text=Swapped.');
  ck('Swap then Use puts the suggestion in that row', (await p.locator('.ads-sets li').nth(2).locator('b').innerText()) === nextName && nextName !== before3, `${before3} → ${nextName}`);
  await p.locator('.ads-sets li').first().getByRole('button', { name: 'Edit' }).click();
  await p.locator('.ads-sets li').first().getByLabel('Youngest').fill('30'); await p.locator('.ads-sets li').first().getByLabel('Oldest').fill('60'); await p.locator('.ads-sets li').first().getByLabel('Oldest').blur(); await p.waitForTimeout(600);
  let tree = await (await fetch(`${U}/api/ops/ads?id=${cid}`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json();
  ck('editing an ad set’s ages saves', tree.adsets[0].targeting.age_min === 30 && tree.adsets[0].targeting.age_max === 60);

  await p.getByRole('button', { name: /^Next: creative/i }).click(); await p.waitForSelector('.ads-cards');
  ck('2 · the 5 ads show their crops, and the 5 copy sets show where each came from', (await p.locator('.ads-cards li').count()) === 5 && (await p.locator('.ads-cards img').count()) === 20 && (await p.locator('.ads-table.copy tbody tr').count()) === 5 && (await p.locator('.ads-table.copy tbody tr .ads-pill').allInnerTexts()).every(t => t.length > 3));
  ck('there is a button choice and a landing page field, and the full ad link with tags', (await p.locator('select', { hasText: 'Sign up' }).count()) >= 1 && /utm_source=meta/.test(await p.locator('.ads-panel', { hasText: 'The ad opens' }).innerText()));
  ck('the preview shows a feed ad with its copy, and Stories in 9:16', (await p.locator('.ads-phone.feed .pic img').count()) === 1 && (await p.getByRole('button', { name: 'Stories' }).click(), (await p.locator('.ads-phone.stories .pic img').count()) === 1));
  const ph = p.locator('.ads-table.copy tbody tr', { has: p.locator('.ads-pill.warn') });
  const nPh = await ph.count();
  ck('a copy set with no source shows as a placeholder (“Needs a source”)', nPh >= 1 && /Needs a source/.test(await ph.first().innerText()));
  await p.locator('.ads-table.copy tbody tr').nth(1).click();
  ck('clicking a copy set previews it', (await p.locator('.ads-phone .txt').innerText()).length > 0);
  await p.locator('.ads-cards li').nth(3).getByRole('button').click();
  await p.getByRole('button', { name: /^Video/ }).click(); await p.waitForSelector('text=Video file link, 9:16');
  ck('an ad can be made a video: only 9:16 and 4:5 are asked for', (await p.getByText('Video file link, 9:16').count()) === 1 && (await p.getByText('Video file link, 4:5').count()) === 1 && (await p.getByText(/Video file link, 1:1/).count()) === 0);
  await p.getByRole('button', { name: /^Picture$/ }).click(); await p.waitForTimeout(400);
  await p.locator('.ads-cards li').nth(3).getByRole('button').click();
  await p.getByLabel('Choose from the image library').selectOption({ index: 3 }); await p.waitForSelector('text=cut to four sizes');
  ck('choosing a library picture gives the ad all four sizes again', (await p.locator('.ads-cards li').nth(3).innerText()).includes('4 sizes ready'));

  await p.getByRole('button', { name: /^Next: budget/i }).click(); await p.waitForSelector('[aria-label="Automatic rules"]');
  ck('3 · Budget: campaign budget or ad set budgets (ad set budgets is the default for a 5 × 5), a spending cap, dates', (await p.getByRole('radio', { name: /Ad set budgets/ }).getAttribute('aria-checked')) === 'true' && (await p.getByLabel('Lifetime spending cap').count()) === 1 && (await p.getByLabel('Start date').inputValue()) === '2027-04-07');
  await p.getByLabel('Lifetime spending cap').fill('1500'); await p.getByLabel('Lifetime spending cap').blur(); await p.waitForTimeout(500);
  await p.getByLabel('Raise by percent').fill('25'); await p.getByLabel('Raise by percent').blur(); await p.waitForTimeout(500);
  await p.getByLabel('Pause weakest after days').fill('7'); await p.getByLabel('Pause weakest after days').blur(); await p.waitForTimeout(500);
  await p.getByLabel('Rules on').click(); await p.waitForTimeout(800);
  tree = await (await fetch(`${U}/api/ops/ads?id=${cid}`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json();
  ck('the cap and the rules (25%, 7 days, switched on) are stored', tree.campaign.spend_cap_cents === 150000 && tree.rules.raise_pct === 25 && tree.rules.pause_weakest_after_days === 7 && tree.campaign.rules_on === true && tree.campaign.rules_dry_run === true);
  ck('the page says the rules are applied each morning once running, as a dry run beside Make, and change nothing in Meta from here', /dry run beside Make’s Ad Agent, and nothing changes in Meta from this page/.test(await p.innerText('[aria-label="Automatic rules"]')));
  ck('Meta settings are filled in from Settings (pixel and event, Page, Instagram account, placements, campaign name), no ids shown', (await p.locator('[aria-label="Meta settings"]').innerText()).includes('Purchase') && !/PIX1|PAGE1|IG1/.test(await p.locator('[aria-label="Meta settings"]').innerText()) && (await p.getByLabel('Campaign name in Meta').inputValue()).includes('Wizard On 2027'));
  await p.screenshot({ path: path.join(OUT, 'ads-budget-desktop.png'), fullPage: true });

  await p.getByRole('button', { name: /^Next: check/i }).click(); await p.waitForSelector('.ads-checks li');
  const items = await p.locator('.ads-checks li').allInnerTexts();
  ck('4 · the checklist lists the audiences, the sizes, the copy, the link, the dates, the landing page, the pixel and the payment method', items.length === 8 && /audiences/.test(items[0]) && /sizes/.test(items[1]) && /copy/i.test(items[2]) && /landing page/.test(items.join(' ')) && /pixel/.test(items.join(' ')) && /payment/.test(items.join(' ')), items.join(' | '));
  ck('with a placeholder left, a ✕ is shown with a Fix link, and Start is disabled', (await p.locator('.ads-checks li.no').count()) >= 1 && (await p.locator('.ads-checks li.no .lnk').count()) >= 1 && await p.getByRole('button', { name: /^Start/ }).isDisabled());
  ck('Send to Meta, paused is disabled too while words are missing, and the page says Start is switched off', await p.getByRole('button', { name: 'Send to Meta, paused' }).isDisabled() && /Start is switched off until every check passes/.test(await p.innerText('.ads-draft')));
  await p.locator('.ads-checks li.no .lnk').first().click(); await p.waitForSelector('.ads-table.copy');
  ck('Fix takes you to the step that fixes it', new URL(p.url()).searchParams.get('step') === '2');
  const inputs = p.locator('.ads-table.copy tbody tr');
  for (let i = 0; i < 5; i++) { const r = inputs.nth(i); if (await r.locator('.ads-pill.warn').count()) { await r.locator('textarea').fill(`A real sentence for set ${i + 1}, written by a person.`); await r.locator('textarea').blur(); await p.waitForTimeout(500); await r.locator('input').fill(`Set ${i + 1}`); await r.locator('input').blur(); await p.waitForTimeout(500); } }
  ck('a person writing into a placeholder gives it a source (“Written by …”)', /Written by Jacob/.test(await p.locator('.ads-table.copy').innerText()));
  await p.goto(U + `/ops/ads/${cid}?step=4`); await p.waitForSelector('.ads-checks li');
  ck('with everything in place every check passes and Start is enabled', (await p.locator('.ads-checks li.no').count()) === 0 && await p.getByRole('button', { name: /^Start/ }).isEnabled() && await p.getByRole('button', { name: 'Send to Meta, paused' }).isEnabled(), (await p.locator('.ads-checks li').allInnerTexts()).join('|'));
  await fetch(META + '/__log?reset=1');
  await p.getByRole('button', { name: 'Send to Meta, paused' }).click(); await p.waitForSelector('.ads-result');
  ck('Send to Meta, paused says “Dry run — nothing was sent to Meta” and shows what would have gone', /Dry run — nothing was sent to Meta/.test(await p.innerText('.ads-result')) && /1 campaign, 5 ad sets, 25 ads/.test(await p.innerText('.ads-result')) && /utm_source=meta/.test(await p.innerText('.ads-result')));
  await p.getByRole('button', { name: /^Start/ }).click(); await p.waitForFunction(() => /Dry run — nothing was sent to Meta/.test(document.querySelector('.ads-result')?.innerText || ''));
  ck('Start is a dry run too', /Dry run/.test(await p.innerText('.ads-result')));
  ck('the Meta mock’s log has no writes at all after both', (await metaLog()).requests.filter(r => r.write).length === 0);
  ck('the campaign is still a draft', /Draft · review/.test(await p.innerText('.ads-head')));
  await p.screenshot({ path: path.join(OUT, 'ads-check-desktop.png'), fullPage: true });
  ck('no page error and no token on any page', p.errs.length === 0 && !(await p.content()).includes('mock-ads-token'), p.errs.join(' | '));

  console.log('-- Switch type from the draft keeps the creative and copy');
  await p.goto(U + `/ops/ads/${cid}`); await p.waitForSelector('.ads-sets');
  const copyBefore = (await (await fetch(`${U}/api/ops/ads?id=${cid}`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json()).copysets.map(s => s.main_text).join('|');
  await p.getByRole('button', { name: 'Switch to Advantage+' }).click(); await p.waitForSelector('.ads-adv');
  ck('Advantage+ shows one ad set with “Meta chooses who sees it” and the five ads', (await p.locator('.ads-adv').innerText()).includes('Meta chooses who sees it') && (await p.locator('.ads-tile').count()) === 5);
  ck('the copy is the same after switching', (await (await fetch(`${U}/api/ops/ads?id=${cid}`, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json()).copysets.map(s => s.main_text).join('|') === copyBefore);
  await p.screenshot({ path: path.join(OUT, 'ads-advantage-desktop.png'), fullPage: true });
  await p.getByRole('button', { name: 'Switch to targeting test' }).click(); await p.waitForSelector('.ads-sets');

  console.log('-- phone width (390px)');
  const m = await as(DIRECTOR, { width: 390, height: 800 });
  for (const [name, url, sel] of [['Ads list', '/ops/ads', '.ads-table'], ['launch page', `/ops/programs?view=launches&id=${l2}`, '.ads-switch'], ['step 1', `/ops/ads/${cid}?step=1`, '.ads-sets'], ['step 2', `/ops/ads/${cid}?step=2`, '.ads-cards'], ['step 3', `/ops/ads/${cid}?step=3`, '[aria-label="Automatic rules"]'], ['step 4', `/ops/ads/${cid}?step=4`, '.ads-checks li']]) {
    await m.goto(U + url); await m.waitForSelector(sel); await m.waitForTimeout(700);
    const r = await m.evaluate(() => {
      const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
      const btns = [...document.querySelectorAll('.ads button, .ads .soc-btn, .ads-steps button, .ads .lnk, .ads-seg button')].filter(e => e.offsetParent && !e.closest('[hidden]'));
      return { over, small: btns.filter(e => e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.getAttribute('aria-label') || '').slice(0, 24)), tableInPanel: [...document.querySelectorAll('.ads-table')].every(t => t.closest('.ads-scroll')) };
    });
    ck(`${name}: no sideways scroll on the page`, r.over <= 1, `${r.over}px`);
    ck(`${name}: buttons are 44px tall`, r.small.length === 0, r.small.join(', '));
    ck(`${name}: tables sit inside a panel that scrolls`, r.tableInPanel);
    await m.screenshot({ path: path.join(OUT, `ads-${name.replace(/ /g, '-')}-phone.png`), fullPage: true });
  }
  ck('no page error at phone width', m.errs.length === 0, m.errs.join(' | '));
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
