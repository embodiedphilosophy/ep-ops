// The ad safety net in a browser (run by ads-safety.sh, after ads-safety-api.mjs, on the same app). Phases:
//   a  Meta key + Twilio set; the API flow left the trouble account's alerts open, both numbers and the ceilings set, one test alert sent
//   b  Meta key, no Twilio (email only)       c  no Meta key
// a: the Safety net tab, the six cards, the numbers, open alerts with Acknowledge (who and when shown), what needs a look with "Open in Meta Ads Manager", the recent log (who was told on
//    which channel), the director's settings (own number in full, everyone else's masked, nowhere else), Send a test alert, saving a ceiling, the Settings section; the Ads role (Rebecka) sees
//    the board and can acknowledge but gets no settings and no number; Floss gets no tab; phone width (390px) on every page; opening a page posts nothing.
// b: the Settings section says "Not set up", a test alert says so, the log says "WhatsApp not set up".  c: the red "No Meta token set" and the "Set your ceilings" prompt. Mock only.
const { chromium } = require('./pw.cjs');
const hourNY = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()), FLAGGED = hourNY >= 4 ? 5 : 4;
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'a';
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const NUM = /5550142|5550177|555-0142|555 555 0142/;
const tw = async (q = '') => (await fetch(`http://localhost:4557/__log${q}`)).json();
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(path.join(OUT, 'ads'), { recursive: true });
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(String(e))); p.on('request', r => { if (r.method() === 'POST') p.posts.push(r.url()); }); return p; };
  const p = await as(DIRECTOR), main = pg => pg.locator('main').first().innerText();
  const noScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  if (PHASE === 'a') {
    console.log('-- the Safety net tab (director)');
    await p.goto(U + '/ops/ads?view=safety'); await p.waitForSelector('.ads-board');
    const tabs = await p.locator('nav[aria-label="ads views"] a').allInnerTexts();
    ck('the Ads place has Campaigns, Audience library, Safety net and Audience insights tabs, the last current', tabs.join() === 'Campaigns,Audience library,Safety net,Audience insights,What we’ve learned' && (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'Safety net', tabs.join());
    ck('opening the page posts nothing', p.posts.length === 0);
    const cards = await p.locator('.ads-board li').allInnerTexts();
    ck('seven cards, each with a green, amber or red pill', cards.length === 7 && cards.every(c => /All clear|Worth a look|Needs you now|Not checked/.test(c)), cards.join(' | ').slice(0, 300));
    ck('the cards are the seven checks', ['Spending against your ceilings', 'Ads that should be off', 'A sudden jump in spending', 'Tracking: is Meta counting results?', 'Payment and account', 'Real sales against Meta’s numbers', 'The safety net itself'].every(t => cards.some(c => c.includes(t))));
    ck('the trouble shows: the "forgotten" card is red, the last card is green', /Needs you now/.test(cards.find(c => c.includes('Ads that should be off'))) && /All clear/.test(cards.find(c => c.includes('The safety net itself'))));
    ck('no "Set your ceilings" prompt (they are set) and no red token banner', await p.locator('.ads-mode').filter({ hasText: /Set your ceilings|No Meta token/ }).count() === 0);
    const kpi = (await p.innerText('.ads-kpis')).replace(/\n+/g, ' ');
    ck('the numbers: spent today of the $100 ceiling, this month of $5,000, the pixel, the account, the open-ended count', /Spent today\s*\$[\d,.]+\s*of your \$100 daily ceiling/.test(kpi) && /of \$5,000/.test(kpi) && /Pixel last fired\s*\d/.test(kpi) && /Account\s*Active/.test(kpi) && /Running with no end or cap\s*1/.test(kpi), kpi);
    const open = p.locator('[aria-label="Open alerts"] tbody tr');
    ck('the open alerts are listed, urgent ones with the red pill, each with Acknowledge', await open.count() >= 7 && await open.locator('.ads-pill.bad').count() >= 4 && await open.locator('button', { hasText: 'Acknowledge' }).count() >= (hourNY >= 4 ? 7 : 6));
    await open.first().locator('summary').click();
    ck('an alert opens to say what it says, in plain words, with the advice and a link', /What to do/.test(await open.first().innerText()));
    // Acknowledge one: the one for the low return
    const row = open.filter({ hasText: 'bringing back less than' }).first();
    await row.locator('select').selectOption('72'); await row.locator('button', { hasText: 'Acknowledge' }).click();
    await p.waitForSelector('text=Acknowledged. It won’t repeat for 72 hours');
    ck('Acknowledge says what it did and the row then shows who, when and until when', /Acknowledged by Jacob Kyle/.test(await p.locator('[aria-label="Open alerts"] tbody tr', { hasText: 'bringing back less than' }).innerText()), await p.locator('[aria-label="Open alerts"] tbody tr', { hasText: 'bringing back less than' }).innerText());
    const flagged = p.locator('[aria-label="Campaigns that need a look"] tbody tr');
    ck('campaigns that need a look: five (four before 04:00 in New York, when the spike check waits), each with an "Open in Meta Ads Manager" button that opens Meta’s tool with the account (no key)', await flagged.count() === FLAGGED && await p.locator('a', { hasText: 'Open in Meta Ads Manager' }).count() === FLAGGED && /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1/.test(await p.locator('a', { hasText: 'Open in Meta Ads Manager' }).first().getAttribute('href')) && !(await p.content()).includes('mock-ads-token'));
    ck('they say they were not built in Ops, and offer no Ops pause link', (await flagged.first().innerText()).includes('Not built in Ops') && await p.locator('a', { hasText: 'Open it here to pause' }).count() === 0);
    const log = (await p.innerText('[aria-label="Recent alerts"]')).replace(/\s+/g, ' ');
    ck('the recent alerts say who was told on which channel, and what was skipped and why', /Jacob Kyle: text sent, WhatsApp sent, email skipped \(Email isn’t set up/.test(log) && /Rebecka Oberg: text sent/.test(log), log.slice(0, 400));
    ck('the page says it never changes anything in Meta', /never changes anything in Meta/.test(await main(p)));
    ck('and shows the settings to a director, with no phone number on the page except his own field', await p.locator('#safety-settings').count() === 1 && !NUM.test(await main(p)));

    console.log('-- the settings (director): ceilings, numbers, the test alert');
    await p.locator('#safety-settings').scrollIntoViewIfNeeded();
    const mine = p.locator('[aria-label="Alerts for Jacob Kyle"]'), hers = p.locator('[aria-label="Alerts for Rebecka Oberg"]');
    ck('his own number is in his own field in full', await mine.locator('input[type=tel]').inputValue() === '+15555550142');
    ck('Rebecka’s is not: empty, with the last four digits as a hint, and nowhere in the page', await hers.locator('input[type=tel]').inputValue() === '' && /ends 0177/.test(await hers.locator('input[type=tel]').getAttribute('placeholder')) && !(await p.content()).includes('5550177'));
    ck('each person has email on, text and WhatsApp on with the levels chosen', await mine.locator('input[type=checkbox]:checked').count() === 6);
    await p.locator('[aria-label="Daily spending ceiling (dollars)"]').fill('150'); await p.locator('[aria-label="Safety net thresholds"] button[type=submit]').click();
    await p.waitForSelector('text=Saved. The safety net uses these');
    await p.reload(); await p.waitForSelector('.ads-board');
    ck('a changed ceiling is saved and still there after a reload', await p.locator('[aria-label="Daily spending ceiling (dollars)"]').inputValue() === '150');
    await tw('?reset=1');
    await p.locator('button', { hasText: 'Send a test alert' }).click(); await p.waitForSelector('[aria-label="Test result"]');
    const res = (await p.innerText('[aria-label="Test result"]')).replace(/\s+/g, ' ');
    ck('Send a test alert: text message sent, WhatsApp sent, email skipped (no mail key in the test kit)', /Text message\s*sent/.test(res) && /WhatsApp\s*sent/.test(res) && /Email\s*skipped/.test(res), res);
    const TL = (await tw()).requests;
    ck('the Twilio mock got the two TEST messages, to his number only', TL.length === 2 && TL.every(x => /TEST/.test(x.Body) && x.To.includes('5550142')));
    ck('a bad ceiling is refused in plain words on the page', await (async () => { await p.locator('[aria-label="Spend spike: times the usual day"]').fill('0.2'); await p.locator('[aria-label="Safety net thresholds"] button[type=submit]').click(); await p.waitForSelector('[role=alert]:has-text("Spend spike")'); return true; })());
    await p.screenshot({ path: path.join(OUT, 'ads/safety-a-1360.png'), fullPage: true });

    console.log('-- the Settings section');
    await p.goto(U + '/ops/settings?view=connections&s=ads-safety'); await p.waitForSelector('[aria-label="Who is told"]');
    ck('Settings › Connections and jobs › Ads safety net: the ceilings, the people and the test button', /Ads safety net/.test(await main(p)) && await p.locator('[aria-label="Alerts for Rebecka Oberg"]').count() === 1 && await p.locator('button', { hasText: 'Send a test alert' }).count() === 1 && /Text and WhatsApp ready\./.test(await main(p)));
    ck('the systems list has the alerts row with the settings by name', await (async () => { await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('[aria-label="Alert settings"]'); const t = await p.innerText('[aria-label="Alert settings"]'); return ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_TEMPLATE_SID'].every(n => t.includes(n)) && /TWILIO_WHATSAPP_TEMPLATE_SID\)?: not set/.test(t) && !/ACmock|mock-twilio/.test(await p.content()); })());

    console.log('-- Rebecka (the Ads role)');
    const rb = await as(cookie('rebecka@example.com'));
    await rb.goto(U + '/ops/ads?view=safety'); await rb.waitForSelector('.ads-board');
    ck('she sees the board, the alerts and Acknowledge', await rb.locator('.ads-board li').count() === 7 && await rb.locator('button', { hasText: 'Acknowledge' }).count() >= 5);
    ck('but no settings and no phone number, hers or anyone’s', await rb.locator('#safety-settings').count() === 0 && !NUM.test(await rb.content()) && !/••••/.test(await main(rb)));
    const rrow = rb.locator('[aria-label="Open alerts"] tbody tr', { hasText: 'no end date' });
    await rrow.locator('button', { hasText: 'Acknowledge' }).click(); await rb.waitForSelector('text=Acknowledged. It won’t repeat');
    ck('she acknowledges one: it shows her name', /Acknowledged by Rebecka Oberg/.test(await rb.locator('[aria-label="Open alerts"] tbody tr', { hasText: 'no end date' }).innerText()));
    ck('her sidebar has Ads, but no Business', /\bAds\b/.test(await rb.locator('nav').first().innerText()) && !/Business/.test(await rb.locator('nav').first().innerText()));
    ck('Settings › Connections is not hers', !/Ads safety net/.test(await (async () => { await rb.goto(U + '/ops/settings?view=connections&s=ads-safety'); return rb.content(); })()));
    const fl = await as(cookie('floss@example.com'));
    await fl.goto(U + '/ops/ads?view=safety', { waitUntil: 'domcontentloaded' });
    ck('Floss has no Ads place and does not land on the Safety net', !/Safety net/.test(await fl.content()) && !/\/ops\/ads/.test(fl.url()));

    console.log('-- phone width (390px)');
    const ph = await as(DIRECTOR, { width: 390, height: 900 });
    for (const [name, url, sel] of [['safety', '/ops/ads?view=safety', '.ads-board'], ['settings', '/ops/settings?view=connections&s=ads-safety', '[aria-label="Who is told"]'], ['systems', '/ops/settings?view=connections', '[aria-label="Alert settings"]']]) {
      await ph.goto(U + url); await ph.waitForSelector(sel); await wait(300);
      ck(`${name}: the page does not scroll sideways`, await noScroll(ph));
      ck(`${name}: nothing is wider than the screen`, await ph.evaluate(() => [...document.querySelectorAll('.ops-shell main *')].filter(e => !e.closest('.ads-scroll, .ops-table-wrap, .ops-setlist') && e.getBoundingClientRect().right > innerWidth + 1).length === 0));
      await ph.screenshot({ path: path.join(OUT, `ads/safety-${name}-390.png`), fullPage: true });
    }
    await ph.goto(U + '/ops/ads?view=safety'); await ph.waitForSelector('.ads-board');
    ck('phone: the seven cards stack in one column', await ph.evaluate(() => { const l = [...document.querySelectorAll('.ads-board li')]; return new Set(l.map(e => Math.round(e.getBoundingClientRect().left))).size === 1; }));
    ck('phone: tap targets are at least 44px (Acknowledge, Check now, the select)', await ph.evaluate(() => [...document.querySelectorAll('.ads-safety button.soc-btn, .ads-safety select')].every(e => e.getBoundingClientRect().height >= 43)));
    ck('no page errors', [p, rb, fl, ph].every(x => x.errs.length === 0), [p, rb, ph].map(x => x.errs.join()).join());
  }

  if (PHASE === 'b') {
    console.log('-- no Twilio: email only');
    await p.goto(U + '/ops/settings?view=connections&s=ads-safety'); await p.waitForSelector('[aria-label="Who is told"]');
    ck('the section says "Not set up" and that alerts go by email only', /Not set up\./.test(await main(p)) && /email only/.test(await main(p)));
    await p.locator('button', { hasText: 'Send a test alert' }).click(); await p.waitForSelector('[aria-label="Test result"]');
    const res = (await p.innerText('[aria-label="Test result"]')).replace(/\s+/g, ' ');
    ck('the test says text and WhatsApp are not set up, in plain words', /Text message\s*skipped: Text messages not set up/.test(res) && /WhatsApp\s*skipped: WhatsApp not set up/.test(res), res);
    ck('Twilio was never called', (await tw()).total === 0);
    await p.goto(U + '/ops/ads?view=safety'); await p.waitForSelector('.ads-board');
    const log = (await p.innerText('[aria-label="Recent alerts"]')).replace(/\s+/g, ' ');
    ck('the recent alerts say "WhatsApp not set up" for the people with numbers (nothing silent)', /WhatsApp skipped \(WhatsApp not set up\)/.test(log), log.slice(0, 300));
    ck('no number on the page except the director’s own field', !NUM.test(await main(p)));
    await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('[aria-label="Alert settings"]');
    ck('the systems row says "Not set up"', /Not set up\./.test(await p.innerText('[aria-label="Connections"]')) && (await p.innerText('[aria-label="Alert settings"]')).match(/: not set/g).length === 5);
  }

  if (PHASE === 'c') {
    console.log('-- no Meta key');
    await p.goto(U + '/ops/ads?view=safety'); await p.waitForSelector('.ads-board');
    ck('a red banner says "No Meta token set" and that nothing is being watched', await p.locator('.ads-mode.bad').filter({ hasText: 'No Meta token set' }).count() === 1 && /nothing is being watched/.test(await main(p)));
    ck('the sixth card is red with the same words', /Needs you now/.test(await p.locator('.ads-board li', { hasText: 'The safety net itself' }).innerText()) && /No Meta token set/.test(await p.locator('.ads-board li', { hasText: 'The safety net itself' }).innerText()));
    ck('"Set your ceilings" is prominent (none are set), with a link to the settings for a director', await p.locator('.ads-mode.warn').filter({ hasText: 'Set your ceilings' }).count() === 1 && await p.locator('.ads-mode.warn a[href="#safety-settings"]').count() === 1);
    ck('the other six cards say they have not been checked, and Check now is switched off', (await p.locator('.ads-board li.grey').count()) === 6 && await p.locator('button', { hasText: 'Check now' }).isDisabled());
    const rb = await as(cookie('rebecka@example.com'));
    await rb.goto(U + '/ops/ads?view=safety'); await rb.waitForSelector('.ads-board');
    ck('the Ads role sees the red banner and is told to ask a director to set the ceilings', await rb.locator('.ads-mode.bad').count() === 1 && /ask a director/.test(await main(rb)));
    const ph = await as(DIRECTOR, { width: 390, height: 900 });
    await ph.goto(U + '/ops/ads?view=safety'); await ph.waitForSelector('.ads-board'); await wait(200);
    ck('phone width: no sideways scroll with the banners', await noScroll(ph));
    await ph.screenshot({ path: path.join(OUT, 'ads/safety-c-390.png'), fullPage: true });
  }
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
