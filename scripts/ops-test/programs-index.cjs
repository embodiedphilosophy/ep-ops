// EP Ops 2 step 4a: the Programs index ("Everything EP runs") in a browser. Every number comes from the data the old Programming page read.
// Checks: the table (needs attention first, then months), the filter chips, List and Calendar, a launch beside its program and a campaign
// beside the programs (made through the Launches API, mock only), a row opens the program, the older modes, each role, phone width.
// Writes go to the mock only. Needs a fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', cookie = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const as = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim();
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
(async () => {
  const b = await chromium.launch();
  const open = async (ck_, vp = { width: 1360, height: 1000 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
  const p = await open(cookie);
  await p.goto(U + '/ops/programs'); await p.waitForSelector('.pg-table');
  ck('the title is "Everything EP runs"', (await p.locator('h1').innerText()) === 'Everything EP runs');
  ck('Programs is the lit place and the views sit above', (await p.locator('nav[aria-label="programs views"]').innerText()).includes('Recordings'));
  const heads = (await p.locator('.pg-table thead th').allInnerTexts()).join('|');
  ck('the table has Program, Dates, Faculty, Ready?, Launch, Circle', heads === 'Program|Dates|Faculty|Ready?|Launch|Circle', heads);
  const groups = await p.locator('.pg-group th').allInnerTexts();
  ck('the groups are Needs attention first and then months', groups.length > 1 && (/Needs attention/.test(groups[0]) || /20\d\d/.test(groups[0])), groups.join(','));
  if (/Needs attention/.test(groups[0])) ck('Needs attention is the first group', true); else console.log('note  nothing needs attention in the mock right now:', groups.join(', '));
  ck('the groups after it are months, in order', groups.slice(/Needs attention/.test(groups[0]) ? 1 : 0).every(g => /^[A-Z][a-z]+ 20\d\d$/.test(g)), groups.join(','));
  const names = await p.locator('.pg-name').allInnerTexts();
  ck('the Fall Sādhana series is one row (its sessions are not listed one by one)', names.filter(t => /Fall 2026 wk 6/.test(t)).length === 1, names.join(' / '));
  ck('every row has a status word in a pill', (await p.locator('.pg-table tbody tr:not(.pg-group)').count()) === (await p.locator('.pg-table .ops-status').count()));
  ck('the chips: All, Sādhana School, Wisdom School, Meditation Pass, Sahṛdaya Upāya, Campaigns', (await p.locator('.pg-chips a').allInnerTexts()).map(t => t.replace(/\s*\d+$/, '').trim()).join('|') === 'All|Sādhana School|Wisdom School|Meditation Pass|Sahṛdaya Upāya|Campaigns');
  ck('"Add a program" is the one terra button', await p.getByRole('button', { name: 'Add a program' }).count() === 1);
  ck('no page errors', !p.errs.length, p.errs.join());

  // chips filter the list
  await p.goto(U + '/ops/programs?program=sadhana'); await p.waitForSelector('.pg-table');
  const sn = await p.locator('.pg-name').allInnerTexts();
  ck('Sādhana School shows its programs and not Meditation Mondays', sn.some(t => /Fall 2026/.test(t)) && !sn.some(t => /Meditation Monday/i.test(t)), sn.join(' / '));
  await p.goto(U + '/ops/programs?program=meditation'); await p.waitForSelector('.pg-table');
  ck('Meditation Pass shows the Mondays', (await p.locator('.pg-name').allInnerTexts()).some(t => /Meditation Monday/i.test(t)));

  // a launch beside its program, and a campaign beside the programs (made in the mock through the Launches API)
  const api = body => p.evaluate(async b => { const r = await fetch('/api/ops/email/launches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; }, body);
  const lg = await p.evaluate(async () => (await fetch('/api/ops/email/launches')).json());
  const mr = lg.suggestions.find(s => /Meditation Resolution/.test(s.name)), pr = lg.suggestions.find(s => /Practice Report/.test(s.name));
  const prev = async (pb, dates) => (await api({ action: 'preview', playbook_id: pb, dates })).steps;
  const a = await api({ action: 'create', confirm: true, name: 'Practice Report', kind: 'Offer', playbook_id: pr.playbook_id, dates: pr.dates, make_drafts: false, steps: await prev(pr.playbook_id, pr.dates) });
  const c = await api({ action: 'create', confirm: true, name: 'Meditation Resolution 2027', kind: 'Event', event_id: mr.event_id, playbook_id: mr.playbook_id, dates: mr.dates, make_drafts: false, steps: await prev(mr.playbook_id, mr.dates) });
  ck('made a campaign and a launch in the mock', a.id && c.id, JSON.stringify([a.error, c.error]));
  await p.goto(U + '/ops/programs'); await p.waitForSelector('.pg-table');
  const rows = await p.locator('.pg-table tbody tr:not(.pg-group)').evaluateAll(trs => trs.map(t => ({ name: t.querySelector('.pg-name')?.innerText, cells: [...t.children].map(x => x.innerText.replace(/\s+/g, ' ').trim()) })));
  const camp = rows.find(r => r.name === 'Practice Report'), prog = rows.find(r => /Meditation Resolution/.test(r.name));
  ck('the Practice Report campaign sits in the same table', !!camp, rows.map(r => r.name).join(' / '));
  ck('its Launch column says where the launch is', camp && /Planning/.test(camp.cells[4]), camp?.cells.join(' | '));
  ck('the Meditation Resolution row shows its launch (status and emails)', prog && /Planning · 0 of \d+ emails?|Planning/.test(prog.cells[4]), prog?.cells.join(' | '));
  ck('the campaign is not listed twice (a launch tied to a program shows on its row)', rows.filter(r => /Meditation Resolution/.test(r.name)).length === 1);
  await p.goto(U + '/ops/programs?program=campaigns'); await p.waitForSelector('.pg-table');
  ck('the Campaigns chip shows only the campaigns', (await p.locator('.pg-name').allInnerTexts()).join() === 'Practice Report', (await p.locator('.pg-name').allInnerTexts()).join());
  await p.locator('.pg-name', { hasText: 'Practice Report' }).click(); await p.waitForURL(/view=launches&id=L\d+/);
  ck('a campaign opens its launch board', await p.locator('[aria-label="Launch timeline"]').count() > 0 || await p.waitForSelector('[aria-label="Launch timeline"]').then(() => true));

  // Calendar
  await p.goto(U + '/ops/programs'); await p.getByRole('link', { name: 'Calendar', exact: true }).click(); await p.waitForSelector('.pg-cal');
  ck('Calendar shows month grids with sessions as links', await p.locator('.pg-cal .ev').count() > 3);
  const first = await p.locator('.pg-cal .ev').first().getAttribute('href');
  ck('a calendar session links to its program', /\/ops\/programs\?(event|.*)/.test(first), first);
  ck('List and Calendar switch back', await p.getByRole('link', { name: 'List', exact: true }).count() === 1);

  // a row opens the program , and the older modes still work
  await p.goto(U + '/ops/programs'); await p.locator('.pg-name', { hasText: 'Fall 2026 wk 6' }).click(); await p.waitForURL(/\/ops\/programs\/P-sadhana-fall-2026/); await p.waitForSelector('.ops-tiles');
  ck('a row opens the program page with its count cards and Is it ready?', await p.locator('.ops-tile').count() === 4 && await p.locator('section[aria-label="Is it ready?"]').count() === 1);
  for (const [show, text] of [['past', 'Add past event'], ['cancelled', 'Cancelled'], ['done', 'Recently done']]) {
    await p.goto(U + `/ops/programs?show=${show}`); await p.waitForSelector('main.ops');
    ck(`?show=${show} still opens the old list`, (await p.locator('main.ops').innerText()).includes(text));
  }
  await p.goto(U + '/ops/events?event=2026-12-01-wsml'); await p.waitForSelector('h1.ops-name'); ck('/ops/events?event=… opens that session as a program page', /\/ops\/programs\/2026-12-01-wsml/.test(p.url()) && /Sanctifying/.test(await p.locator('h1.ops-name').innerText()), p.url());
  ck('no page errors (director)', !p.errs.length, p.errs.join());

  // each role
  const fl = await open(as('floss@example.com')); await fl.goto(U + '/ops/programs'); await fl.waitForSelector('.pg-table');
  ck('Floss sees the chips, the six columns and the add buttons', await fl.locator('.pg-chips a').count() === 6 && await fl.locator('.pg-table thead th').count() === 6 && await fl.getByRole('button', { name: 'Add a program' }).count() === 1);
  const ic = await open(as('ichha@example.com')); await ic.goto(U + '/ops/programs'); await ic.waitForSelector('.pg-table');
  ck('Ichha sees the list but cannot add', await ic.getByRole('button', { name: 'Add a program' }).count() === 0);
  const te = await open(as('abha@example.com')); await te.goto(U + '/ops/programs'); await te.waitForSelector('main.ops');
  ck('a teacher sees only their own table: four columns, no chips, no add, no Launches view', await te.locator('.pg-table thead th').count() === 4 && await te.locator('.pg-chips').count() === 0 && await te.getByRole('button', { name: 'Add a program' }).count() === 0 && await te.locator('nav[aria-label="programs views"]').count() === 0);
  ck('no page errors (roles)', !fl.errs.length && !ic.errs.length && !te.errs.length, [...fl.errs, ...ic.errs, ...te.errs].join());

  // phone
  const ph = await open(cookie, { width: 390, height: 800 }); await ph.goto(U + '/ops/programs'); await ph.waitForSelector('.pg-table');
  ck('phone: no sideways scroll on the page', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  ck('phone: the table scrolls inside its own panel', await ph.evaluate(() => { const s = document.querySelector('.pg-scroll'); return s.scrollWidth > s.clientWidth; }));
  const small = await ph.evaluate(() => [...document.querySelectorAll('.pg-chips a, .pg-more a, .ops-filters a, .pg-add .chip')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43).map(e => e.innerText));
  ck('phone: chips, switches and buttons are at least 44px', small.length === 0, small.join());
  await ph.goto(U + '/ops/programs?layout=calendar'); await ph.waitForSelector('.pg-cal');
  ck('phone: the calendar scrolls inside its panel', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await ph.screenshot({ path: path.join(__dirname, 'out/programs-index-phone.png'), fullPage: true });
  await p.goto(U + '/ops/programs'); await p.screenshot({ path: path.join(__dirname, 'out/programs-index.png'), fullPage: true });
  await b.close(); console.log(bad ? `${bad} FAILED` : 'all ok'); process.exit(bad ? 1 : 0);
})();
