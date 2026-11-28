// The Ads account view in a browser (run by ads-account.sh, after ads-account-api.mjs on the same app): Ads › Campaigns › "In your Meta account". Phases:
//   a  no Meta key: the "not connected" words, no table, Refresh off, Meta asked nothing
//   b  Meta key set, the Meta mock's 'account' world (11 campaigns, none made in Ops): the rows, badges, status words, budgets, dates, 7 and 30 days, return, "Needs a look" reasons,
//      the five filters, totals equal to the sum of the rows, the notes, the Manager links, Refresh and its one-a-minute rule, nothing written, roles, phone width (390px)
//   c  as b with a campaign built in Ops and sent to the mock: exactly that row is "Made in Ops"
//   d  Meta answers with a rate limit from the start: "Meta couldn't be read just now" with the reason, no rows     e  an account with no campaigns
// Mock only. The existing Ops campaigns list stays on the page, unchanged.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'b';
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out'), META = 'http://localhost:4556';
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const KEYS = /mock-ads-token-for-the-settings-test|mock-ads-token-for-the-safety-test/;
const num = t => Number(String(t).replace(/[^0-9.]/g, '') || 0);

(async () => {
  fs.mkdirSync(path.join(OUT, 'ads'), { recursive: true });
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => r.method() === 'POST' && p.posts.push(r.url())); p.on('dialog', d => d.accept()); return p; };
  const p = await as(DIRECTOR);
  const open = async pg => { await pg.goto(U + '/ops/ads'); await pg.waitForSelector('section[aria-label="In your Meta account"]'); await pg.waitForFunction(() => !/Reading your Meta account/.test(document.querySelector('section[aria-label="In your Meta account"]').innerText)); return pg.locator('section[aria-label="In your Meta account"]'); };
  const sec = await open(p);
  const secText = () => sec.innerText();
  const worked = async () => (await meta()).requests.filter(r => r.write).length;

  if (PHASE === 'a') {
    console.log('-- no Meta key');
    const t = await secText();
    ck('the section says Meta isn’t connected, and names the setting to add', /In your Meta account/.test(t) && /Meta isn’t connected yet/.test(t) && /META_ADS_TOKEN/.test(t), t.slice(0, 300));
    ck('no table, no filters; Refresh is off', await sec.locator('table').count() === 0 && await sec.locator('.ads-seg').count() === 0 && await sec.getByRole('button', { name: 'Refresh from Meta' }).isDisabled());
    ck('Meta was asked nothing', (await meta()).total === 0);
    ck('the Ops campaigns list is still on the page', await p.locator('section[aria-label="Campaigns"]').count() === 1 && await p.locator('.ads-kpis').count() === 1);
  }

  if (PHASE === 'd') {
    console.log('-- Meta answers with a rate limit');
    const t = await secText();
    ck('"Meta couldn’t be read just now" with the reason in plain words', /Meta couldn’t be read just now/.test(t) && /slow down/.test(t), t.slice(0, 300));
    ck('no table; Meta\'s own wording and the key are not shown', await sec.locator('table').count() === 0 && !/Too many calls|\(mock\)/.test(t) && !KEYS.test(await p.content()));
    ck('Refresh is on (a person may try again)', await sec.getByRole('button', { name: 'Refresh from Meta' }).isEnabled());
    ck('the Ops campaigns list is still on the page', await p.locator('section[aria-label="Campaigns"]').count() === 1);
  }

  if (PHASE === 'e') {
    console.log('-- an account with no campaigns');
    ck('"No campaigns in this ad account yet"', /No campaigns in this ad account yet/.test(await secText()) && await sec.locator('table').count() === 0);
  }

  if (PHASE === 'b' || PHASE === 'c') {
    const calls0 = (await meta()).total;
    console.log('-- the list');
    await sec.locator('.acct-table tbody tr').first().waitFor();
    const rows = sec.locator('.acct-table tbody tr'), n = PHASE === 'c' ? 12 : 11;
    ck('opening the page after the first look asks Meta nothing (served from memory)', (await meta()).total === calls0 && p.posts.length === 0, `${(await meta()).total} vs ${calls0}; ${p.posts}`);
    ck(`${n} campaigns, one row each`, await rows.count() === n, String(await rows.count()));
    ck('the heading and the read-only promise', /In your Meta account/.test(await secText()) && /Read only: nothing here changes anything in Meta/.test(await secText()));
    const spend30 = await sec.locator('.acct-table tbody td.c-spend30').allInnerTexts();
    ck('sorted by the last 30 days’ spend, biggest first', spend30.every((t, i) => i === 0 || num(spend30[i - 1]) >= num(t)), spend30.join(' '));
    const row = id => sec.locator(`.acct-table tbody tr[data-id="${id}"]`), cell = async (id, c) => (await row(id).locator(`td.${c}`).innerText()).replace(/\s+/g, ' ').trim();
    ck('a healthy purchase campaign: $350 and $1,500, 14 and 60 purchases, return 2.00×', await cell('W_OK1', 'c-spend7') === '$350' && await cell('W_OK1', 'c-spend30') === '$1,500' && await cell('W_OK1', 'c-res7') === '14 purchases' && await cell('W_OK1', 'c-res30') === '60 purchases' && await cell('W_OK1', 'c-ret7') === '2.00×' && await cell('W_OK1', 'c-ret30') === '2.00×', [await cell('W_OK1', 'c-spend7'), await cell('W_OK1', 'c-res7'), await cell('W_OK1', 'c-ret7')].join(' | '));
    ck('a lead campaign: leads, and a cost per lead instead of a return', await cell('W_OK2', 'c-res7') === '105 leads' && await cell('W_OK2', 'c-ret7') === '$2 a lead', `${await cell('W_OK2', 'c-res7')} | ${await cell('W_OK2', 'c-ret7')}`);
    ck('status in plain words: Active, Paused, Ended (paused past its end), Archived', await cell('W_OK1', 'c-status') === 'Active' && await cell('W_PAUSED', 'c-status') === 'Paused' && await cell('W_ENDED', 'c-status') === 'Ended' && await cell('W_ARCH', 'c-status') === 'Archived');
    ck('budget: a day, in all, on its ad sets, none', /\$50 a day/.test(await cell('W_PAST', 'c-budget')) && /\$900 in all/.test(await cell('W_ZERO', 'c-budget')) && /\$15 a day \(on its ad sets\)/.test(await cell('W_SETS', 'c-budget')) && await cell('W_OK1', 'c-budget') === '—', [await cell('W_PAST', 'c-budget'), await cell('W_ZERO', 'c-budget'), await cell('W_SETS', 'c-budget')].join(' | '));
    ck('dates: "From … To …", and a "No end date" badge when there is none', /From .*\d{4}.*To .*\d{4}/.test(await cell('W_PAST', 'c-dates')) && /No end date/.test(await cell('W_OPEN', 'c-dates')) && !/No end date/.test(await cell('W_OK1', 'c-dates')));
    ck('too little to say shows "—": the archived campaign has no return', await cell('W_ARCH', 'c-ret30') === '—' && await cell('W_ARCH', 'c-spend30') === '$0');
    console.log('-- who made it');
    const mine = sec.locator('.acct-table tbody a.ads-pill.good'), notMine = sec.locator('.acct-table tbody span.ads-pill.calm', { hasText: 'Not made in Ops' });
    if (PHASE === 'b') ck('every campaign says "Not made in Ops" (there are no Ads tables yet)', await mine.count() === 0 && await notMine.count() === 11);
    else {
      ck('exactly one is "Made in Ops": the campaign built here, and it opens its Ops page', await mine.count() === 1 && /Made in Ops/.test(await mine.first().innerText()) && /^\/ops\/ads\/cmp_/.test(await mine.first().getAttribute('href')) && /^mock_campaign_/.test(await sec.locator('.acct-table tbody tr', { has: p.locator('a.ads-pill.good') }).getAttribute('data-id')) && await notMine.count() === 11);
      await mine.first().click(); await p.waitForURL(/\/ops\/ads\/cmp_/); await p.goBack(); await open(p);
    }
    console.log('-- Paging (865 campaigns in the real account)');
    {
      const pg2 = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
      await pg2.context().addCookies([{ name: 'ep_ops', value: DIRECTOR, url: U }]);
      await pg2.route('**/api/ops/ads-account', async route => {
        const r = await route.fetch(), j = await r.json(), base = j.rows[0];
        j.rows = Array.from({ length: 60 }, (_, k) => ({ ...base, id: 'PG' + k, name: 'Paging test ' + k }));
        await route.fulfill({ response: r, json: j });
      });
      const sec2 = await open(pg2), rows2 = sec2.locator('.acct-table tbody tr');
      ck('a long list shows 25 rows first, and says how many there are', await rows2.count() === 25 && /Showing 25 of 60/.test(await sec2.innerText()));
      await sec2.getByRole('button', { name: 'Show 25 more' }).click();
      ck('"Show 25 more" adds 25', await rows2.count() === 50);
      await sec2.getByRole('button', { name: 'Show 10 more' }).click();
      ck('the last page adds only what is left, and the button goes away', await rows2.count() === 60 && await sec2.getByRole('button', { name: /more|Show all/ }).count() === 0);
      ck('the total row still covers the whole list', /Total of all 60 in this list/.test(await sec2.locator('tfoot').innerText()));
      await sec2.locator('.ads-seg button', { hasText: 'Active' }).click(); await sec2.locator('.ads-seg button', { hasText: /^All/ }).click();
      ck('changing the filter starts again at 25', await rows2.count() === 25);
      await sec2.getByRole('button', { name: 'Show all' }).click();
      ck('"Show all" shows everything', await rows2.count() === 60);
      await pg2.context().close();
    }
    console.log('-- Needs a look');
    const why = async id => (await row(id).locator('.acct-why').allInnerTexts()).join(' | ');
    ck('running past its end time', /Still running after its end time/.test(await why('W_PAST')), await why('W_PAST'));
    ck('no end date and no cap', /Running with no end date and no spending cap/.test(await why('W_OPEN')), await why('W_OPEN'));
    ck('spending with nothing to show', /nothing to show/.test(await why('W_ZERO')), await why('W_ZERO'));
    ck('a return under the floor', /Return 0\.60×/.test(await why('W_LOW')), await why('W_LOW'));
    ck('the healthy, paused, ended and archived ones have no reason chip', (await Promise.all(['W_OK1', 'W_OK2', 'w_ops', 'W_PAUSED', 'W_ENDED', 'W_ARCH', 'W_SETS'].map(why))).every(t => t === ''));
    console.log('-- the five filters, and the totals');
    const chips = sec.locator('.ads-seg button'), chip = l => sec.locator('.ads-seg button', { hasText: l }).first();
    ck('the chips are All, Active, Paused, Needs a look, Not made in Ops, each with its count', (await chips.allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join('|') === `All ${n}|Active ${n === 12 ? 8 : 8}|Paused ${PHASE === 'c' ? 2 : 1}|Needs a look 4|Not made in Ops 11`, (await chips.allInnerTexts()).join('|'));
    const shown = async () => (await rows.count());
    const sumOf = async c => (await sec.locator(`.acct-table tbody td.${c}`).allInnerTexts()).reduce((a, t) => a + num(t), 0);
    for (const [l, want] of [['All', n], ['Active', 8], ['Paused', PHASE === 'c' ? 2 : 1], ['Needs a look', 4], ['Not made in Ops', 11]]) {
      await chip(l).click();
      const tot = await sec.locator('tfoot').innerText();
      ck(`${l}: ${want} rows, and the total row is the sum of exactly those rows (7 and 30 days)`, await shown() === want && new RegExp(`Total of all ${want} in this list`).test(tot) && num(await sec.locator('tfoot td.c-spend7').innerText()) === await sumOf('c-spend7') && num(await sec.locator('tfoot td.c-spend30').innerText()) === await sumOf('c-spend30'), `${await shown()} ${tot.replace(/\n/g, ' ')}`);
    }
    await chip('All').click();
    ck('with everything shown the total row has the 30-day spend and one blended return (n.nn×) across purchase campaigns only, as Meta counts it', /Return is across purchase campaigns only, as Meta counts it/.test(await sec.locator('tfoot').innerText()) && /^\d+\.\d\d×$/.test((await sec.locator('tfoot td.c-ret30').innerText()).trim()) && num(await sec.locator('tfoot td.c-spend30').innerText()) > 0);
    await chip('Needs a look').click(); await chip('Not made in Ops').click(); await chip('All').click();
    console.log('-- the notes, the links');
    const t = await secText();
    ck('"Return and results are as Meta counts them. Real Circle and Kit sales come in a later update."', t.includes('Return and results are as Meta counts them. Real Circle and Kit sales come in a later update.'));
    ck('"Made in Ops" explained, and that Ops never changes these campaigns', /“Made in Ops” means the campaign was built here from a launch/.test(t) && /Ops only reads these campaigns and never changes them/.test(t));
    const links = await sec.locator('a.acct-open').evaluateAll(as => as.map(a => [a.href, a.target, a.rel, a.innerText]));
    ck('every row opens Meta Ads Manager in a new tab, with the campaign in the link and no key', links.length === n && links.every(([h, tg, rel, tx]) => /^https:\/\/adsmanager\.facebook\.com\/adsmanager\/manage\/campaigns\?act=MOCK1&selected_campaign_ids=/.test(h) && tg === '_blank' && /noopener/.test(rel) && tx === 'Open in Meta Ads Manager' && !KEYS.test(h)));
    ck('the "as of" time is shown', /As of \d{1,2}:\d{2} (AM|PM)/.test(t), t.slice(0, 200));
    ck('the Ops campaigns list, the Ad Agent panel and the who-sees-this note are still on the page', await p.locator('section[aria-label="Campaigns"]').count() === 1 && await p.locator('section[aria-label="What the Ad Agent did today"]').count() === 1 && await p.locator('.ads-kpis').count() === 1);
    ck('the Ads place still has its four tabs, Campaigns current', (await p.locator('nav[aria-label="ads views"] a').allInnerTexts()).join() === 'Campaigns,Audience library,Safety net,Audience insights,What we’ve learned');
    console.log('-- Refresh, once a minute');
    const before = (await meta()).total, btn = sec.getByRole('button', { name: 'Refresh from Meta' });
    await btn.click(); await sec.getByText('Asked Meta again.').waitFor();
    ck('Refresh asks Meta again (four more reads) and says so', (await meta()).total === before + 4 && p.posts.filter(u => /ads-account/.test(u)).length === 1 && p.posts.every(u => /ads-account/.test(u)));
    ck('the button waits (a countdown) and cannot be pressed again at once', await btn.isDisabled() && /Refresh \(\d+s\)/.test(await btn.innerText()));
    await p.reload(); await sec.locator('.acct-table').waitFor();
    await sec.getByRole('button', { name: 'Refresh from Meta' }).click(); await sec.getByText(/only just refreshed/).waitFor();
    ck('pressing it again after a reload is stopped by the server: told to wait, the same page stays, no request to Meta', (await meta()).total === before + 4 && await rows.count() === n && /You can ask Meta again in \d+ seconds/.test(await secText()));
    ck('the page only ever posted the Refresh', p.posts.every(u => /ads-account/.test(u)));
    console.log('-- nothing is written, nothing leaks');
    const log = (await meta()).requests;
    ck('Meta’s write log: no write by anything on this page', log.every(r => r.method === 'GET' && !r.write));
    ck('the key is in no page', !KEYS.test(await p.content()) && !KEYS.test(await (await fetch(U + '/ops/ads', { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).text()));
    ck('no page error', p.errs.length === 0, p.errs.join(' | '));
    await p.screenshot({ path: path.join(OUT, 'ads', `ads-account-${PHASE}.png`), fullPage: true });

    console.log('-- who sees it (in a browser)');
    const rbp = await as(cookie('rebecka@example.com')); await rbp.goto(U + '/ops/ads');
    await rbp.waitForSelector('section[aria-label="In your Meta account"]');
    ck('Rebecka (Ads role) sees the section and the list', await rbp.locator('.acct-table tbody tr').first().waitFor().then(() => true) && await rbp.locator('.acct-table tbody tr').count() === n);
    ck('Rebecka still has no Business place in the sidebar', await rbp.locator('a[href="/ops/business"]').count() === 0);
    for (const [who, email] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']]) {
      const q = await as(cookie(email)); const r = await q.goto(U + '/ops/ads'); await q.waitForTimeout(400);
      ck(`${who}: no Ads page, no section`, !/In your Meta account/.test(await q.content()) && await q.locator('a[href="/ops/ads"]').count() === 0, q.url());
    }

    console.log('-- phone width (390px)');
    const m = await as(DIRECTOR, { width: 390, height: 844 });
    await m.goto(U + '/ops/ads'); await m.waitForSelector('.acct-table tbody tr');
    const r = await m.evaluate(() => {
      const s = document.querySelector('section[aria-label="In your Meta account"]'), sc = s.querySelector('.ads-scroll');
      const small = [...s.querySelectorAll('button, a.acct-open, a.ads-pill')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5 && !e.matches('a.ads-pill')).map(e => (e.innerText || '').slice(0, 20));
      return { over: document.documentElement.scrollWidth - innerWidth, scrolls: sc.scrollWidth > sc.clientWidth + 20, panelFits: s.getBoundingClientRect().right <= innerWidth + 1, small };
    });
    ck('no sideways scroll on the page', r.over <= 1, `${r.over}px`);
    ck('the table scrolls inside its panel', r.scrolls && r.panelFits);
    ck('buttons and links are 44px tall', r.small.length === 0, r.small.join(', '));
    ck('no page error at phone width', m.errs.length === 0, m.errs.join(' | '));
    await m.screenshot({ path: path.join(OUT, 'ads', `ads-account-${PHASE}-phone.png`), fullPage: true });
  }
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
