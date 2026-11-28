// Ads › Creative results in a browser, desktop (1360) and phone (390). Run by ads-creative.sh:
//   b0  the app with no Meta key and no tables (the page's first words), b  after a draft that was never sent,
//   a   the six campaigns built by ads-creative-api.mjs a (the app, the Meta mock and the data stay as that left them): a small size first (everything too early, the plain banner),
//       then the real size: ranking, labels, the one-audience note, words as saved, pairings, "where it ran" with its two links, the lead tab, roles, phone width, no key. Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'a';
const U = 'http://localhost:3100', META = 'http://localhost:4556', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const api = async (u, c = DIRECTOR) => (await fetch(U + u, { headers: { Cookie: `ep_ops=${c}` } })).json();
const get = (u, c) => fetch(U + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${c}` } });
const sync = () => fetch(U + '/api/ops/ads-sync', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then(r => r.json());
const KEY = /mock-ads-token-for-the-settings-test|act_MOCK1/;
const URL_ = '/ops/ads?view=creative';

(async () => {
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { if (r.method() !== 'GET') p.posts.push(r.url()); }); return p; };
  const p = await as(DIRECTOR);

  if (PHASE === 'b0' || PHASE === 'b') {
    console.log(`-- the first words (${PHASE === 'b0' ? 'no Meta key, no tables' : 'a draft, nothing sent'})`);
    await p.goto(U + URL_); await p.waitForSelector('.ads');
    await p.waitForFunction(() => !/Reading the results/.test(document.querySelector('.ads')?.innerText || ''));
    const t = await p.innerText('.ads');
    ck('it says Meta isn’t connected, in plain words', /Meta isn’t connected here/.test(t));
    ck(PHASE === 'b0' ? 'it says no ads have been built yet' : 'it says nothing has been sent to Meta yet', PHASE === 'b0' ? /No ads have been built here yet/.test(t) : /No campaign has been sent to Meta yet/.test(t), t.slice(0, 300));
    ck('no table, no button and no number is shown', await p.locator('.ads table').count() === 0 && await p.locator('.ads button').count() === 0);
    ck('the Creative results tab is selected and opening it posted nothing', (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'Creative results' && p.posts.length === 0 && p.errs.length === 0);
    await b.close(); console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
  }

  console.log('-- a small size first: nothing has run long enough');
  await fetch(`${META}/__mode?scale=0.1,0.1,0.1,0.1,0.1,0.1`); await sync();
  await p.goto(U + URL_); await p.waitForSelector('.ads-table');
  let t = await p.innerText('.ads');
  ck('the page says plainly that nothing has run long enough to judge', /Nothing has run long enough yet to judge/.test(t) && /Too early to say/.test(t));
  ck('no picture is called best or weakest, and the counts say 0 ahead and 0 behind', !/Best so far|Weakest so far/.test(t) && /Ahead of the line\s*0/.test(t.replace(/\n+/g, ' ')) && /Behind the line\s*0/.test(t.replace(/\n+/g, ' ')));
  ck('the pairing panel says none has spent enough yet and counts the rest', /No picture and words together have spent \$50 yet/.test(t) && /other pairings? not shown/.test(t));
  await fetch(`${META}/__mode?scale=5,5,0.2,0.3,5,5`); await sync();

  console.log('-- the page, desktop');
  const v = await api('/api/ops/ads-creative'), sales = v.groups.find(g => g.kind === 'Purchase'), leads = v.groups.find(g => g.kind === 'Lead');
  await p.goto(U + URL_); await p.waitForSelector('.ads-table tbody tr');
  const heading = await p.locator('.ops-shell h1, .ops-shell [class*=title]').first().innerText().catch(() => '');
  t = await p.innerText('.ads');
  ck('the tab is in the Ads tabs after Campaigns and is selected', (await p.locator('nav[aria-label="ads views"] a').allInnerTexts()).slice(0, 2).join('|') === 'Campaigns|Creative results' && (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'Creative results', heading);
  ck('“how to read this” says Meta’s numbers, that Kit and Circle sales are not counted, the $1.50 line and that it changes nothing', /Meta’s numbers/.test(t) && /Real sales from Kit and Circle are not counted/.test(t) && /\$1\.50 back for every \$1 spent/.test(t) && /changes nothing and never chooses/.test(t));
  ck('it says when Meta’s numbers were last read', /Meta’s numbers were last read .* ET\./.test(t));
  for (const n of ['Pictures', 'Words', 'Pictures with words']) ck(`there is a “${n}” panel`, await p.locator(`section[aria-label="${n}"]`).count() === 1);
  const rows = p.locator('section[aria-label="Pictures"] tbody tr');
  ck(`one row for each of the ${sales.images.length} pictures, best first`, await rows.count() === sales.images.length && /Ahead of the \$1\.50 line/.test(await rows.first().innerText()) && /Best so far/.test(await rows.first().innerText()));
  ck('the weakest judged picture says so, and Too early rows come last', /Weakest so far/.test(await p.locator('section[aria-label="Pictures"] tbody tr', { hasText: 'Weakest so far' }).innerText()) && /Too early to say/.test(await rows.last().innerText()));
  const lab = await p.locator('section[aria-label="Pictures"] tbody .ads-pill').allInnerTexts();
  ck('the plain labels are all there: Ahead of the $1.50 line, Behind the line, Too early to say', ['Ahead of the $1.50 line', 'Behind the line', 'Too early to say'].every(l => lab.includes(l)));
  ck('a picture that ran in one audience only says so', await p.locator('section[aria-label="Pictures"] .ads-pill', { hasText: 'Ran in only one audience' }).count() === sales.images.filter(r => r.one_audience).length && sales.images.some(r => r.one_audience));
  const first = rows.nth(1), fr = sales.images[1];
  ck('a row shows what was spent, the return, the sales and the click-through, from the same numbers as the API', (await first.innerText()).includes(`$${(fr.spend_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`) && (await first.innerText()).includes(`${+fr.value.toFixed(2)}×`) && (await first.innerText()).includes(`${fr.ctr}%`));
  ck('every thumbnail loaded, and is not announced twice (its name sits beside it)', await p.locator('section[aria-label="Pictures"] img.ads-cr-thumb').evaluateAll(a => a.length > 0 && a.every(i => i.complete && i.naturalWidth > 0 && i.getAttribute('alt') === '')));
  const d0 = rows.first().locator('details');
  await d0.locator('summary').focus(); await p.keyboard.press('Enter');
  ck('“where it ran” opens from the keyboard and lists the audiences, what each spent and the campaigns', await d0.evaluate(e => e.open) && (await d0.innerText()).includes('Audiences, by what each spent') && await d0.locator('.ads-cr-list').count() === 2);
  const links = await d0.locator('a.ads-cr-link').evaluateAll(a => a.map(x => [x.textContent, x.getAttribute('href'), x.target, x.rel, x.getAttribute('aria-label')]));
  ck('each campaign has two links, and they only open things: Ops, and Meta’s Ads Manager in a new tab', links.length >= 2 && links.some(l => l[0] === 'Open in Ops' && /^\/ops\/ads\/cmp_/.test(l[1])) && links.some(l => l[0] === 'Open in Ads Manager' && /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=mock_campaign_\d+$/.test(l[1]) && l[2] === '_blank' && /noopener/.test(l[3]) && /new tab/.test(l[4])), JSON.stringify(links));
  const opsHref = links.find(l => l[0] === 'Open in Ops')[1];
  await d0.locator('a.ads-cr-link', { hasText: 'Open in Ops' }).first().click(); await p.waitForURL(U + opsHref);
  await p.waitForSelector('.ads-live');
  ck('“Open in Ops” opens that campaign’s own page', /Creative [A-F] 2027/.test(await p.innerText('.ads-head')) && /Campaign/.test(await p.title()));
  await p.goto(U + URL_); await p.waitForSelector('.ads-table tbody tr');
  const words = p.locator('section[aria-label="Words"]');
  ck('the words are shown exactly as saved (headline, then the body), for the set that ran in two campaigns', (await words.innerText()).includes('Headline A1: Kali, the dark mother') && (await words.innerText()).includes('Words A1. Eight Wednesdays of study and practice with the goddess who wears time as a garland.') && await words.locator('.ads-cr-card').count() === sales.copy.length);
  ck('the words panel says they ran together, so no single text is judged', /cannot say which single text did better/.test(await words.innerText()) && /5 texts that ran together in every one of these ads/.test(await words.innerText()));
  ck('a set of words that ran in two campaigns says so (2 campaigns)', /2 campaigns/.test(await words.locator('.ads-cr-card').first().innerText()));
  const pairs = p.locator('section[aria-label="Pictures with words"]');
  ck('pairings list only those with enough spend, say how many were left out, and are ranked', await pairs.locator('.ads-cr-card').count() === sales.pairs.length && /other pairings not shown: not enough spent yet/.test(await pairs.innerText()) && /Ahead of the \$1\.50 line/.test(await pairs.locator('.ads-cr-card').first().innerText()));
  ck('there is no pause, edit, retire or delete control anywhere on the page', (await p.locator('.ads button').allInnerTexts()).every(x => /^(Sales ads|Lead ads)/.test(x)) && !/\b(Pause|Retire|Delete|Edit)\b/.test(await p.locator('.ads').innerText()));
  ck('opening the page and its panels posted nothing, and raised no error', p.posts.length === 0 && p.errs.length === 0, p.posts.concat(p.errs).join(' | '));

  console.log('-- the lead ads');
  await p.getByRole('button', { name: /^Lead ads/ }).click(); await p.waitForTimeout(300);
  t = await p.innerText('.ads');
  ck('the Lead ads view is judged on cost per lead, with the lead wording', /Judged on cost per lead/.test(t) && /a lead/.test(t) && /Cost per lead/.test(t) && await p.locator('section[aria-label="Pictures"] tbody tr').count() === leads.images.length);
  ck('the toggle says which kind is shown', await p.getByRole('button', { name: /^Lead ads/ }).getAttribute('aria-pressed') === 'true' && await p.getByRole('button', { name: /^Sales ads/ }).getAttribute('aria-pressed') === 'false');
  ck('the Traffic campaign is named as left out', /1 traffic campaign left out/.test(t));

  console.log('-- roles');
  const reb = cookie('rebecka@example.com');
  ck('Rebecka opens it and sees the same pictures', (await get(URL_, reb)).status === 200 && (await api('/api/ops/ads-creative', reb)).groups[0].images.length === sales.images.length);
  for (const [n, e] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']]) ck(`${n} is sent away`, (await get(URL_, cookie(e))).status !== 200 && (await get('/api/ops/ads-creative', cookie(e))).status === 403);
  const noKey = await (await get(URL_, DIRECTOR)).text();
  ck('no key and no ad account word in the page or its data', !KEY.test(noKey) && !KEY.test(await p.content()) && !KEY.test(JSON.stringify(v)));

  console.log('-- phone width (390px)');
  const m = await as(DIRECTOR, { width: 390, height: 800 });
  await m.goto(U + URL_); await m.waitForSelector('.ads-table tbody tr'); await m.waitForTimeout(600);
  for (const s of await m.locator('section[aria-label="Pictures"] summary').all()) await s.click();
  const r = await m.evaluate(() => {
    const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
    const tg = [...document.querySelectorAll('.ads button, .ads summary, .ads a.ads-cr-link, .ads-seg button')].filter(e => e.offsetParent);
    const sc = document.querySelector('section[aria-label="Pictures"] .ads-scroll');
    return { over, small: tg.filter(e => e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.getAttribute('aria-label') || '').slice(0, 24)), n: tg.length,
      scrolls: sc.scrollWidth > sc.clientWidth && getComputedStyle(sc).overflowX === 'auto', region: sc.getAttribute('role') === 'region' && sc.tabIndex === 0 && !!sc.getAttribute('aria-label'),
      tableInPanel: [...document.querySelectorAll('.ads-table')].every(t => t.closest('.ads-scroll')), cards: [...document.querySelectorAll('.ads-cr-card')].every(c => c.getBoundingClientRect().right <= w + 1) };
  });
  ck('no sideways scroll on the page', r.over <= 1, `${r.over}px`);
  ck('every control and link is 44px tall', r.n > 5 && r.small.length === 0, r.small.join(', '));
  ck('the table scrolls inside its panel, which a keyboard can reach and which is named', r.tableInPanel && r.scrolls && r.region);
  ck('the cards for words and pairings fit the screen', r.cards);
  await m.screenshot({ path: path.join(OUT, 'ads-creative-phone.png'), fullPage: true });
  await p.goto(U + URL_); await p.waitForSelector('.ads-table tbody tr'); await p.screenshot({ path: path.join(OUT, 'ads-creative-desktop.png'), fullPage: true });
  ck('no page error at phone width, nothing posted', m.errs.length === 0 && m.posts.length === 0, m.errs.join(' | '));
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
