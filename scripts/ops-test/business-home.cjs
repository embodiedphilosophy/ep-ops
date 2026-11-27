// EP Ops 2 step 8, Business: Finance (the old Insights, minus the funnel), Payroll (the old Payroll page, each person linked to their record) and
// Audience (the quiz funnel that sat at the bottom of Insights): the tabs by role (director, Payroll role, Floss, a teacher), the older addresses
// (/ops/insights with ?m= and ?f=, /ops/payroll?month=), the funnel as cards once Settings has steps, phone width. Mock only. Needs a fresh run.sh.
// Viewing writes nothing (checked against the mock log); the only writes are the Funnel tab and two rows, made through the Settings API to give
// Audience something to show.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const tabs = async p => (await p.locator('nav[aria-label="business views"] a').allInnerTexts()).join('|');
const cur = p => p.locator('nav[aria-label="business views"] a[aria-current=page]').innerText();
const main = p => p.locator('main.ops').innerText();
const writes = () => (fs.readFileSync(path.join(__dirname, 'out/mock.log'), 'utf8').match(/^.*(WROTE|APPENDED|ADDED TAB|ADDED ROWS|ADDED COLUMNS).*$/gm) || []).length;
(async () => {
  const b = await chromium.launch(); const pages = [];
  const as = async (ck_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); pages.push(p); return p; };
  const w0 = writes();

  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/business'); await p.waitForSelector('.ops-kpis');
  ck('Business opens on Finance for a director', (await p.locator('h1').innerText()) === 'Finance' && (await cur(p)) === 'Finance');
  ck('the director sees Finance, Payroll, Audience', (await tabs(p)) === 'Finance|Payroll|Audience');
  ck('the page says it is for directors', /Business · directors/.test(await p.locator('.ops-eyebrow').first().innerText()));
  ck('Finance: this month’s six figures (revenue, Meta ad spend, return, after ads, operating profit, cash)', await p.locator('.ops-kpis').first().locator('li').count() === 6);
  ck('Finance: year to date, To pay, the goal, programs vs plan, month by month, Meta ad sets', await p.locator('.ops-ytd').count() === 1 && await p.locator('#to-pay').count() === 1 && /after ads/.test(await main(p)) && /Revenue by program vs plan/.test(await main(p)) && /Month by month/.test(await main(p)) && /Meta ad sets/.test(await main(p)));
  ck('Finance: the sections are white panels', await p.locator('.bz-panel').count() >= 5);
  ck('Finance: the funnel has left (it is Audience now)', !/Funnel/.test(await main(p)) && await p.locator('.ops-funnel').count() === 0);
  ck('Finance: month links stay on Finance', await p.locator('nav[aria-label="Month"] a').count() >= 1 && (await p.locator('nav[aria-label="Month"] a').first().getAttribute('href')).startsWith('/ops/business?view=finance&m='));
  const m1 = await p.locator('nav[aria-label="Month"] a').first().getAttribute('href'); await p.goto(U + m1); ck('a month link opens that month', await p.locator('nav[aria-label="Month"] a[aria-current=page]').count() === 1);
  ck('the Revenue & Metrics sheet link is still there', await p.locator('a', { hasText: 'Open the Revenue & Metrics sheet' }).count() === 1);

  await p.goto(U + '/ops/business?view=payroll'); await p.waitForSelector('.pr');
  ck('Payroll tab: the month’s pay (h1 Payroll, month switcher, totals)', (await p.locator('h1').innerText()) === 'Payroll' && (await cur(p)) === 'Payroll' && await p.locator('.pr-month').count() === 1);
  await p.waitForSelector('.pr-sum');
  ck('Payroll: totals by kind and how it is paid', await p.locator('.pr-sum').count() >= 2 && /Total/.test(await p.locator('.pr-sum').first().innerText()));
  ck('Payroll: finalize and send controls are there', await p.locator('.pr-actions').count() === 1);
  const names = p.locator('a.pr-person'); const nn = await names.count();
  if (nn) ck('Payroll: each named person opens their record in People', (await names.first().getAttribute('href')).startsWith('/ops/people/'));
  else console.log('note  no lines with an email for this month in the mock, so the person links were not exercised');
  await p.goto(U + '/ops/business?view=payroll&month=2026-10'); await p.waitForSelector('.pr-month b'); ck('Payroll ?month= opens that month', /October 2026/.test(await p.locator('.pr-month b').innerText()));

  await p.goto(U + '/ops/business?view=audience');
  ck('Audience tab: titled Audience, period chips Last 30 days / Quarter / Year', (await p.locator('h1').innerText()) === 'Audience' && (await p.locator('nav[aria-label="Funnel period"] a').allInnerTexts()).join('|') === 'Last 30 days|Quarter|Year' && (await cur(p)) === 'Audience');
  ck('Audience with no steps points to Settings › Connections and jobs › Funnel', await p.locator('a[href="/ops/settings?view=connections&s=funnel"]').count() === 1 && /No funnel steps yet/.test(await main(p)));
  ck('viewing Finance, Payroll and Audience wrote nothing', writes() === w0);

  // give Audience steps through Settings (mock only): the Funnel tab, then two rows
  const call = (body) => p.evaluate(async b => { const r = await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { ok: r.ok, ...(await r.json().catch(() => ({}))) }; }, body);
  ck('(set-up) the Funnel tab is made in the mock', (await call({ tab: 'funnel', create: true })).ok);
  ck('(set-up) two steps added', (await call({ tab: 'funnel', changes: { step: 'Practice Report quiz', kit_tag: 'Navaratri 2026' }, before: {} })).ok && (await call({ tab: 'funnel', changes: { step: 'Wisdom School', kit_tag: 'Member: Wisdom School' }, before: {} })).ok);
  await p.goto(U + '/ops/business?view=audience'); await p.waitForSelector('.bz-funnel');
  ck('Audience: one card per step, with its count', await p.locator('.bz-funnel li').count() === 2 && /Practice Report quiz/.test(await p.locator('.bz-funnel li').first().innerText()) && /^7$/m.test(await p.locator('.bz-funnel li .v').first().innerText()));
  ck('Audience: the first card says it is the first step, the next says how many of the step before', /The first step/.test(await p.locator('.bz-funnel li').nth(0).innerText()) && /% of the step before/.test(await p.locator('.bz-funnel li').nth(1).innerText()));
  await p.locator('nav[aria-label="Funnel period"] a', { hasText: 'Quarter' }).click(); await p.waitForSelector('.bz-funnel');
  ck('the period chips change the period and stay on Audience', /view=audience&f=90/.test(p.url()) && (await p.locator('nav[aria-label="Funnel period"] a[aria-current=page]').innerText()) === 'Quarter' && /in the quarter/.test(await main(p)));

  // the older addresses
  for (const [u, want] of [['/ops/insights', 'view=finance'], ['/ops/insights?m=2026-10', 'view=finance&m=2026-10'], ['/ops/insights?f=365', 'view=audience'], ['/ops/payroll', 'view=payroll'], ['/ops/payroll?month=2026-10', 'view=payroll&month=2026-10']]) {
    await p.goto(U + u); const got = new URL(p.url());
    ck(`${u} → /ops/business with ${want} (query kept, one place)`, got.pathname === '/ops/business' && [...new URLSearchParams(want)].every(([k, v]) => got.searchParams.get(k) === v));
  }
  await p.goto(U + '/ops/insights?f=365'); ck('/ops/insights?f=365 opens Audience with Year selected', (await cur(p)) === 'Audience' && (await p.locator('nav[aria-label="Funnel period"] a[aria-current=page]').innerText()) === 'Year');
  await p.goto(U + '/ops/business?f=365'); ck('/ops/business?f=365 (the older funnel period address) opens Audience', (await cur(p)) === 'Audience');

  // roles
  const st = await as(cookie('stephanie@example.com')); await st.goto(U + '/ops/business'); await st.waitForSelector('.pr');
  ck('the Payroll role (Stephanie) opens on Payroll, with no other tab to choose', (await st.locator('h1').innerText()) === 'Payroll' && await st.locator('nav[aria-label="business views"]').count() === 0);
  await st.goto(U + '/ops/business?view=finance'); ck('the Payroll role asking for Finance gets Payroll', (await st.locator('h1').innerText()) === 'Payroll' && await st.locator('.ops-kpis').count() === 0);
  await st.goto(U + '/ops/business?view=audience'); ck('the Payroll role asking for Audience gets Payroll', (await st.locator('h1').innerText()) === 'Payroll');
  await st.goto(U + '/ops/insights'); ck('the Payroll role following the old Insights address is not shown it', (await st.locator('h1').innerText()) === 'Payroll' && await st.locator('.ops-kpis').count() === 0);
  const nav = async q => (await q.locator('nav[aria-label="Dashboard"] a').allInnerTexts()).map(x => x.replace(/\d+$/, '').trim()).join('|');
  ck('the Payroll role has Business in the sidebar but not Settings', /Business/.test(await nav(st)) && !/Settings/.test(await nav(st)));
  for (const [who, name] of [['floss@example.com', 'Floss'], ['irene@example.com', 'Irene'], ['ichha@example.com', 'Ichha'], ['carolyn@example.com', 'Carolyn (Social)'], ['rebecka@example.com', 'Rebecka (Social)']]) {
    const q = await as(cookie(who)); await q.goto(U + '/ops/business?view=payroll'); await q.waitForSelector('main.ops');
    ck(`${name} is not shown Business (sent to Today)`, new URL(q.url()).pathname === '/ops' && !/Business/.test(await nav(q)));
  }
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops/business'); ck('a teacher is not shown Business', !new URL(te.url()).pathname.startsWith('/ops/business'));
  await te.goto(U + '/ops/insights'); ck('a teacher following /ops/insights is not shown it either', !/Revenue/.test(await te.locator('body').innerText()));

  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 });
  for (const v of ['finance', 'payroll', 'audience']) {
    await ph.goto(U + `/ops/business?view=${v}`); await ph.waitForSelector(v === 'payroll' ? '.pr-sum' : v === 'audience' ? '.bz-funnel' : '.ops-kpis'); await ph.waitForTimeout(400);
    ck(`phone: no sideways page scroll (${v})`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    ck(`phone: the tabs are 44px tall (${v})`, await ph.evaluate(() => [...document.querySelectorAll('nav[aria-label="business views"] a')].every(a => a.getBoundingClientRect().height >= 43.5)));
    await ph.screenshot({ path: __dirname + `/out/business-${v}-phone.png`, fullPage: true });
  }
  ck('phone: Audience cards are two to a row at most', await ph.evaluate(() => { const l = [...document.querySelectorAll('.bz-funnel li')]; return l.every(x => x.getBoundingClientRect().right <= innerWidth + 1); }));
  ck('phone: the ad sets table scrolls inside its panel', (await (async () => { await ph.goto(U + '/ops/business?view=finance'); await ph.waitForSelector('.ops-adsets'); return ph.evaluate(() => { const w = document.querySelector('.ops-adsets').closest('.ops-table-wrap'); return !!w && getComputedStyle(w).overflowX !== 'visible' && document.documentElement.scrollWidth <= innerWidth + 1; }); })()));
  await p.goto(U + '/ops/business'); await p.screenshot({ path: __dirname + '/out/business-finance-desktop.png', fullPage: true });
  await p.goto(U + '/ops/business?view=audience'); await p.screenshot({ path: __dirname + '/out/business-audience-desktop.png', fullPage: true });
  ck('no page errors', pages.every(x => !x.errs.length));
  await b.close(); process.exit(bad ? 1 : 0);
})();
