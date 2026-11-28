// Ads outside research, in a browser (run by ads-research.sh). Modes (argv[2]):
//   empty      key set, nothing read yet (no table): the panel says what it is waiting for; opening posts nothing
//   nokey      no Anthropic key: "Not connected yet", Look now says so plainly
//   full       after the weekly job ran with a bad answer: three statements with their links, the left-out count, 1360 and 390 px, roles, Look now refused as too soon
//   look       fresh app, a good answer: Look now makes a look (message, the list appears), again at once is refused
//   lookempty  fresh app, an empty answer: "Nothing new we could back with a source this week", and says nothing was invented
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const MODE = process.argv[2] || 'full';
const AT = '/ops/ads?view=insights';

(async () => {
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (r.method() === 'POST') p.posts.push(r.url()); }); return p; };
  const open = async (p) => { await p.goto(U + AT); await p.waitForSelector('#outside'); await p.waitForFunction(() => !/Reading the outside research/.test(document.querySelector('#outside').innerText)); };
  const panel = async p => (await p.innerText('#outside')).replace(/\s+/g, ' ');
  const noSideways = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const big = async (p, sel, n) => { const hs = await p.locator(sel).evaluateAll(els => els.map(e => e.getBoundingClientRect().height)); return hs.length > 0 && hs.every(h => h >= n - 0.5); };
  const p = await as(DIRECTOR);
  await open(p);
  const t = await panel(p);
  ck('the panel is there, labelled “This is outside information, not about our own ads”', /Outside research/.test(t) && /This is outside information, not about our own ads/.test(t));
  ck('it says it only informs and changes no rule and no ad', /It only informs: it changes no rule and no ad/.test(t));
  ck('and honestly what a look costs: one search run on our Anthropic account, up to 5 web searches (no price is claimed)', /one search run \(up to 5 web searches and one write-up\) on our Anthropic account/.test(t) && !/\$\s?\d/.test(await p.locator('#outside > p.sub').allInnerTexts().then(a => a.join(' '))));
  ck('“What we ask” lists the four questions and says nothing from our own account is sent', (await p.locator('#outside details.ai-all li').count()) === 4 && /Nothing from our own account is/.test(await p.locator('#outside details.ai-all').innerText().catch(() => '')) || /Nothing from our own account is/.test(await p.evaluate(() => document.querySelector('#outside details.ai-all').textContent)));
  ck('the Look now button is at least 44px tall', await big(p, '#outside button:has-text("Look now")', 44));
  ck('“Your numbers” is there, labelled “Ours, from your Meta results”, and says plainly that there are too few results so none are shown', /Your numbers/.test(t) && /Ours, from your Meta results/.test(t) && /Not enough results in the last 30 days to show our own numbers yet, so none are shown/.test(t) && (await p.locator('#outside .ar-figs li').count()) === 0);
  ck('opening the page posts nothing and throws nothing', p.posts.length === 0 && p.errs.length === 0, p.errs.join(' | '));
  const tabs = await p.locator('nav[aria-label="ads views"] a').allInnerTexts();
  ck('the Ads tabs are unchanged (the panel is a section of Audience insights)', tabs.join() === 'Campaigns,Creative results,Audience library,Safety net,Audience insights,What we’ve learned');

  if (MODE === 'empty') {
    ck('it says nothing is here yet, and that the first look is on Monday morning', /Nothing here yet\. The first look is made on Monday morning/.test(t));
    ck('“Your numbers” says there is nothing to show yet', /Your numbers/.test(t) && /Not enough results/.test(t));
    ck('and it does not claim a source, a link or a statement', (await p.locator('#outside .ar-note').count()) === 0 && (await p.locator('#outside a').count()) === 0);
  }
  if (MODE === 'nokey') {
    ck('it says plainly that it is not connected, and that nothing is searched until the key is set', /Not connected yet\. The look needs the Anthropic key, which isn’t set up\. Nothing is searched until it is/.test(t));
    await p.locator('#outside button:has-text("Look now")').click(); await p.waitForSelector('#outside [role=alert]');
    ck('Look now says the key is missing and that nothing was searched', /needs the Anthropic key/.test(await panel(p)) && /Nothing was searched/.test(await panel(p)));
    ck('nothing was invented in its place', (await p.locator('#outside .ar-note').count()) === 0);
  }
  if (MODE === 'full') {
    ck('three statements, each with a status', (await p.locator('#outside .ar-note').count()) === 3 && (await p.locator('#outside .ar-note .ads-pill').allInnerTexts()).every(x => x === 'New'));
    ck('the week and the day the pages were read are shown', /Week of \d+ \w+, pages read on \w+, \w+ \d+, \d{4}/.test(t) && (await p.locator('#outside .ar-src').allInnerTexts()).every(x => /read on \w+, \w+ \d+, \d{4}/.test(x)));
    const links = await p.locator('#outside .ar-note a').evaluateAll(as => as.map(a => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent })));
    ck('every statement has a source link: https, opening in a new tab, rel noopener noreferrer, with the page’s title as its words', links.length >= 3 && links.every(l => /^https:\/\//.test(l.href) && l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel) && l.text.length > 5), JSON.stringify(links));
    ck('the three links are the ones the search returned', links.map(l => l.href).sort().join() === ['https://searchengineland.com/mock-black-friday-costs', 'https://www.facebook.com/business/help/mock-policy', 'https://www.wordstream.com/blog/mock-benchmarks'].sort().join());
    ck('no link is a javascript:, data: or an address that was not returned', !links.some(l => /^(javascript|data):/i.test(l.href)) && !/never-returned|example-blog/.test(await p.content()));
    ck('“The words the statement rests on” shows the snippet', (await p.evaluate(() => [...document.querySelectorAll('#outside .ar-note details')].every(d => d.textContent.includes('“')))) && (await p.evaluate(() => [...document.querySelectorAll('#outside .ar-note details')].map(d => d.textContent).join(' '))).includes('the course provider’s name in the ad'));
    ck('it says 14 statements were left out because their source, numbers or words didn’t check', /14 statements were left out because their source, numbers or words didn’t check/.test(t));
    ck('none of the bad statements is on the page (advice, a reason, a number the source lacks, a duplicate)', !/should add|because trust|\$4\.80|schedule reels|almost certainly|seven days|before-and-after/.test(t) && !/name,/.test(t) && ((t.match(/Meta says that from \d+ \w+ \d{4}/g) || []).length === 1));
    ck('each source shows its own date in plain form (“published 12 Nov 2026”), and the old “the page says it dates from … days ago” line is gone', (await p.locator('#outside .ar-src').allInnerTexts()).every(x => /published \d{1,2} \w{3} \d{4}/.test(x)) && !/the page says|dates from|days ago/.test(t));
    ck('every statement is a whole sentence (ends with a full stop) and none shows its question letter', (await p.locator('#outside .ar-note .ph p').allInnerTexts()).every(x => /[.!?]$/.test(x.trim()) && !/^\(/.test(x.trim())));
    ck('with no results synced there is no side-by-side line', (await p.locator('#outside .ar-cmp').count()) === 0);
    {   // with our numbers: the page’s own answer is passed through with figures added (the database in the test app has no synced results)
      const pd = await as(DIRECTOR);
      await pd.route('**/api/ops/ads-outside', async route => { if (route.request().method() !== 'GET') return route.continue(); const res = await route.fetch(), j = await res.json(); j.ours = { days: 30, figures: [{ key: 'cpm', label: 'Cost per 1,000 views (CPM)', per: 'per 1,000 views', value: '$18.00', basis: '20,000 views' }, { key: 'cpc', label: 'Cost per click (CPC)', per: 'per click', value: '$1.20', basis: '300 clicks' }] }; const n = j.notes.find(x => /cost per click/.test(x.statement)); if (n) n.compare = { label: 'Cost per click (CPC)', per: 'per click', ours: '$1.20', outside: '$1.72' }; await route.fulfill({ response: res, json: j }); });
      await open(pd);
      const pt = await panel(pd), cmp = (await pd.locator('#outside .ar-cmp').allInnerTexts()).join(' | ');
      ck('with figures: “Your numbers” shows ours, labelled, each with what it rests on', /Ours, from your Meta results/.test(pt) && /\$18\.00 per 1,000 views/.test(pt) && /\$1\.20 per click/.test(pt) && /from 300 clicks/.test(pt) && (await pd.locator('#outside .ar-figs li').count()) === 2 && !/Not enough results/.test(pt));
      ck('and beside the outside benchmark: “Ours: $1.20 per click. Outside: $1.72 per click (the source, published …).”', /^Ours: \$1\.20 per click\. Outside: \$1\.72 per click \(Facebook ad benchmarks by industry, published \d{1,2} \w{3} \d{4}\)\.$/.test(cmp), cmp);
      ck('with no verdict words in either', !/higher|lower|better|worse|should|than/i.test(cmp + ' ' + await pd.locator('#outside .ar-ours').innerText()));
      const md = await as(DIRECTOR, { width: 390, height: 800 }); await md.route('**/api/ops/ads-outside', async route => { if (route.request().method() !== 'GET') return route.continue(); const res = await route.fetch(), j = await res.json(); j.ours = { days: 30, figures: [{ key: 'cpm', label: 'Cost per 1,000 views (CPM)', per: 'per 1,000 views', value: '$18.00', basis: '20,000 views' }] }; const n = j.notes.find(x => /cost per click/.test(x.statement)); if (n) n.compare = { label: 'Cost per click (CPC)', per: 'per click', ours: '$1.20', outside: '$1.72' }; await route.fulfill({ response: res, json: j }); });
      await open(md);
      ck('at 390px with figures: no sideways scroll, the panel and the comparison fit the screen', await noSideways(md) && await md.evaluate(() => [...document.querySelectorAll('#outside .ar-ours, #outside .ar-figs li, #outside .ar-cmp')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
      await md.screenshot({ path: path.join(OUT, 'ads-research-ours-390.png'), fullPage: true });
      await pd.context().close(); await md.context().close();
    }
    ck('the links are at least 44px tall', await big(p, '#outside .ar-src a', 44));
    await p.locator('#outside button:has-text("Look now")').click(); await p.waitForSelector('#outside [role=alert]');
    ck('Look now right after the Monday look is refused in plain words', /A look was only just made\. Give it a few minutes\./.test(await panel(p)) && (await p.locator('#outside .ar-note').count()) === 3);
    await p.screenshot({ path: path.join(OUT, 'ads-research-1360.png'), fullPage: true });
    const rb = await as(cookie('rebecka@example.com')); await open(rb);
    ck('Rebecka (Ads role) sees it too, with the same links', (await rb.locator('#outside .ar-note').count()) === 3 && /outside information/.test(await panel(rb)));
    for (const [who, email] of [['Floss', 'floss@example.com'], ['a teacher', 'abha@example.com']]) { const o = await as(cookie(email)); await o.goto(U + AT); ck(`${who} does not get the page`, !/Outside research/.test(await o.content())); await o.context().close(); }
  }
  if (MODE === 'look') {
    ck('before it: nothing here yet', /Nothing here yet/.test(t));
    await p.locator('#outside button:has-text("Look now")').click();
    await p.waitForSelector('#outside .ar-note', { timeout: 20000 });
    const u = await panel(p);
    ck('Look now made a look: it says 3 statements were kept, and they are listed with links', /Done\. 3 statements with a source were kept\./.test(u) && (await p.locator('#outside .ar-note').count()) === 3 && (await p.locator('#outside .ar-note a').count()) >= 3);
    ck('nothing was left out in a good answer, so it says nothing about leaving out', !/statements? (was|were) left out/.test(u));
    await p.locator('#outside button:has-text("Look now")').click(); await p.waitForSelector('#outside [role=alert]');
    ck('pressing it again at once is refused (a few minutes apart)', /only just made/.test(await panel(p)) && (await p.locator('#outside .ar-note').count()) === 3);
  }
  if (MODE === 'lookempty') {
    await p.locator('#outside button:has-text("Look now")').click();
    await p.waitForFunction(() => /Nothing new we could back with a source this week/.test(document.querySelector('#outside').innerText), null, { timeout: 20000 });
    const u = await panel(p);
    ck('the page says plainly “Nothing new we could back with a source this week.”', /Nothing new we could back with a source this week\./.test(u) && (await p.locator('#outside .ar-note').count()) === 0 && (await p.locator('#outside a').count()) === 0);
    ck('and the button said so too', /Done\. Nothing new we could back with a source\./.test(u));
  }

  console.log('-- phone width (390px)');
  const m = await as(DIRECTOR, { width: 390, height: 800 }); await open(m);
  ck('no sideways scroll', await noSideways(m));
  ck('the Look now button is 44px tall and inside the screen', await m.locator('#outside button:has-text("Look now")').evaluate(e => { const r = e.getBoundingClientRect(); return r.height >= 43.5 && r.right <= innerWidth && r.left >= 0; }));
  if (MODE === 'full') {
    ck('statements, links and the label all fit the screen', await m.evaluate(() => [...document.querySelectorAll('#outside .ar-note, #outside .ar-note a, #outside .ar-label')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
    ck('every link is at least 44px tall', await big(m, '#outside .ar-src a', 44) && await big(m, '#outside .ar-note summary', 44));
    ck('the label is visible without scrolling the panel’s header away', await m.locator('#outside .ar-label').isVisible());
  }
  await m.screenshot({ path: path.join(OUT, `ads-research-${MODE}-390.png`), fullPage: true });
  await b.close(); console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
