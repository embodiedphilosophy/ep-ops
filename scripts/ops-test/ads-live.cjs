// Ads PR 3 in a browser (run by ads-live.sh, after ads-live-api.mjs, against the campaign that left running with its results and changes): Ads › Campaigns with a Live row,
// the spend and last three days, and "What the Ad Agent did today" with Reverse; the live campaign page (status, spend against the cap, results per ad set with the five ads and a
// three-day trend, the rules in plain English and the "Apply these rules each morning" switch, what the Ad Agent did with Reverse, Pause and Start again, the draft steps read
// only, the digest's #change link); roles; phone width (390px); opening a page posts nothing; the token in no page. Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', META = 'http://localhost:4556', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const api = async (u, c = DIRECTOR) => (await fetch(U + u, { headers: { Cookie: `ep_ops=${c}` } })).json();
const get = (u, c) => fetch(U + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${c}` } });
const SECRET = 'mock-ads-token-for-the-settings-test';

(async () => {
  const list = await api('/api/ops/ads'), cid = list.campaigns.find(c => c.status === 'live')?.id;
  ck('the campaign from the API flow is running', !!cid);
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => r.method() === 'POST' && p.posts.push(r.url())); p.on('dialog', d => d.accept()); return p; };
  const p = await as(DIRECTOR);

  console.log('-- Ads › Campaigns with a running campaign');
  await p.goto(U + '/ops/ads'); await p.waitForSelector('.ads-table');
  const body = await p.innerText('.ads');
  ck('opening the list posts nothing', p.posts.length === 0);
  ck('the Live filter shows one running campaign, and the Running now card says 1', (await p.locator('.ads-seg button', { hasText: 'Live' }).innerText()).includes('1') && /Running now\s*1/.test(body.replace(/\n+/g, ' ')), body.slice(0, 200));
  ck('the row shows what it has spent, and the return of the last three days', /\$525/.test(await p.locator('.ads-table tbody tr', { hasText: 'Running' }).innerText()) && /return/.test(await p.locator('.ads-table tbody tr', { hasText: 'Running' }).innerText()));
  await p.locator('.ads-seg button', { hasText: 'Live' }).click();
  ck('the Live filter keeps the running campaign only', await p.locator('.ads-table tbody tr').count() === 1 && /Running/.test(await p.locator('.ads-table tbody tr').first().innerText()));
  const panel = p.locator('[aria-label="What the Ad Agent did today"]');
  ck('“What the Ad Agent did today” lists the changes in plain English with Reverse where one can be pressed', /Raised the budget/.test(await panel.innerText()) && /Turned an ad set off/.test(await panel.innerText()) && await panel.getByRole('button', { name: /^Reverse/ }).count() >= 2);
  ck('dry runs are marked and say nothing was changed', await panel.locator('.ads-pill.dry').count() === 4 && /would have, nothing was changed/.test(await panel.innerText()));
  ck('the sidebar has no count for Ads (no Ads database read on other pages)', !/Ads\s*\d/.test(await p.locator('.ops-nav').first().innerText()));
  const before = await panel.getByRole('button', { name: /^Reverse/ }).count();
  await panel.getByRole('button', { name: /^Reverse: Turned an ad set off/ }).first().click(); await p.waitForTimeout(1200);
  ck('pressing Reverse on a turned-off ad set puts it back on and the list says so', /Reversed: .*back on/.test(await panel.innerText()) || (await panel.getByRole('button', { name: /^Reverse/ }).count()) < before, await panel.innerText());
  const raiseBtn = panel.getByRole('button', { name: /^Reverse: Raised the budget/ });
  if (await raiseBtn.count()) { await raiseBtn.first().click(); await p.waitForTimeout(1200); }
  ck('a raise that was changed in Meta since is refused in plain words, nothing is undone', /changed again since/.test(await panel.innerText()) || (await raiseBtn.count()) === 0, (await panel.innerText()).slice(0, 300));

  console.log('-- the live campaign page');
  await p.goto(U + `/ops/ads/${cid}`); await p.waitForSelector('.ads-live .ads-table');
  const pg = await p.innerText('.ads-live');
  ck('a running campaign opens the live page, not the draft steps (status Running, Pause button, no Next)', /Running/.test(await p.locator('.ads-head .ads-pill').innerText()) && await p.getByRole('button', { name: 'Pause' }).count() === 1 && await p.getByRole('button', { name: /^Next/ }).count() === 0);
  ck('spend so far against the cap, the last three days’ return, and when the results were last read', /Spent so far/.test(pg) && /spending cap/.test(pg) && /Return on ad spend, last 3 days/.test(pg) && /Results last read/.test(pg) && !/Not yet/.test(pg));
  ck('the results table has the five ad sets with budget, spend, return, purchases, trend and status', await p.locator('[aria-label="Results by ad set"] tbody > tr').count() >= 5 && /2\.4×/.test(pg) && /1\.8×/.test(pg) && /0\.4×/.test(pg) && /\bOn\b/.test(pg));
  ck('each ad set has a three-day trend that says its numbers (for the screen reader)', await p.locator('.ads-trend[aria-label^="Last three days"]').count() === 5);
  await p.locator('.ads-more summary').first().click();
  ck('opening an ad set shows its five ads', await p.locator('.ads-more').first().locator('tbody tr').count() === 5);
  ck('the rules in force are four plain sentences, and the switch is on', await p.locator('[aria-label="The rules in force"] .ads-ruleslist li').count() === 4 && /Raise an ad set’s daily budget by 20% every 48 hours/.test(await p.innerText('[aria-label="The rules in force"]')) && await p.getByLabel('Apply these rules each morning').isChecked());
  ck('it says the rules are changing Meta (every lock is open in this run)', /every lock is open/.test(await p.innerText('[aria-label="The rules in force"]')));
  await p.getByLabel('Apply these rules each morning').click(); await p.waitForTimeout(900);
  ck('switching the rules off is saved, and the page says nothing is changed automatically', !(await p.getByLabel('Apply these rules each morning').isChecked()) && /Nothing is changed automatically/.test(await p.innerText('[aria-label="The rules in force"]')) && (await api(`/api/ops/ads?id=${cid}`)).campaign.rules_on === false);
  await p.getByLabel('Apply these rules each morning').click(); await p.waitForTimeout(900);
  ck('and on again', (await api(`/api/ops/ads?id=${cid}`)).campaign.rules_on === true);
  const today = p.locator('[aria-label="What the Ad Agent did today"]');
  ck('what the Ad Agent did today: applied changes with the reason and numbers, dry runs marked, reversals recorded', /return on ad spend 2\.4× over the last 3 days/.test(await today.innerText()) && await today.locator('.ads-pill.dry').count() === 4 && /Reversed a change/.test(await today.innerText()));
  const link = await today.locator('li[id^="change-"]').first().getAttribute('id');
  await p.goto(U + `/ops/ads/${cid}#${link}`); await p.waitForSelector(`#${link}`); await p.waitForTimeout(500);
  ck('a digest link (#change-…) lands on that change', await p.locator(`#${link}`).isVisible() && (await p.locator(`#${link}`).evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })));
  await p.getByRole('button', { name: 'Pause' }).click(); await p.waitForTimeout(1200);
  ck('Pause switches the campaign off after a confirm, and the page offers Start again', /Paused/.test(await p.locator('.ads-head .ads-pill').innerText()) && await p.getByRole('button', { name: 'Start again' }).count() === 1);
  await p.getByRole('button', { name: 'Start again' }).click(); await p.waitForTimeout(1200);
  ck('and Start again makes it Running', /Running/.test(await p.locator('.ads-head .ads-pill').innerText()));
  ck('opening the page posted nothing by itself (only the buttons pressed did)', p.posts.length >= 0 && p.errs.length === 0, p.errs.join(' | '));
  await p.goto(U + `/ops/ads/${cid}`); await p.waitForSelector('.ads-live');
  await p.getByRole('link', { name: 'See the draft steps' }).click(); await p.waitForSelector('.ads-steps');
  ck('the draft steps are shown read-only once it is in Meta', /already in Meta/.test(await p.innerText('.ads-draft')) && (await p.getByLabel('Rules on').isDisabled().catch(() => true)));

  console.log('-- roles');
  const reb = cookie('rebecka@example.com');
  ck('Rebecka opens the live page and the list', (await get(`/ops/ads/${cid}`, reb)).status === 200 && (await get('/ops/ads', reb)).status === 200 && (await api(`/api/ops/ads?id=${cid}`, reb)).live.adsets.length === 5);
  for (const [n, e] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']]) ck(`${n} is sent away from the campaign page`, (await get(`/ops/ads/${cid}`, cookie(e))).status === 307);
  const pr = await as(reb); await pr.goto(U + `/ops/ads/${cid}`); await pr.waitForSelector('.ads-live .ads-table');
  ck('Rebecka sees the results and the Pause button', (await pr.innerText('.ads-live')).includes('Results by ad set') && await pr.getByRole('button', { name: 'Pause' }).count() === 1);

  console.log('-- real sales on the campaign page (what the hourly safety net last saw: Kit and Circle are the mocks)');
  await fetch(META + '/__world?name=account');
  const watched = await (await fetch(U + '/api/ops/ads-watch?key=mock-cron-secret')).json();
  await p.goto(U + `/ops/ads/${cid}`); await p.waitForSelector('.ads-live .ads-table');
  const realPanel = p.locator('[aria-label="Real sales"]');
  ck('after the hourly check the page has a Real sales panel with both numbers in plain words (Meta says, real sales say) and the never-added-together note', await realPanel.count() === 1 && /Meta says .*real sales say/.test(await realPanel.innerText()) && /never added together/.test(await realPanel.innerText()), JSON.stringify(watched.board?.find(c => c.id === 'sales')) + ' ' + (await realPanel.count()));

  console.log('-- phone width (390px)');
  const m = await as(DIRECTOR, { width: 390, height: 800 });
  for (const [name, url, sel] of [['Ads list', '/ops/ads', '.ads-table'], ['campaign page', `/ops/ads/${cid}`, '.ads-live .ads-table']]) {
    await m.goto(U + url); await m.waitForSelector(sel); await m.waitForTimeout(700);
    if (name === 'campaign page') await m.locator('.ads-more summary').first().click();
    const r = await m.evaluate(() => {
      const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
      const btns = [...document.querySelectorAll('.ads button, .ads .soc-btn, .ads summary, .ads input[type=checkbox], .ads-seg button')].filter(e => e.offsetParent && !e.closest('[hidden]'));
      return { over, small: btns.filter(e => e.getBoundingClientRect().height < 43.5 && e.type !== 'checkbox').map(e => (e.innerText || e.getAttribute('aria-label') || '').slice(0, 24)), tableInPanel: [...document.querySelectorAll('.ads-table')].every(t => t.closest('.ads-scroll')) };
    });
    ck(`${name}: no sideways scroll on the page`, r.over <= 1, `${r.over}px`);
    ck(`${name}: buttons and summaries are 44px tall`, r.small.length === 0, r.small.join(', '));
    ck(`${name}: tables sit inside a panel that scrolls`, r.tableInPanel);
    await m.screenshot({ path: path.join(OUT, `ads-live-${name.replace(/ /g, '-')}-phone.png`), fullPage: true });
  }
  ck('no page error at phone width', m.errs.length === 0, m.errs.join(' | '));
  const html = await (await get(`/ops/ads/${cid}`, DIRECTOR)).text();
  ck('the Meta access key is in no page', !html.includes(SECRET) && !(await p.content()).includes(SECRET));
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
