// EP Ops 2 step 9, Today (/ops): the count cards, "Waiting on your yes" gathered from every area, this week, "What happened overnight" built from the
// Change Log, each role (director, view-as, Floss, Irene, Ichha, Carolyn, Stephanie, a teacher), the teacher still to onboard going to /teach, old query
// strings, the sheet reads one Today load makes, and phone width. Mock only; reads only (any POST is refused and counted). Needs a fresh run.sh and
// `source env.sh`: the Change Log and Email Plan the page reads are seeded first (today-seed.mjs), before Today is loaded for the first time.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100', M = 'http://localhost:4555'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const main = p => p.locator('main.ops').innerText();
const reads = async reset => (await fetch(`${M}/__reads${reset ? '?reset=1' : ''}`)).json();
(async () => {
  const { seed } = await import('./today-seed.mjs');
  await seed();
  await reads(true);
  const b = await chromium.launch(); const pages = [], posts = [];
  const as = async (ck_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); pages.push(p);
    await p.route('**/*', r => { if (!['GET', 'HEAD'].includes(r.request().method())) { posts.push(r.request().url()); return r.abort(); } return r.continue(); }); return p; };
  const labels = async p => (await p.locator('.td-card .l:first-child').allInnerTexts()).map(s => s.trim());
  const card = (p, l) => p.locator('.td-card', { has: p.locator('.l:first-child', { hasText: l }) }).first();
  const num = async (p, l) => Number((await card(p, l).locator('.n').innerText()).trim());

  // ---------- the director ----------
  const p = await as(DIRECTOR);
  await p.goto(U + '/ops'); await p.waitForSelector('.td-cards');
  ck('Today opens with a greeting and the first name', /^Good (morning|afternoon|evening), Jacob$/.test((await p.locator('h1').innerText()).trim()));
  ck('Today is the current place in the sidebar', (await p.locator('.ops-nav a[aria-current=page]').innerText()).startsWith('Today'));
  const L = await labels(p);
  ck('the director’s cards: Waiting on your yes, Your tasks this week, Late, Students to answer, Programs at risk, Tasks need an owner', L.join('|') === 'Waiting on your yes|Your tasks this week|Late|Students to answer|Programs at risk|Tasks need an owner');
  ck('every card is a link (the whole card)', await p.locator('a.td-card').count() === L.length && (await p.locator('a.td-card').evaluateAll(a => a.every(x => x.getAttribute('href')))));
  ck('each count is a number', (await p.locator('.td-card .n').allInnerTexts()).every(t => /^\d+$/.test(t.trim())));
  ck('the count is in the serif face with lining figures', await p.locator('.td-card .n').first().evaluate(e => /Cormorant/.test(getComputedStyle(e).fontFamily) && /lining-nums/.test(getComputedStyle(e).fontVariantNumeric)));
  ck('Late is terra only when something is late', (await card(p, 'Late').getAttribute('class')).includes('late') === ((await num(p, 'Late')) > 0));
  const badge = Number((await p.locator('.ops-nav a[aria-current=page] .ops-badge').innerText()).trim());
  ck('Your tasks this week plus Late is the number on the sidebar badge', (await num(p, 'Your tasks this week')) + (await num(p, 'Late')) === badge);
  ck('card links: Late → Tasks (late), Students → Support’s reply list, Programs → Programs, owners → Tasks (unowned)',
    (await card(p, 'Late').getAttribute('href')) === '/ops/tasks?show=late' && (await card(p, 'Students to answer').getAttribute('href')) === '/ops/students?view=support&tab=reply'
    && (await card(p, 'Programs at risk').getAttribute('href')) === '/ops/programs' && (await card(p, 'Tasks need an owner').getAttribute('href')) === '/ops/tasks?show=unowned' && (await card(p, 'Your tasks this week').getAttribute('href')) === '/ops/tasks');
  ck('Students to answer counts people with a reply waiting (the Support tab’s own list: 2 in the mock)', (await num(p, 'Students to answer')) === 2);

  // Waiting on your yes: one list, from every area
  const W = p.locator('.td-wait li'); const wtext = (await p.locator('.td-wait').innerText());
  const kinds = (await W.locator('small').allInnerTexts()).map(s => s.split(' · ')[0].trim());
  ck('Waiting on your yes gathers an email, social posts, teacher bios, course pages and a held CE credit', ['Email', 'Social post', 'Teacher bio', 'Course page', 'CE credit'].every(k => kinds.includes(k)));
  ck('the email marked “Ready for Jake” is there, by its subject, and the Draft one is not', /Road to Resolution #1/.test(wtext) && !/Not ready yet/.test(wtext));
  ck('the posts waiting are one line (“10 posts…”), with the networks and the dates', /\d+ posts for the next week/.test(wtext) && /Instagram and Facebook/.test(wtext));
  const href = async t => W.filter({ hasText: t }).locator('a.chip').first().getAttribute('href');
  ck('each line opens where its work is done (Review, the email in Compose, Bios to review, the held CE list)',
    (await href('posts for the next week')) === '/ops/publish?view=review' && /^\/ops\/publish\?view=compose&kind=email&id=EM001$/.test(await href('Road to Resolution')) && (await href('Abha Rajbhandari')) === '/ops/people?view=review' && (await href('held for a look')) === '/ops/students?view=ce&tab=held');
  const total = (await W.locator('b').count());
  ck('the Waiting card counts what the list holds (posts counted one by one)', (await num(p, 'Waiting on your yes')) === Number((await p.locator('.td-wait h2 span').innerText()).trim()) && (await num(p, 'Waiting on your yes')) >= total);
  ck('the Waiting card says what is in it, in words', /\d+ posts?/.test(await card(p, 'Waiting on your yes').innerText()) && /1 email/.test(await card(p, 'Waiting on your yes').innerText()) && /2 bios/.test(await card(p, 'Waiting on your yes').innerText()));
  ck('the Waiting card jumps to the list on the page', (await card(p, 'Waiting on your yes').getAttribute('href')) === '#waiting' && await p.locator('#waiting').count() === 1);

  // This week and Needs you keep working
  ck('This week: Programming and Team meetings, with Join buttons', /Programming this week/.test(await main(p)) && /Team meetings this week/.test(await main(p)) && await p.locator('.ops-meet a.join').count() >= 1);
  ck('Needs you: the task list (with its actions) is still there', await p.locator('#needs-you .ops-group').count() >= 1 && await p.locator('#needs-you [aria-label], #needs-you button').count() >= 1);
  ck('the director’s pinned note, “View as” and + Task are still on Today', await p.locator('.ops-pin').count() === 1 && await p.locator('.ops-view select[name=person]').count() === 1 && /\+ Task/.test(await p.locator('.ops-head').innerText()));
  ck('a link to the next posts’ pictures is still under Needs you', /Social: .*posts/.test(await p.locator('#needs-you').innerText()));

  // What happened overnight: from the Change Log
  const N = p.locator('.td-night li'); const ntext = await p.locator('.td-night').innerText();
  ck('“What happened overnight” lists the automatic jobs and other people, in plain words', await N.count() === 3 && /Zoom sync made 3 changes to E001 \(.+\), E002 \(.+\) and E003 \(.+\)/.test(ntext) && /Instagram sync added 3 from Instagram to post history/.test(ntext) && /Floss changed public title on E004 \(Meditation Mondays\)/.test(ntext));
  ck('each line has a time, oldest first', (await N.locator('.when').allInnerTexts()).every(t => /^(Yesterday )?\d\d:\d\d$/.test(t.trim())) && ntext.indexOf('Zoom sync') < ntext.indexOf('Instagram sync') && ntext.indexOf('Instagram sync') < ntext.indexOf('Floss changed'));
  ck('the director’s own change and a three-day-old line are left out', !/Jacob/.test(ntext) && !/Kit sync/.test(ntext) && !/EM001/.test(ntext));
  ck('a line about one session opens its program page', (await N.filter({ hasText: 'Floss changed' }).locator('a').getAttribute('href')) === '/ops/programs/E004');
  await N.filter({ hasText: 'Floss changed' }).locator('a').click(); await p.waitForLoadState();
  ck('…and it opens', /\/ops\/programs\/P-|\/ops\/programs\/E004|\/ops\/programs\/MM-/.test(p.url()) && await p.locator('h1').count() >= 1);

  // Cards and lines lead somewhere real
  await p.goto(U + '/ops');
  await p.locator('.td-wait li', { hasText: 'posts for the next week' }).locator('a.chip').click(); await p.waitForLoadState();
  ck('“Review” on the posts opens Publish › Review and approve', /\/ops\/publish\?view=review/.test(p.url()) && /Review/.test(await p.locator('h1').innerText()));
  await p.goto(U + '/ops'); await card(p, 'Students to answer').click(); await p.waitForLoadState();
  ck('the Students card opens Support’s “Needs a reply”', /view=support/.test(p.url()) && /Needs a reply/.test(await main(p)));
  await p.goto(U + '/ops'); await card(p, 'Programs at risk').click(); await p.waitForLoadState();
  ck('the Programs card opens Programs', new URL(p.url()).pathname === '/ops/programs');

  // old query strings
  await p.goto(U + '/ops?skip=1'); ck('/ops?skip=1 still opens Today', await p.locator('.td-cards').count() === 1);
  await p.goto(U + '/ops?person=Floss%20Harry'); await p.waitForSelector('.td-cards');
  ck('View as Floss (?person=): “Viewing as”, her name, her cards only', /Viewing as/.test(await p.locator('.ops-eyebrow').innerText()) && (await p.locator('h1').innerText()).trim() === 'Floss Harry' && (await labels(p)).join('|') === 'Your tasks this week|Late'.replace('Your', 'Floss’s'));
  ck('…and none of the director’s lists (Waiting, overnight)', await p.locator('.td-wait').count() === 0 && await p.locator('.td-night').count() === 0);

  // ---------- the sheet reads one Today load makes ----------
  await reads(true);
  for (let i = 0; i < 3; i++) { await p.goto(U + '/ops'); }
  const r = await reads(true), n = x => r.reads.filter(y => y.startsWith(x)).length;
  ck('the Change Log is read in two light reads at most (its length, then its end), not on every load', n('Change Log') <= 2);
  ck('the Email Plan is read at most once across three loads (cached)', n('Email Plan') <= 1);
  ck('no mentee-year sheets are read for Today any more', n('Mentee') === 0);
  console.log('     info: three director loads in a row made', r.total, 'sheet reads in all');

  // ---------- Floss and Irene (events staff) ----------
  for (const who of ['floss', 'irene']) {
    const f = await as(cookie(`${who}@example.com`)); await f.goto(U + '/ops'); await f.waitForSelector('.td-cards');
    const FL = await labels(f);
    ck(`${who}: Waiting, Your tasks, Late, Students to answer (no director cards)`, FL.join('|') === 'Waiting on your yes|Your tasks this week|Late|Students to answer');
    const ft = await f.locator('.td-wait').innerText();
    ck(`${who}: the Waiting list has posts, bios, course pages and CE, but not the director’s email approvals`, /posts for the next week/.test(ft) && /Teacher bio/.test(ft) && /Course page/.test(ft) && /CE credit/.test(ft) && !/Road to Resolution/.test(ft));
    ck(`${who}: no overnight log (directors only)`, await f.locator('.td-night').count() === 0);
    ck(`${who}: + Task and the task list are there`, /\+ Task/.test(await f.locator('.ops-head').innerText()) && await f.locator('#needs-you').count() === 1);
  }

  // ---------- Ichha (Support) ----------
  const ic = await as(cookie('ichha@example.com')); await ic.goto(U + '/ops'); await ic.waitForSelector('.td-cards');
  ck('Ichha: Your tasks, Late and Students to answer (nothing to approve)', (await labels(ic)).join('|') === 'Your tasks this week|Late|Students to answer' && await ic.locator('.td-wait').count() === 0);
  await card(ic, 'Students to answer').click(); await ic.waitForLoadState();
  ck('Ichha’s Students card opens the Support tab', /view=support/.test(ic.url()) && /Needs a reply/.test(await main(ic)));

  // ---------- Carolyn (Publisher) and Rebecka (Social) ----------
  const ca = await as(cookie('carolyn@example.com')); await ca.goto(U + '/ops'); await ca.waitForSelector('.td-cards');
  ck('Carolyn (Publisher): tasks and late only, no approvals, no Students card', (await labels(ca)).join('|') === 'Your tasks this week|Late' && await ca.locator('.td-wait').count() === 0);
  const rb = await as(cookie('rebecka@example.com')); await rb.goto(U + '/ops'); await rb.waitForSelector('.td-cards');
  ck('Rebecka (Social role, may approve posts): Waiting holds the posts only; tasks, late; the posts line under Needs you', (await labels(rb)).join('|') === 'Waiting on your yes|Your tasks this week|Late' && !/Teacher bio|Road to Resolution|CE credit/.test(await rb.locator('.td-wait').innerText()) && /Social: .*posts/.test(await rb.locator('#needs-you').innerText()));

  // ---------- Stephanie (Approver and Payroll) ----------
  const st = await as(cookie('stephanie@example.com')); await st.goto(U + '/ops'); await st.waitForSelector('.td-cards');
  const sw = await st.locator('.td-wait').innerText();
  ck('Stephanie (Approver): Waiting holds the posts to approve, nothing she can’t decide (no bios, no emails)', /posts for the next week/.test(sw) && !/Teacher bio|Road to Resolution|CE credit/.test(sw));
  ck('Stephanie still has Business (Payroll) in the sidebar and Today opens', /Business/.test(await st.locator('.ops-nav').innerText()) && !/Finance/.test(await st.locator('.ops-nav').innerText()));

  // ---------- a teacher ----------
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops?skip=1'); await te.waitForSelector('.td-cards');
  ck('a teacher: their tasks and late only; no Waiting, no overnight, no Students card', (await labels(te)).join('|') === 'Your tasks this week|Late' && await te.locator('.td-wait, .td-night').count() === 0);
  ck('a teacher’s cards link within their own Today (they cannot open Tasks)', (await te.locator('a.td-card').evaluateAll(a => a.map(x => x.getAttribute('href')))).every(h => h === '#needs-you'));
  ck('a teacher sees only Today and Programs in the sidebar', (await te.locator('.ops-nav a').allInnerTexts()).map(s => s.replace(/\d+/g, '').trim()).join('|') === 'Today|Programs');
  ck('“Contacts and your teacher guide →” is still on a teacher’s Today (unchanged: it points at People)', await te.locator('a[href="/ops/people"]', { hasText: 'Contacts and your teacher guide' }).count() === 1);
  ck('a teacher’s This week is theirs', /Programming this week/.test(await main(te)));
  const mary = await as(cookie('mary@example.com')); await mary.goto(U + '/ops'); await mary.waitForLoadState();
  ck('a teacher who still has onboarding to do is sent to /teach', /\/teach/.test(mary.url()));
  await mary.goto(U + '/ops?skip=1'); ck('…unless ?skip=1', new URL(mary.url()).pathname === '/ops');

  // ---------- phone width ----------
  const ph = await as(DIRECTOR, { width: 390, height: 844 }); await ph.goto(U + '/ops'); await ph.waitForSelector('.td-cards');
  ck('phone: no sideways scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  ck('phone: the cards stack two to a row', await ph.locator('.td-cards').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length === 2));
  ck('phone: buttons and links in the lists are at least 44px tall', await ph.locator('.td-wait a.chip, .td-night li a').evaluateAll(a => a.length > 0 && a.every(x => x.getBoundingClientRect().height >= 43.5)));
  ck('phone: every card fits inside the screen', await ph.locator('.td-card').evaluateAll(a => a.every(x => x.getBoundingClientRect().right <= window.innerWidth + 1)));
  const pf = await as(cookie('floss@example.com'), { width: 390, height: 844 }); await pf.goto(U + '/ops'); await pf.waitForSelector('.td-cards');
  ck('phone (Floss): no sideways scroll', await pf.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const pt = await as(cookie('abha@example.com'), { width: 390, height: 844 }); await pt.goto(U + '/ops?skip=1'); await pt.waitForSelector('.td-cards');
  ck('phone (teacher): no sideways scroll', await pt.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  ck('no page errors', pages.every(x => x.errs.length === 0));
  ck('nothing was written (no POST from any page)', posts.length === 0);
  await b.close();
  console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
