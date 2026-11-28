// Ads PR 4 in a browser (run by ads-library.sh). `a`: after ads-library-api.mjs a (the Practice Report NOT connected; a library of five audiences from three campaigns: two Proven, two
// Retired, one Not tested; one draft left to swap into). `b`: after ads-library-api.mjs b (the Practice Report connected to a synthetic quiz).
// a: the Audience library tab, standing pills, filters (standing, tag, search, plain empty states), opening an audience (its result in every campaign, what it buys, the settings, the
//    Practice Report "not connected" part), editing tags, Bring back (with a confirm), "Use in a campaign" (the draft picker, the ad set, a Retired audience needs the warning ticked, no
//    draft → a pointer to Launch), the Settings section for the thresholds and the job in Systems and jobs, roles, phone width (390px), opening a page posts nothing, no Ads read on other
//    pages, the key in no page.  b: the ideas with their counts, the archetype overlap, no personal value on any page, phone width. Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'a';
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const api = async (u, c = DIRECTOR) => (await fetch(U + u, { headers: { Cookie: `ep_ops=${c}` } })).json();
const get = (u, c) => fetch(U + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${c}` } });
const SECRET = 'mock-ads-token-for-the-settings-test', PERSON = /Synthetic Person|synthetic\.person|example\.invalid/;

(async () => {
  const lib = await api('/api/ops/ads-library'), rows = lib.rows;
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.reqs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => { p.reqs.push(r.url()); if (r.method() === 'POST') p.posts.push(r.url()); }); p.on('dialog', d => d.accept()); return p; };
  const p = await as(DIRECTOR);

  if (PHASE === 'a') {
    console.log('-- the Audience library tab');
    await p.goto(U + '/ops/ads?view=library'); await p.waitForSelector('.ads-table');
    const tabs = await p.locator('nav[aria-label="ads views"] a').allInnerTexts();
    ck('the Ads place has Campaigns, Audience library, Safety net and Audience insights tabs, the library one current', tabs.join() === 'Campaigns,Audience library,Safety net,Audience insights' && (await p.locator('nav[aria-label="ads views"] a[aria-current=page]').innerText()) === 'Audience library', tabs.join());
    ck('opening the library posts nothing', p.posts.length === 0);
    const kpi = (await p.innerText('.ads-kpis')).replace(/\n+/g, ' ');
    ck('the four cards count Proven 2, Promising 0, Not tested 2, Retired 1 (the other weak one was brought back by the API flow)', /Proven\s*2/.test(kpi) && /Promising\s*0/.test(kpi) && /Not tested\s*2/.test(kpi) && /Retired\s*1/.test(kpi), kpi);
    ck('five rows: Proven first, then Not tested, Retired last, each with a standing pill', await p.locator('.ads-table tbody tr').count() === 5 && (await p.locator('.ads-table tbody tr .ads-pill').allInnerTexts()).join() === 'Proven,Proven,Not tested,Not tested,Retired', (await p.locator('.ads-table tbody tr .ads-pill').allInnerTexts()).join());
    const first = p.locator('.ads-table tbody tr').first();
    ck('a Proven row shows 3 campaigns, its best result and its tags', /\b3\b/.test(await first.innerText()) && /2\.4× return/.test(await first.innerText()) && /kali/.test(await first.innerText()), await first.innerText());
    ck('the standing pill explains itself on hover (title)', /at or above target in 2 or more campaigns/.test(await first.locator('.ads-pill').getAttribute('title')));
    await p.locator('.ads-seg button', { hasText: 'Retired' }).click();
    ck('the Retired filter shows the retired audience', await p.locator('.ads-table tbody tr').count() === 1 && /Retired\s*1/.test(await p.locator('.ads-seg button', { hasText: 'Retired' }).innerText()));
    await p.locator('.ads-seg button', { hasText: 'Proven' }).click();
    ck('the Proven filter shows two', await p.locator('.ads-table tbody tr').count() === 2);
    await p.locator('.ads-seg button', { hasText: /^All/ }).click();
    await p.locator('select').selectOption('kali');
    ck('the tag filter (kali) keeps all five; a tag nobody has is not offered', await p.locator('.ads-table tbody tr').count() === 5 && !(await p.locator('select option').allInnerTexts()).includes('cooking'));
    await p.locator('select').selectOption('');
    const name1 = (await first.locator('.ads-name').innerText());
    await p.locator('input[type=search]').fill(name1.replace('Interests · ', '').slice(0, 5));
    ck('search narrows the list by name', await p.locator('.ads-table tbody tr').count() === 1 && (await p.locator('.ads-table tbody tr .ads-name').innerText()) === name1);
    await p.locator('input[type=search]').fill('zzzzzz');
    ck('a search with no match says so in plain words and how to clear it', /No audience matches that/.test(await p.innerText('[aria-label=Audiences]')) && await p.locator('.ads-table').count() === 0);
    await p.locator('input[type=search]').fill('');
    ck('“New audience ideas” says the Practice Report isn’t connected, and what to add in Vercel', /Practice Report isn’t connected yet/.test(await p.innerText('[aria-label="New audience ideas"]')) && /REPORT_DATABASE_URL/.test(await p.innerText('[aria-label="New audience ideas"]')));
    ck('and the top of the page says so with what to do, and that everything else works', /isn’t connected yet/.test(await p.locator('.ads-mode').first().innerText()) && /Everything else here still works/.test(await p.locator('.ads-mode').first().innerText()));
    ck('“How standing works” states the thresholds from Settings', /at least \$40 over 3 days/.test(await p.innerText('[aria-label="How standing works"]')) && /Retired: below the floor 3 times/.test(await p.innerText('[aria-label="How standing works"]')));

    console.log('-- one audience');
    await p.locator('.ads-table tbody tr').first().locator('.ads-name').click(); await p.waitForSelector('[aria-label="Its result in every campaign"] table');
    ck('the address keeps the audience (?audience=), so it can be linked', /audience=aud_/.test(p.url()));
    ck('its result in each of the three campaigns, with the value and its own target and floor', await p.locator('[aria-label="Its result in every campaign"] tbody tr').count() === 3 && /2\.4×/.test(await p.innerText('[aria-label="Its result in every campaign"]')) && /target 1\.5×, floor 1\.2×/.test(await p.innerText('[aria-label="Its result in every campaign"]')) && /At or above target/.test(await p.innerText('[aria-label="Its result in every campaign"]')));
    ck('each campaign name links to the campaign', (await p.locator('[aria-label="Its result in every campaign"] a.ads-name').first().getAttribute('href')).startsWith('/ops/ads/cmp_'));
    const buys = await p.innerText('[aria-label="What it does and doesn’t buy"]');
    ck('“what it does and doesn’t buy” says it in plain words, from the numbers and the tags', /met its target in 3 of 3 judged campaigns/.test(buys) && /Tagged for: kali/.test(buys), buys);
    ck('the quiz part says the Practice Report isn’t connected (nothing guessed)', /isn’t connected yet/.test(await p.innerText('[aria-label="Quiz archetypes it overlaps with"]')));
    await p.locator('.ads-more summary').click();
    ck('its exact Meta settings can be opened (ages, countries, the interest)', /"age_min": 25/.test(await p.innerText('.ads-json')) && /"countries"/.test(await p.innerText('.ads-json')) && /"flexible_spec"/.test(await p.innerText('.ads-json')));
    await p.fill('[aria-label="Tags: the course types and topics it buys (separated by commas)"], .ads-inline input:not([type])', 'kali, tantra, Wisdom School');
    await p.getByRole('button', { name: 'Save tags' }).click(); await p.waitForSelector('text=Tags saved.'); await p.waitForTimeout(700);
    ck('tags are edited by a person and shown after saving', /Tagged for: kali, tantra, wisdom school/.test(await p.innerText('[aria-label="What it does and doesn’t buy"]')) && JSON.stringify((await api('/api/ops/ads-library')).rows.find(r => r.name === name1).tags) === JSON.stringify(['kali', 'tantra', 'wisdom school']));
    await p.fill('.ads-inline input:not([type])', '<b>');
    await p.getByRole('button', { name: 'Save tags' }).click(); await p.waitForSelector('[role=alert]:has-text("short word")'); await p.waitForTimeout(300);
    ck('a bad tag is refused in plain words', /short word or two/.test(await p.locator('[role=alert]').first().innerText()));

    console.log('-- Use in a campaign');
    const drafts = (await api('/api/ops/ads-library?drafts=1')).drafts;
    ck('one draft is waiting (left by the API flow)', drafts.length === 1 && drafts[0].slots.length === 5);
    await p.getByRole('button', { name: 'Use in a campaign' }).first().click(); await p.waitForSelector('[aria-label="Use in a campaign"] select');
    const sw = p.locator('[aria-label="Use in a campaign"] select');
    ck('the picker offers the draft (marked as mine), then its five ad sets', (await sw.first().innerText()).includes(drafts[0].name) && /\(yours\)/.test(await sw.first().innerText()));
    ck('the swap button is off until a draft and an ad set are chosen', await p.getByRole('button', { name: 'Swap it in' }).isDisabled());
    await sw.first().selectOption(drafts[0].id); await sw.nth(1).selectOption({ index: 3 });
    const slotText = await sw.nth(1).locator('option:checked').innerText();
    await p.getByRole('button', { name: 'Swap it in' }).click(); await p.waitForSelector('text=is now in the draft');
    const after = await api(`/api/ops/ads?id=${drafts[0].id}`);
    ck('the audience is swapped into the chosen ad set of the draft, and nothing else changed', after.adsets[2].audience_name === name1 && new Set(after.adsets.map(a => a.audience_name)).size >= 4 && /Ad set 3/.test(slotText), after.adsets.map(a => a.audience_name).join(' | '));
    await p.goto(U + `/ops/ads/${drafts[0].id}`); await p.waitForSelector('.ads-sets');
    ck('the draft page shows it in ad set 3', /Interests/.test(await p.locator('.ads-sets li').nth(2).innerText()) && (await p.locator('.ads-sets li').nth(2).innerText()).includes(name1));
    // a Retired audience
    await p.goto(U + `/ops/ads?view=library&audience=${rows.find(r => r.standing === 'Retired').id}`); await p.waitForSelector('[aria-label="Its result in every campaign"] table');
    ck('a Retired audience offers Bring back and says it is Retired and why', await p.getByRole('button', { name: 'Bring back' }).count() === 1 && /Retired/.test(await p.locator('.ads-head').innerText()) && /new campaigns don’t suggest it/.test(await p.innerText('[aria-label="What it does and doesn’t buy"]')));
    await p.getByRole('button', { name: 'Use in a campaign' }).first().click(); await p.waitForSelector('[aria-label="Use in a campaign"] select');
    const sw2 = p.locator('[aria-label="Use in a campaign"] select'); await sw2.first().selectOption(drafts[0].id); await sw2.nth(1).selectOption({ index: 5 });
    ck('picking a Retired one by hand shows a plain warning and the swap stays off until it is ticked', /was retired: it fell below the floor 3 times/.test(await p.innerText('[aria-label="Use in a campaign"]')) && await p.getByRole('button', { name: 'Swap it in' }).isDisabled());
    await p.locator('[aria-label="Use in a campaign"] input[type=checkbox]').check();
    ck('once ticked it can go in', await p.getByRole('button', { name: 'Swap it in' }).isEnabled());
    await p.getByRole('button', { name: 'Cancel' }).click();
    // no draft at all → a pointer to Launch (answered as if there were none)
    await p.route('**/api/ops/ads-library?drafts=1', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ drafts: [] }) }));
    await p.getByRole('button', { name: 'Use in a campaign' }).first().click(); await p.waitForSelector('text=no draft campaign');
    ck('with no draft it says so and points to the Launch tab’s ads switch', /no draft campaign to put it in/.test(await p.innerText('[aria-label="Use in a campaign"]')) && (await p.locator('[aria-label="Use in a campaign"] a').first().getAttribute('href')) === '/ops/programs' && /Run Meta ads for this launch/.test(await p.innerText('[aria-label="Use in a campaign"]')));
    await p.unroute('**/api/ops/ads-library?drafts=1');

    console.log('-- Bring back');
    await p.getByRole('button', { name: 'Bring back' }).click(); await p.waitForSelector('text=is back in the library');
    ck('Bring back (after the confirm) puts it back and records who and when', /is back in the library as Not tested/.test(await p.innerText('.ads-detail')) && /Brought back by .+ on /.test(await p.innerText('.ads-head')) && await p.getByRole('button', { name: 'Bring back' }).count() === 0);
    await p.locator('.crumb button').click(); await p.waitForSelector('.ads-table');
    ck('the list now has none Retired and the brought-back ones as Not tested with a note', /Retired\s*0/.test(await p.innerText('.ads-kpis')) && /Brought back by/.test(await p.innerText('.ads-table')));

    console.log('-- Settings');
    await p.goto(U + '/ops/settings?view=connections&s=ads-library'); await p.waitForSelector('.ads-set input');
    ck('the section is in Connections and jobs, with the five thresholds at their starting values', await p.locator('.ads-set input').count() === 5 && (await p.locator('.ads-set input').evaluateAll(l => l.map(i => i.value))).join() === '2,1,3,40,3');
    await p.fill('[aria-label="Times below the floor to retire"]', '4'); await p.getByRole('button', { name: 'Save' }).click(); await p.waitForSelector('text=Saved.');
    ck('a director saves a threshold: it says so, and it is kept', (await api('/api/ops/ads-library?settings=1')).values.retire_after === 4);
    await p.fill('[aria-label="Times below the floor to retire"]', '0'); await p.getByRole('button', { name: 'Save' }).click(); await p.waitForSelector('[role=alert]:has-text("whole number")');
    ck('a nonsense value is refused in plain words', /whole number/.test(await p.locator('[role=alert]').first().innerText()));
    await p.fill('[aria-label="Times below the floor to retire"]', '3'); await p.getByRole('button', { name: 'Save' }).click(); await p.waitForSelector('text=Saved.');
    ck('and put back', (await api('/api/ops/ads-library?settings=1')).values.retire_after === 3);
    await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('.ops-conn');
    ck('Systems and jobs lists the daily Audience library job, as read-only, with its time', /Audience library/.test(await p.innerText('[aria-label="Scheduled jobs"]')) && /Every day at 11:15 UTC/.test(await p.innerText('[aria-label="Scheduled jobs"]')) && /It only reads; it never changes anything in Meta/.test(await p.innerText('[aria-label="Scheduled jobs"]')) && /Jobs that run on their own\s*12/.test((await p.innerText('[aria-label="Scheduled jobs"]')).replace(/\n+/g, ' ')));

    console.log('-- roles');
    const rb = await as(cookie('rebecka@example.com'));
    await rb.goto(U + '/ops/ads?view=library'); await rb.waitForSelector('.ads-table');
    ck('Rebecka sees the Audience library (tab and rows) and may use it', await rb.locator('.ads-table tbody tr').count() === 5 && /Audience library/.test(await rb.locator('nav[aria-label="ads views"]').innerText()));
    for (const [who, email] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']]) {
      const r = await get('/ops/ads?view=library', cookie(email));
      ck(`${who} does not get the library page`, r.status !== 200);
    }
    const ft = await as(cookie('floss@example.com')); await ft.goto(U + '/ops'); await ft.waitForTimeout(800);
    ck('and Ads is not in their sidebar', !/\bAds\b/.test(await ft.locator('.ops-nav').first().innerText()));
    ck('Today and Programs make no Ads request at all (no Ads database read on other pages)', await (async () => { const q = await as(DIRECTOR); await q.goto(U + '/ops'); await q.waitForTimeout(800); await q.goto(U + '/ops/programs'); await q.waitForTimeout(800); return !q.reqs.some(u => /\/api\/ops\/ads/.test(u)); })());

    console.log('-- phone width (390px)');
    const m = await as(DIRECTOR, { width: 390, height: 800 });
    for (const [name, url, sel] of [['library', '/ops/ads?view=library', '.ads-table'], ['one audience', `/ops/ads?view=library&audience=${rows[0].id}`, '[aria-label="Its result in every campaign"] table'], ['settings', '/ops/settings?view=connections&s=ads-library', '.ads-set input']]) {
      await m.goto(U + url); await m.waitForSelector(sel); await m.waitForTimeout(600);
      if (name === 'one audience') { await m.getByRole('button', { name: 'Use in a campaign' }).first().click(); await m.waitForSelector('[aria-label="Use in a campaign"] select'); }
      const r = await m.evaluate(() => {
        const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
        const btns = [...document.querySelectorAll('.ads button, .ads .soc-btn, .ads summary, .ads select, .ads input:not([type=checkbox])')].filter(e => e.offsetParent && !e.closest('[hidden]'));
        return { over, small: btns.filter(e => e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.getAttribute('aria-label') || e.tagName).slice(0, 24)), tableInPanel: [...document.querySelectorAll('.ads-table')].every(t => t.closest('.ads-scroll')) };
      });
      ck(`${name}: no sideways scroll on the page`, r.over <= 1, `${r.over}px`);
      ck(`${name}: buttons, selects and inputs are 44px tall`, r.small.length === 0, r.small.join(', '));
      ck(`${name}: tables sit inside a panel that scrolls`, r.tableInPanel);
      await m.screenshot({ path: path.join(OUT, `ads-library-${name.replace(/ /g, '-')}-phone.png`), fullPage: true });
    }
    ck('no page error at phone width or on desktop', m.errs.length === 0 && p.errs.length === 0, m.errs.concat(p.errs).join(' | '));
    ck('the Meta access key is in no page', !(await (await get('/ops/ads?view=library', DIRECTOR)).text()).includes(SECRET) && !(await p.content()).includes(SECRET));
  } else {
    console.log('-- the Practice Report connected');
    await p.goto(U + '/ops/ads?view=library'); await p.waitForSelector('.ads-table');
    const ideas = await p.innerText('[aria-label="New audience ideas"]');
    ck('“New audience ideas” are plain sentences with the count behind each', /A lookalike of people who got “The Contemplative” \(30 people\)/.test(ideas) && (await p.locator('.ads-ideas li').count()) === 3, ideas);
    ck('they say they are anonymous counts, from where, and that nothing goes to Meta from here', /anonymous counts/i.test(ideas) && /Counted from 60 quiz results since/.test(ideas) && /no names, emails or quiz answers go to Meta/.test(ideas) && /separate decision/.test(ideas));
    ck('no “not connected” banner is shown', await p.locator('.ads-mode').count() === 0);
    await p.locator('.ads-table tbody tr').first().locator('.ads-name').click(); await p.waitForSelector('[aria-label="Quiz archetypes it overlaps with"]');
    await p.waitForSelector('[aria-label="Quiz archetypes it overlaps with"] li');
    const ov = await p.innerText('[aria-label="Quiz archetypes it overlaps with"]');
    ck('its detail lists the quiz archetypes of the 20 people who arrived from its campaign, with counts and shares, labelled with where they came from', /The Contemplative/.test(ov) && /\d+ · \d+%/.test(ov) && /20 quiz takers who arrived from the campaigns this audience ran in/.test(ov) && /Practice Report/.test(ov) && /name the campaign, not the ad set/.test(ov), ov);
    const all = [await p.content(), await p.innerText('body')];
    for (const u of ['/ops/ads?view=library', '/ops/settings?view=connections&s=ads-library', '/ops/ads']) all.push(await (await get(u, DIRECTOR)).text());
    ck('no name or email from the quiz is on any page', !all.some(t => PERSON.test(t)));
    const m = await as(DIRECTOR, { width: 390, height: 800 });
    await m.goto(U + '/ops/ads?view=library'); await m.waitForSelector('.ads-ideas'); await m.waitForTimeout(500);
    const r = await m.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    ck('the ideas at phone width: no sideways scroll', r.over <= 1, `${r.over}px`);
    await m.screenshot({ path: path.join(OUT, 'ads-library-ideas-phone.png'), fullPage: true });
    ck('no page error', p.errs.length === 0 && m.errs.length === 0, p.errs.join(' | '));
  }
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
