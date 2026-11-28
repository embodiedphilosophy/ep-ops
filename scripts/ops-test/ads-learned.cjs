// Ads › What we've learned, in a browser (run by ads-learned.sh). Modes:
//   empty       no Meta key, nothing read: the empty page says so, offers nothing that can't work, posts nothing; phone width
//   importing   the first import is part-way (8 of 20 weeks): the progress line, provisional statements without labels; phone width
//   partial     a BIG account part-way (ads-learned.sh leaves it so): the "Reading your ads / ad sets: N so far" line next to the weeks line, "Read the history now" says how far it got; both widths
//   timeout     the server answers with a platform error page (504, then 500) that is not JSON, for the page load and for the press: a specific plain message with the status, at 1360 and 390, and the button is usable again
//   (default)   everything read: What's working / What isn't / Not enough to say yet, a statement opened to its ads and numbers with links to Ads Manager, "Read the history now" (and its once-a-minute limit), phone width
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const PERSON = /MARKER-COPY|marker\.buyer|example\.invalid/i;
const MODE = process.argv[2] || 'full';
fs.mkdirSync(path.join(OUT, 'ads'), { recursive: true });

(async () => {
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (r.method() === 'POST') p.posts.push(r.url()); }); return p; };
  const open = async p => { await p.goto(U + '/ops/ads?view=learned'); await p.waitForSelector('.ls .ph'); await p.waitForFunction(() => !/Opening what has been learned/.test(document.querySelector('.ls').innerText)); return p.locator('.ls'); };
  const flat = async s => (await s.innerText()).replace(/\s+/g, ' ');
  const phone = async (c, name) => {
    const q = await as(c, { width: 390, height: 800 }), s = await open(q);
    ck(`[${MODE}] phone: no sideways scroll`, !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    const small = await q.evaluate(() => [...document.querySelectorAll('.ls button, .ls summary, .ls a')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43).map(e => (e.innerText || '').slice(0, 40)));
    ck(`[${MODE}] phone: every button, link and “See the ads” line is at least 44px tall`, small.length === 0, small.join(' | '));
    await q.screenshot({ path: path.join(OUT, 'ads', `learned-${name}-390.png`), fullPage: true });
    await q.context().close();
  };

  const p = await as(DIRECTOR), s = await open(p);
  const t = await flat(s), tm = await flat(p.locator('main').first());
  const tabs = await p.locator('nav[aria-label="ads views"] a').allInnerTexts();
  ck(`[${MODE}] the Ads place has the tab “What we’ve learned”, current`, tabs.includes('What we’ve learned') && (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'What we’ve learned', tabs.join());
  ck(`[${MODE}] it says these are patterns, not proof, and that nothing in Meta is changed`, /patterns, not proof/.test(t) && /never means “this made them do better”/.test(t) && /nothing here changes anything in Meta/.test(tm));
  ck(`[${MODE}] opening the page posts nothing and throws nothing`, p.posts.length === 0 && p.errs.length === 0, p.errs.join(' | '));
  ck(`[${MODE}] no word of any ad, no marker, no email on the page`, !PERSON.test(await p.content()));

  if (MODE === 'empty') {
    ck('the empty page says Meta is not connected and what to do, and that the history is read here once it is', /Meta isn’t connected yet/.test(t) && /META_ADS_TOKEN/.test(t) && /Once Meta is connected, the history of your ads is read here/.test(t), t.slice(0, 400));
    ck('the “Read the history now” button is there but disabled (there is nothing to read from)', await p.locator('button', { hasText: 'Read the history now' }).isDisabled());
    ck('there are no lists on an empty page', (await p.locator('.ls-sec').count()) === 0);
    await p.screenshot({ path: path.join(OUT, 'ads', 'learned-empty-1360.png'), fullPage: true });
    await phone(DIRECTOR, 'empty');
  }

  if (MODE === 'importing') {
    ck('the progress line reads “Reading your history: 8 of 20 weeks so far”, with a bar and the plain promise of what happens next', /Reading your history: 8 of 20 weeks so far\./.test(t) && /read automatically, a few weeks every hour/.test(t) && (await p.locator('.ls-bar').count()) === 1, t.slice(0, 500));
    ck('it says what follows is provisional until all the weeks are read', /provisional until all the weeks are read/.test(t));
    ck('the statements so far have no Newer / Still true labels yet', (await p.locator('.ls-find [data-status]').count()) === 0 && (await p.locator('.ls-find > li').count()) > 3);
    ck('the button is there, enabled, and 44px tall', (await p.locator('button', { hasText: 'Read the history now' }).isEnabled()) && (await p.locator('button', { hasText: 'Read the history now' }).evaluate(e => e.getBoundingClientRect().height)) >= 44);
    await p.screenshot({ path: path.join(OUT, 'ads', 'learned-importing-1360.png'), fullPage: true });
    await phone(DIRECTOR, 'importing');
  }

  if (MODE === 'partial') {
    const line = /(Reading your ads: [\d,]+ (of about [\d,]+ )?read so far\.|Reading your audiences and budgets: [\d,]+ ad sets so far; the ads come next\.) The next hourly run continues\./;
    ck('the weeks line is there (nothing read yet) and, under it, how many ads (or ad sets) are read so far, with what happens next', /Reading your history: 0 of \d+ weeks so far\./.test(t) && line.test(t), t.slice(0, 500));
    ck('no statements yet (they wait until the ads are all known), and the button is there and enabled', (await p.locator('.ls-find > li').count()) === 0 && (await p.locator('button', { hasText: 'Read the history now' }).isEnabled()));
    await p.screenshot({ path: path.join(OUT, 'ads', 'learned-partial-1360.png'), fullPage: true });
    const btn = p.locator('button', { hasText: 'Read the history now' });
    await btn.click(); await p.waitForFunction(() => /so far/.test(document.querySelector('.ls .hint[role=status]')?.innerText || ''));
    const said = (await p.locator('.ls .hint[role=status]').innerText()).replace(/\s+/g, ' ');
    ck('pressing it answers in plain words how far it got, and that the next hourly run continues (and does not say it failed)', /so far/.test(said) && /next hourly run continues/.test(said) && !(await p.locator('.ls .hint.err').count()), said);
    ck('the line on the page moved on with the run', line.test(await flat(s)) && p.posts.length === 1 && p.errs.length === 0, await flat(s));
    const q = await as(DIRECTOR, { width: 390, height: 800 }), qs = await open(q);
    ck('phone: the same line, no sideways scroll', line.test(await flat(qs)) && !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await q.screenshot({ path: path.join(OUT, 'ads', 'learned-partial-390.png'), fullPage: true });
    await q.context().close();
  }

  if (MODE === 'timeout') {
    const PAGE = { status: 504, contentType: 'text/html', body: '<html><body><h1>504 Gateway Timeout</h1></body></html>' };
    for (const [w, h] of [[1360, 900], [390, 800]]) {
      const tag = `[${w}]`, q = await as(DIRECTOR, { width: w, height: h });
      await q.route('**/api/ops/ads-learned', r => r.fulfill(PAGE));   // the page load: the platform answers with an HTML error page
      const qs = await open(q), qt = await flat(qs);
      ck(`${tag} opening the page when the server runs out of time: a specific plain message with the status (504), what to do, and that the history is read in small steps`, /The server took too long to answer \(504\)\. Reload the page in a moment: the history is read in small steps and picks up where it stopped\./.test(qt) && !/Couldn’t read what has been learned just now\.$/.test(qt), qt.slice(0, 300));
      ck(`${tag} it is shown as an alert, and the page does not scroll sideways`, (await q.locator('.hint.err[role=alert]').count()) === 1 && !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      await q.screenshot({ path: path.join(OUT, 'ads', `learned-timeout-load-${w}.png`), fullPage: true });
      await q.unroute('**/api/ops/ads-learned');
      let mode = 504;   // the press: the page loads, then the server's answer to "Read the history now" is not JSON
      await q.route('**/api/ops/ads-learned', r => (r.request().method() === 'POST' ? r.fulfill(mode === 504 ? PAGE : { ...PAGE, status: 500, body: '<html><body>Internal Server Error</body></html>' }) : r.continue()));
      await q.reload(); await q.waitForSelector('.ls .ph'); await q.waitForFunction(() => !/Opening what has been learned/.test(document.querySelector('.ls').innerText));
      const btn = q.locator('button', { hasText: 'Read the history now' });
      await btn.click(); await q.waitForSelector('.ls .hint.err');
      const said = (await q.locator('.ls .hint.err').innerText()).replace(/\s+/g, ' ');
      ck(`${tag} pressing it when the server runs out of time: “The server took too long to answer (504). Press again: the history is read in small steps and picks up where it stopped.”`, said === 'The server took too long to answer (504). Press again: the history is read in small steps and picks up where it stopped.', said);
      ck(`${tag} the button is usable again straight away (no countdown), the page still shows what was read, and nothing sideways scrolls`, (await btn.isEnabled()) && /^Read the history now$/.test(await btn.innerText()) && (await q.locator('.ls-sec').count()) > 0 && !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      await q.screenshot({ path: path.join(OUT, 'ads', `learned-timeout-press-${w}.png`), fullPage: true });
      if (w === 1360) {
        mode = 500; await btn.click(); await q.waitForFunction(() => /\(500\)/.test(document.querySelector('.ls .hint.err')?.innerText || ''));
        ck(`${tag} any other platform error page: the status and the same hint, not the bare “Couldn’t read”`, /The server answered with a problem instead of the history \(500\)\. Press again: the history is read in small steps/.test(await q.locator('.ls .hint.err').innerText()));
      }
      await q.context().close();
    }
  }

  if (MODE === 'full') {
    ck('the top says how much history was read and how fresh: all 20 weeks, from Jul 2026, last read at a time', /All 20 weeks are read, from Jul 2026 to Nov 2026\./.test(t) && /Last read \w{3}, \w{3} \d+/.test(t) && /read again about once a day/.test(t), t.slice(0, 400));
    ck('the account’s own totals are there, with the 1.5× aim', /Sales ads, all together/.test(t) && /The aim is 1\.5×/.test(t) && /Sign-up ads, all together/.test(t));
    const work = p.locator('.ls-sec[data-list=working]'), no = p.locator('.ls-sec[data-list=not-working]'), few = p.locator('.ls-sec[data-list=not-enough]');
    ck('“What’s working” and “What isn’t” are lists of statements, each with its reliability and a Newer label', (await work.locator('.ls-find > li').count()) > 3 && (await no.locator('.ls-find > li').count()) > 3 && (await work.locator('.ads-pill', { hasText: /Enough to read|Early sign/ }).count()) > 3 && (await work.locator('[data-status=newer]').count()) > 3);
    ck('the statements say what the group returned on what spend, and are ahead of / behind the 1.5× line', /Video ads returned \d\.\d+× on \$[\d,]+ spent/.test(await flat(work)) && /Carousel ads returned \d\.\d+× on/.test(await flat(no)) && /ahead of the 1\.5× line/.test(await flat(work)) && /behind the 1\.5× line/.test(await flat(no)));
    ck('“Not enough to say yet” lists the barely-run groups and explains the thresholds', /Yoga Sutras/.test(await flat(few)) && /at least \$500 spent, 15 purchases \(30 sign-ups\), 3 ads and 2 campaigns/.test(await flat(few)) && /an “early sign” needs \$50 and 5 purchases/.test(await flat(few)));
    const first = work.locator('.ls-find > li').first();
    ck('a statement’s ads are hidden until opened', !(await first.locator('.ls-ads').isVisible()));
    await first.locator('summary').click();
    const links = first.locator('.ls-ads a'), n = await links.count();
    ck('opened: “The numbers” (with ids) and “The ads behind it”, each with an Open in Meta Ads Manager link that opens a new tab', (await first.locator('h4', { hasText: 'The numbers' }).count()) === 1 && /m\d+/.test(await flat(first.locator('details'))) && n > 0 && n <= 10);
    ck('the links go to Ads Manager for the right account and campaign', (await links.evaluateAll(a => a.every(x => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=H_C\d$/.test(x.href) && x.target === '_blank' && /noopener/.test(x.rel)))));
    ck('each ad shows its name, its campaign, what was spent and the return, and the page says it is a pattern and not a reason', /Ad \d+ · \w+/.test(await flat(first.locator('.ls-ads'))) && /\$[\d,.]+ spent · \d\.\d\d× back/.test(await flat(first.locator('.ls-ads'))) && /not set up as tests/.test(await flat(first)));
    await p.screenshot({ path: path.join(OUT, 'ads', 'learned-full-1360.png'), fullPage: true });

    console.log('-- Read the history now, and its limit');
    const btn = p.locator('button', { hasText: 'Read the history now' });
    ck('the button is enabled and 44px tall', (await btn.isEnabled()) && (await btn.evaluate(e => e.getBoundingClientRect().height)) >= 44);
    await btn.click(); await p.waitForFunction(() => /Nothing new to read right now|more week/.test(document.querySelector('.ls').innerText));
    ck('pressing it reads (nothing is new here) and says so; the button then waits, counting down', /Nothing new to read right now/.test(await flat(s)) && await btn.isDisabled() && /\(\d+s\)/.test(await btn.innerText()), await btn.innerText());
    const again = await p.evaluate(async () => { const r = await fetch('/api/ops/ads-learned', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run' }) }); return [r.status, (await r.json()).error]; });
    ck('and the server refuses a second press inside the minute (429) in plain words', again[0] === 429 && /only just read/.test(again[1]), JSON.stringify(again));
    ck('the page posted once (the press) and the test once more (the second press), and threw nothing', p.posts.length === 2 && p.errs.length === 0, p.posts.join());
    await phone(DIRECTOR, 'full');
    const rb = await as(cookie('rebecka@example.com')), rs = await open(rb);
    ck('Rebecka (Ads role) sees the same page, with the same statements', (await rb.locator('.ls-find > li').count()) > 6 && /All 20 weeks are read/.test(await flat(rs)));
    const other = await as(cookie('floss@example.com')); const r = await other.goto(U + '/ops/ads?view=learned');
    ck('Floss (not Ads) does not get the page', !/What we’ve learned from past ads/.test(await other.content()) || r.status() !== 200);
  }
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
