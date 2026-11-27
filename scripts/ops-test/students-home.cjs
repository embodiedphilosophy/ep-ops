// EP Ops 2 step 7, Students: the overview ("Who needs looking after") and the tabs it gathers (Support, Mentee year with Surveys and Partners,
// Pods, One-to-ones, CE credits): cards from what the old pages read, links into the tabs, the older addresses with their query strings, each role
// (director, Floss, Ichha, a teacher), phone width. Mock only; reads only (nothing is sent, saved or answered). Needs a fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const tabs = async p => (await p.locator('nav[aria-label="students views"] a').allInnerTexts()).join('|');
const main = p => p.locator('main.ops').innerText();
(async () => {
  const b = await chromium.launch(); const pages = [];
  const as = async (ck_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); pages.push(p); return p; };
  const posts = []; // nothing here may write: any POST is recorded (and refused)
  const guard = async p => p.route('**/*', r => { if (r.request().method() !== 'GET' && r.request().method() !== 'HEAD') { posts.push(r.request().url()); return r.abort(); } return r.continue(); });

  const p = await as(DIRECTOR); await guard(p);
  await p.goto(U + '/ops/students'); await p.waitForSelector('.st-grid');
  ck('the page is "Who needs looking after", under Students', (await p.locator('h1').innerText()).includes('Who needs looking after') && /Students/.test(await p.locator('.ops-eyebrow, .eyebrow, main.ops').first().innerText()));
  ck('the director sees Overview, Support, Mentee year, Pods, One-to-ones, CE credits', (await tabs(p)) === 'Overview|Support|Mentee year|Pods|One-to-ones|CE credits');
  ck('the Overview tab is the current one', (await p.locator('nav[aria-label="students views"] a[aria-current=page]').innerText()) === 'Overview');
  const card = n => p.locator(`.st-card[aria-label="${n}"]`);
  ck('Support card: needs a reply, with a count and topic chips', /Support · needs a reply/.test(await card('Support').innerText()) && (await card('Support').locator('.st-chips a').count()) >= 1);
  ck('Support card lists tickets, each opening that ticket in Support', (await card('Support').locator('.st-rows li a').count()) === 2 && /view=support&tab=reply&t=\d+/.test(await card('Support').locator('.st-rows li a').first().getAttribute('href')));
  ck('Support card mentions Ether’s unanswered questions and links to Answers', /Ether’s chat/.test(await card('Support').innerText()) && await card('Support').locator('a[href*="tab=answers"]').count() === 1);
  ck('Mentee card: this month, the reflection count, skipped items, one-to-ones', /this month/.test(await card('Mentee year').innerText()) && /mentees have posted this month’s reflection/.test(await card('Mentee year').innerText()) && /skipped/.test(await card('Mentee year').innerText()) && /one-to-one/.test(await card('Mentee year').innerText()));
  ck('Mentee card: the next project steps with “n of n”', await card('Mentee year').locator('.st-rows li .st-count').count() >= 1);
  ck('Mentee card (director): next one-to-ones and links to One-to-ones, Partners, Surveys', await card('Mentee year').locator('a[href="/ops/students?view=one-to-ones"]').count() === 1 && await card('Mentee year').locator('a[href*="tab=partners"]').count() === 1 && await card('Mentee year').locator('a[href*="tab=surveys"]').count() === 1);
  ck('Pods card is there (the mock has no database, so it says so)', /Pods waiting for a yes/.test(await card('Study pods').innerText()) && /database is connected/.test(await card('Study pods').innerText()));
  ck('CE card: held for a look, issued this month, links to the held list', /1 certificate held/.test(await card('CE credits').innerText()) && /2 issued this month/.test(await card('CE credits').innerText()) && await card('CE credits').locator('a[href*="view=ce&tab=held"]').count() === 1);
  ck('no “Paid but not in Circle” card yet (it is a later piece)', !/Paid but not in Circle/.test(await main(p)));
  // each card's links land where they say
  await card('Support').locator('.st-rows li a').first().click(); await p.waitForSelector('.ops-sup'); ck('a ticket on the card opens that ticket in Support', /view=support/.test(p.url()) && await p.locator('.ops-sup-tickethead').count() === 1);
  await p.goto(U + '/ops/students'); await card('CE credits').locator('a', { hasText: 'Take a look' }).click(); await p.waitForSelector('.ops-lib-rows, .ops-empty-box'); ck('the CE card opens the held list', /view=ce/.test(p.url()) && /Held for a look/.test(await main(p)));
  // the tabs: each one shows what its old page showed
  await p.goto(U + '/ops/students?view=support'); await p.waitForSelector('.ops-sup'); ck('Support tab: the desk (Needs a reply, Waiting, Pitches, Answers)', /Needs a reply/.test(await main(p)) && await p.locator('nav.ops-sup-tabs a').count() === 4);
  await p.goto(U + '/ops/students?view=support&tab=answers&a=2'); await p.waitForSelector('.ops-sup'); ck('Support › Answers opens an answer for editing', await p.locator('.ops-sup-detail form, .ops-sup-detail textarea, .ops-sup-detail input').count() > 0);
  await p.goto(U + '/ops/students?view=mentee'); ck('Mentee year tab: its own tabs, with Surveys and Partners last', (await p.locator('nav[aria-label="Mentee year"] a').allInnerTexts()).join('|') === 'Now|Progress|The rhythm|Month by month|Final projects|One-to-ones|The manual|Surveys|Partners');
  await p.goto(U + '/ops/students?view=mentee&tab=months'); ck('Mentee year › Month by month still opens by ?tab=', /Month by month|Project steps due/.test(await main(p)) && await p.locator('.ops-my-card').count() > 3);
  await p.goto(U + '/ops/students?view=mentee&tab=surveys'); ck('Mentee year › Surveys is the old survey answers page', /Mentee surveys/.test(await p.locator('h1').innerText()) && await p.locator('nav[aria-label="Mentee year"] a[aria-current=page]').innerText() === 'Surveys');
  await p.goto(U + '/ops/students?view=mentee&tab=partners'); ck('Mentee year › Partners is the old articulation partners page', /Articulation partners/.test(await p.locator('h1').innerText()) && /Where each mentee lives/.test(await main(p)));
  await p.goto(U + '/ops/students?view=polls'); ck('the older ?view=polls opens Surveys', /Mentee surveys/.test(await p.locator('h1').innerText()));
  await p.goto(U + '/ops/students?view=partners'); ck('the older ?view=partners opens Partners', /Articulation partners/.test(await p.locator('h1').innerText()));
  await p.goto(U + '/ops/students?view=pods'); await p.waitForSelector('.ops-pods, .ops-empty'); ck('Pods tab: the pods page (the mock has no database, so it says so)', /Study pods/.test(await p.locator('h1').innerText()));
  await p.goto(U + '/ops/students?view=one-to-ones'); ck('One-to-ones tab: booked, with the filters', /One-to-ones/.test(await p.locator('h1').innerText()) && await p.locator('nav[aria-label="Filter one-to-ones"] a').count() === 4 && await p.locator('.ops-o2o-row').count() > 0);
  await p.goto(U + '/ops/students?view=one-to-ones&f=unbooked'); ck('One-to-ones ?f= still filters', /Not booked/.test(await main(p)));
  await p.goto(U + '/ops/students?view=ce&tab=setup'); ck('CE credits › Set-up shows the pathways and the unmatched events', /Pathways/.test(await main(p)) && /couldn’t match/.test(await main(p)));
  // the older addresses
  for (const [u, want] of [['/ops/support?tab=answers', 'view=support&tab=answers'], ['/ops/support?t=9101', 'view=support&t=9101'], ['/ops/mentee-year?tab=rhythm', 'view=mentee&tab=rhythm'], ['/ops/one-to-ones?f=past', 'view=one-to-ones&f=past'],
    ['/ops/ce?tab=held', 'view=ce&tab=held'], ['/ops/settings/pods', 'view=pods'], ['/ops/settings/polls', 'view=mentee&tab=surveys'], ['/ops/settings/partners', 'view=mentee&tab=partners']]) {
    await p.goto(U + u); const got = new URL(p.url());
    ck(`${u} → /ops/students with ${want} (query kept, one place)`, got.pathname === '/ops/students' && [...new URLSearchParams(want)].every(([k, v]) => got.searchParams.get(k) === v));
  }
  ck('nothing was written (no POST from any page)', posts.length === 0);

  // roles
  const fl = await as(cookie('floss@example.com')); await fl.goto(U + '/ops/students'); await fl.waitForSelector('.st-grid');
  ck('Floss (events staff) sees every tab but One-to-ones', (await tabs(fl)) === 'Overview|Support|Mentee year|Pods|CE credits');
  ck('Floss’s overview has no One-to-ones link in the Mentee card, but has Partners and Surveys', await fl.locator('.st-card[aria-label="Mentee year"] a[href="/ops/students?view=one-to-ones"]').count() === 0 && await fl.locator('.st-card[aria-label="Mentee year"] a[href*="tab=partners"]').count() === 1 && await fl.locator('.st-card[aria-label="Mentee year"] h3', { hasText: 'Next one-to-ones' }).count() === 0);
  await fl.goto(U + '/ops/students?view=one-to-ones'); ck('Floss asking for One-to-ones gets the overview (directors only, as before)', /Who needs looking after/.test(await fl.locator('h1').innerText()));
  const ic = await as(cookie('ichha@example.com')); await ic.goto(U + '/ops/students'); await ic.waitForSelector('.ops-sup');
  ck('Ichha opens on Support', /Needs a reply/.test(await main(ic)) && (await ic.locator('nav[aria-label="students views"] a[aria-current=page]').innerText()) === 'Support');
  ck('Ichha sees Overview, Support, Mentee year only', (await tabs(ic)) === 'Overview|Support|Mentee year');
  await ic.goto(U + '/ops/students?view=overview'); await ic.waitForSelector('.st-grid');
  ck('Ichha’s overview has the Support and Mentee cards, not Pods, CE or one-to-one names', await ic.locator('.st-card').count() === 2 && await ic.locator('.st-card[aria-label="Support"]').count() === 1 && await ic.locator('.st-card h3', { hasText: 'Next one-to-ones' }).count() === 0 && await ic.locator('a[href*="tab=partners"], a[href*="tab=surveys"]').count() === 0);
  await ic.goto(U + '/ops/students?view=mentee'); ck('Ichha’s Mentee year has no Surveys or Partners tab', !/Surveys|Partners/.test((await ic.locator('nav[aria-label="Mentee year"] a').allInnerTexts()).join('|')));
  await ic.goto(U + '/ops/students?view=mentee&tab=surveys'); ck('Ichha asking for Surveys gets the mentee year’s Now', /The mentee year/.test(await ic.locator('h1').innerText()));
  for (const v of ['ce', 'pods', 'one-to-ones']) { await ic.goto(U + `/ops/students?view=${v}`); ck(`Ichha asking for ${v} gets Support (her first tab)`, (await ic.locator('nav[aria-label="students views"] a[aria-current=page]').innerText()) === 'Support'); }
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops/students'); ck('a teacher is not shown Students', !new URL(te.url()).pathname.startsWith('/ops/students'));
  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 }); await ph.goto(U + '/ops/students'); await ph.waitForSelector('.st-grid');
  ck('phone: no sideways page scroll (overview)', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  ck('phone: one column of cards', await ph.evaluate(() => { const c = [...document.querySelectorAll('.st-card')]; return c.every(x => Math.abs(x.getBoundingClientRect().left - c[0].getBoundingClientRect().left) < 2); }));
  ck('phone: the card links are 44px tall', await ph.evaluate(() => [...document.querySelectorAll('.st-links a, .st-chips a')].every(a => a.getBoundingClientRect().height >= 43.5)));
  await ph.screenshot({ path: __dirname + '/out/students-overview-phone.png', fullPage: true });
  for (const v of ['support', 'mentee', 'mentee&tab=surveys', 'mentee&tab=partners', 'pods', 'one-to-ones', 'ce', 'ce&tab=setup']) { await ph.goto(U + `/ops/students?view=${v}`); await ph.waitForTimeout(500); ck(`phone: no sideways page scroll (${v})`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))); }
  await p.goto(U + '/ops/students'); await p.screenshot({ path: __dirname + '/out/students-overview-desktop.png', fullPage: true });
  ck('no page errors', pages.every(x => !x.errs.length));
  await b.close(); process.exit(bad ? 1 : 0);
})();
