// Ads PR 5, Audience insights, in a browser (run by ads-insights.sh after ads-insights-api.mjs full: a campaign has run, the weekly job has run, ideas exist, one is Sent to Programs,
// one is dismissed). The page for the director and for Rebecka, the five sources, the read with "See the numbers", the numbers, the quiz breakdowns, the topics table, the ideas (Send,
// Dismiss, Bring back), the funnel with its period chips, the Programs strip and "Create a program from this idea", Business without Audience, the Settings job, phone width (390px).
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const api = async (u, c = DIRECTOR) => (await fetch(U + u, { headers: { Cookie: `ep_ops=${c}` } })).json();
const PERSON = /Synthetic Person|synthetic\.person|example\.invalid|Marker Buyer|marker\.buyer/i;

const EMPTY = process.argv[2] === 'empty';
(async () => {
  if (EMPTY) {   // before anything has been read (no table exists): every section says plainly what it is waiting for, and nothing breaks
    const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
    await ctx.addCookies([{ name: 'ep_ops', value: DIRECTOR, url: U }]);
    const p = await ctx.newPage(), errs = [], posts = []; p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
    await p.goto(U + '/ops/ads?view=insights'); await p.waitForSelector('.ai-sources'); await p.waitForTimeout(500);
    const t = (await p.innerText('main')).replace(/\s+/g, ' ');
    ck('the empty page renders, with five sources listed as not read yet', (await p.locator('.ai-sources li').count()) === 5 && /Not read yet/.test(t));
    ck('the read says the first one is made on Monday and offers “Read the week now”', /The first read is made on Monday morning/.test(t) && (await p.locator('button', { hasText: 'Read the week now' }).count()) === 1);
    ck('the quiz, topics and ideas sections each say what they are waiting for', /No quiz answers have been read yet|The Practice Report isn’t connected yet|Practice Report/.test(t) && /Once a campaign has run in Meta|No ad results or purchases are connected yet|No topic had any results/.test(t) && /No ideas yet|Suggestions need the Anthropic key/.test(t));
    ck('the funnel section is there too', (await p.locator('#funnel').count()) === 1);
    ck('opening it posts nothing and throws nothing', posts.length === 0 && errs.length === 0, errs.join(' | '));
    const m = await (await b.newContext({ viewport: { width: 390, height: 800 } }));
    await m.addCookies([{ name: 'ep_ops', value: DIRECTOR, url: U }]); const q = await m.newPage(); await q.goto(U + '/ops/ads?view=insights'); await q.waitForSelector('.ai-sources'); await q.waitForTimeout(400);
    ck('phone: no sideways scroll on the empty page', !(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await b.close(); console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
  }
  const d = await api('/api/ops/ads-reads');
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (r.method() === 'POST') p.posts.push(r.url()); }); p.on('dialog', x => x.accept()); return p; };
  const p = await as(DIRECTOR), text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');

  console.log('-- the page');
  await p.goto(U + '/ops/ads?view=insights'); await p.waitForSelector('.ai-claims');
  const tabs = await p.locator('nav[aria-label="ads views"] a').allInnerTexts();
  ck('the Ads place has four tabs and Audience insights is current', tabs.join() === 'Campaigns,Audience library,Safety net,Audience insights' && (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'Audience insights', tabs.join());
  ck('opening the page posts nothing', p.posts.length === 0);
  const t = await text();
  ck('the five sources are listed, each connected or not', (await p.locator('.ai-sources li').count()) === 5 && (await p.locator('.ai-sources li .ads-pill.good').count()) === 5 && /Practice Report/.test(t) && /Kit purchases/.test(t) && /Circle purchases/.test(t) && /Meta ads/.test(t) && /Kit emails/.test(t));
  const n = await p.locator('.ai-claims > li').count();
  ck('the weekly read has its claims, each with a “See the numbers” that opens to its metrics, source and period', n === d.week.claims.length && n >= 3 && (await p.locator('.ai-claims summary', { hasText: 'See the numbers' }).count()) === n);
  await p.locator('.ai-claims summary').first().click();
  const open = (await p.locator('.ai-claims details[open]').first().innerText()).replace(/\s+/g, ' ');
  ck('the opened numbers name the source, the period and the id', /(Practice Report|Meta|Circle|Kit purchases|Kit email) · \d+ \w+ to \d+ \w+ · m\d+/.test(open), open);
  await p.locator('.ai-all summary').first().click();
  ck('“All the numbers” lists every metric with its id', (await p.locator('.ai-all tbody tr').count()) === d.week.metrics.length);
  ck('Circle and Kit purchases are shown apart, and the page says they are not added together', /counted separately and not added together/.test(await text()) && (await p.locator('.ai-topics thead th', { hasText: 'Circle purchases' }).count()) === 1 && (await p.locator('.ai-topics thead th', { hasText: 'Kit purchases' }).count()) === 1);
  console.log('-- breakdowns and topics');
  ck('the quiz breakdowns: five questions as bars with counts and percentages', (await p.locator('.ai-bk').count()) === 5 && (await p.locator('.ai-row').count()) >= 6 && /\d+ · \d+%/.test(await p.locator('.ai-row .v').first().innerText()));
  ck('the topic table has the Kali row with its spend and return, and flags a small one as too few to trust', (await p.locator('.ai-topics tr', { hasText: 'Kali' }).count()) === 1 && /× return/.test(await p.locator('.ai-topics tr', { hasText: 'Kali' }).innerText()) && (await p.locator('.ai-topics .ads-pill', { hasText: 'Too few to trust' }).count()) >= 0 && /Too few to trust means fewer than 5 purchases/.test(await text()));
  console.log('-- ideas');
  const cards = await p.locator('.ai-ideas > .ai-idea').count();
  ck('ideas are shown with their format, audience and evidence (one sent, one dismissed in the list)', cards >= 1 && /Fits:/.test(await text()) && (await p.locator('.ai-idea summary', { hasText: 'The evidence' }).count()) >= 1 && /Sent to Programs/.test(await text()) && /Dismissed ideas \(\d+\)/.test(await text()));
  const fresh = p.locator('.ai-idea[data-status=new]').first();
  ck('a new idea has Send to Programs and Dismiss', await fresh.locator('button', { hasText: 'Send to Programs' }).count() === 1 && await fresh.locator('button', { hasText: 'Dismiss' }).count() === 1);
  const title = (await fresh.locator('b').first().innerText());
  await fresh.locator('button', { hasText: 'Dismiss' }).click(); await p.waitForSelector('[role=status]:has-text("won’t be suggested again")');
  ck('Dismiss says it won’t be suggested again and the idea moves to Dismissed', (await p.locator('.ai-idea[data-status=new] b', { hasText: title }).count()) === 0 && /Dismissed ideas/.test(await text()));
  await p.locator('.ai-all summary', { hasText: 'Dismissed ideas' }).click();
  await p.locator('.ai-idea[data-status=dismissed]').filter({ has: p.locator('b', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('button', { hasText: 'Bring back' }).click();   // by the idea's own title (another idea's format can carry the same words) await p.waitForSelector(`.ai-idea[data-status=new] b:has-text("${title}")`);
  ck('Bring back puts it back as new', true);
  console.log('-- the funnel');
  ck('the quiz funnel section is on the page, with period chips', (await p.locator('#funnel').count()) === 1 && (await p.locator('nav[aria-label="Funnel period"] a').count()) === 3);
  await p.locator('nav[aria-label="Funnel period"] a', { hasText: 'Quarter' }).click(); await p.waitForURL(/f=90/);
  ck('the chips change the period and stay on Audience insights', /view=insights&f=90/.test(p.url()) && (await p.locator('nav[aria-label="Funnel period"] a[aria-current=page]').innerText()) === 'Quarter');
  console.log('-- Programs');
  await p.goto(U + '/ops/programs'); await p.waitForSelector('#ideas-from-ads');
  const strip = (await p.innerText('#ideas-from-ads')).replace(/\s+/g, ' ');
  ck('the “Ideas from Ads” strip: Draft, the evidence, a link back', /Ideas from Ads/.test(strip) && /Draft/.test(strip) && /The evidence/.test(strip) && (await p.locator('#ideas-from-ads a', { hasText: 'Back to the numbers' }).count()) >= 1);
  p.posts.length = 0;
  await p.locator('#ideas-from-ads a', { hasText: 'Create a program from this idea' }).first().click(); await p.waitForSelector('.ops-program-add');
  const prefill = await p.inputValue('#pg-name'), idea = d.ideas.sent[0];
  ck('“Create a program from this idea” opens Add a program with the title filled in; nothing is saved until the person saves it', prefill === idea.title && /idea=/.test(p.url()) && p.posts.length === 0 && /New program/.test(await text()), `${prefill} / ${idea.title}`);
  console.log('-- Business, Settings, Rebecka');
  await p.goto(U + '/ops/business'); await p.waitForSelector('nav[aria-label="business views"]');
  ck('Business shows Finance and Payroll only', (await p.locator('nav[aria-label="business views"] a').allInnerTexts()).join() === 'Finance,Payroll');
  await p.goto(U + '/ops/business?view=audience&f=365'); await p.waitForURL(/\/ops\/ads/);
  ck('the old Business address lands on the funnel in Ads with its period', /view=insights/.test(p.url()) && /f=365/.test(p.url()) && (await p.locator('nav[aria-label="Funnel period"] a[aria-current=page]').innerText()) === 'Year');
  await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('[aria-label="Scheduled jobs"]');
  ck('Settings lists the weekly job in plain words', /Audience insights\s+Mondays at 11:45 UTC/.test(await p.locator('[aria-label="Scheduled jobs"] tbody').innerText()));
  const rb = await as(cookie('rebecka@example.com'));
  await rb.goto(U + '/ops/ads?view=insights'); await rb.waitForSelector('.ai-claims');
  ck('Rebecka sees the read, the topics and the funnel; the Send button is hers too', (await rb.locator('#funnel').count()) === 1 && (await rb.locator('.ai-claims > li').count()) >= 3);
  await rb.goto(U + '/ops/business'); ck('Rebecka still cannot open Business', !new URL(rb.url()).pathname.startsWith('/ops/business'));
  for (const [who, email] of [['Floss', 'floss@example.com'], ['a teacher', 'abha@example.com']]) { const o = await as(cookie(email)); await o.goto(U + '/ops/ads?view=insights'); ck(`${who} is sent away from Audience insights`, !/Audience insights/.test(await o.content()) || !new URL(o.url()).pathname.startsWith('/ops/ads')); }
  console.log('-- no personal data on screen');
  const all = [await p.content()]; for (const u of ['/ops/ads?view=insights', '/ops/programs']) { await p.goto(U + u); await p.waitForTimeout(800); all.push(await p.content()); }
  ck('no name or email from the quiz, Circle or Kit appears on a page', !all.some(h => PERSON.test(h)));
  console.log('-- phone width');
  const m = await as(DIRECTOR, { width: 390, height: 800 });
  for (const [u, sel] of [['/ops/ads?view=insights', '.ai-claims'], ['/ops/programs', '#ideas-from-ads']]) {
    await m.goto(U + u); await m.waitForSelector(sel); await m.waitForTimeout(500);
    const r = await m.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [...document.querySelectorAll('.ai button, .pg-ideas .soc-btn, .ai summary, .ai-weeks button')].filter(e => e.getBoundingClientRect().height < 43.5 && e.getBoundingClientRect().height > 0).length }));
    ck(`phone: ${u} has no sideways scroll and its buttons are 44px tall`, r.over <= 1 && r.small === 0, JSON.stringify(r));
    await m.screenshot({ path: path.join(OUT, `ads-insights-${u.includes('programs') ? 'programs' : 'page'}-phone.png`), fullPage: true });
  }
  await m.goto(U + '/ops/ads?view=insights'); await m.waitForSelector('.ai-topics');
  ck('phone: the topic table scrolls inside its panel, the page does not', await m.evaluate(() => { const w = document.querySelector('.ai-topics').closest('.ads-scroll'); return w.scrollWidth > w.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; }));
  ck('no page error', p.errs.length === 0 && m.errs.length === 0 && rb.errs.length === 0, p.errs.join(' | '));
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
