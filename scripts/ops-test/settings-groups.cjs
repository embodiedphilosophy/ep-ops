// EP Ops 2 step 8, Settings in four groups (Team and roles, Templates, Website copy, Connections and jobs): the sections of each group, what each
// section shows (the sheet tables, the Social sign-offs, the Student reminder rules, the Social rules, the systems and jobs), the older addresses
// (?t=<table>, ?view=tables|team|social-rules|reminders, /ops/social/team, /ops/social/rules, /ops/email/reminders, /ops/admin?t=), one real save
// through the editor and the website's cache refresh that follows it (the mock logs the call), each role (director, Floss, Irene, a Social role,
// Ichha, the Payroll role, a teacher), phone width. Mock only. Needs a fresh run.sh.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const U = 'http://localhost:3100'; let bad = 0; const ck = (n, c) => { if (!c) { bad++; console.log('FAIL', n); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const groups = async p => (await p.locator('nav[aria-label="settings views"] a').allInnerTexts()).join('|');
const curGroup = p => p.locator('nav[aria-label="settings views"] a[aria-current=page]').innerText();
const sections = async (p, g) => (await p.locator(`nav[aria-label="${g} sections"] a`).allInnerTexts()).join('|');
const curSection = (p, g) => p.locator(`nav[aria-label="${g} sections"] a[aria-current=page]`).innerText();
const main = p => p.locator('main.ops').innerText();
const log = () => fs.readFileSync(path.join(__dirname, 'out/mock.log'), 'utf8');
(async () => {
  const b = await chromium.launch(); const pages = [];
  const as = async (ck_, vp = { width: 1360, height: 900 }) => { const c = await b.newContext({ viewport: vp }); await c.addCookies([{ name: 'ep_ops', value: ck_, url: U }]); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); pages.push(p); return p; };

  const p = await as(DIRECTOR);
  await p.goto(U + '/ops/settings'); await p.waitForSelector('.ops-site-row');
  ck('Settings opens on Templates › Task templates for a director (as All settings did)', (await curGroup(p)) === 'Templates' && (await curSection(p, 'Templates')) === 'Task templates' && await p.locator('.ops-site-row').count() > 3);
  ck('the four groups, in order', (await groups(p)) === 'Team and roles|Templates|Website copy|Connections and jobs');
  ck('Templates: Task templates, Track defaults, Recurring tasks, Agreements, Student reminders, Social rules', (await sections(p, 'Templates')) === 'Task templates|Track defaults|Recurring tasks|Agreements|Student reminders|Social rules');
  ck('Task templates still show “done when” (the ticking rule)', /done when/i.test(await main(p)));
  ck('the title is the group’s name, under Settings', (await p.locator('h1').innerText()) === 'Templates' && /Settings/.test(await p.locator('.ops-eyebrow').first().innerText()));
  await p.goto(U + '/ops/settings?view=templates&s=defaults'); await p.waitForSelector('.ops-site-row'); ck('Track defaults opens by ?s=', (await curSection(p, 'Templates')) === 'Track defaults');
  await p.goto(U + '/ops/settings?view=templates&s=reminders'); await p.waitForSelector('[aria-label="Rules"] li');
  ck('Student reminders: the rules, as the old page showed them (five rules, handled elsewhere)', await p.locator('[aria-label="Rules"] > ul > li').count() === 5 && await p.locator('[aria-label="Handled elsewhere"]').count() === 1 && (await curSection(p, 'Templates')) === 'Student reminders');
  await p.goto(U + '/ops/settings?view=templates&s=social-rules'); await p.waitForSelector('text=Feed posts per week');
  ck('Social rules: the planner’s rules, as the old Rules page showed them (Feed posts per week, Approval deadline)', /Feed posts per week/.test(await main(p)) && /Approval deadline/.test(await main(p)) && (await curSection(p, 'Templates')) === 'Social rules');

  await p.goto(U + '/ops/settings?view=team'); await p.waitForSelector('.ops-setgrid');
  ck('Team and roles: Team, Team links, Social roles and sign-offs (a director opens on Team)', (await sections(p, 'Team and roles')) === 'Team|Team links|Social roles and sign-offs');
  await p.waitForSelector('.ops-site-row'); ck('Team: the Team table, with Jacob in it', /Jacob/.test(await main(p)) && (await curSection(p, 'Team and roles')) === 'Team');
  await p.goto(U + '/ops/settings?view=team&s=signoffs'); await p.waitForSelector('text=Who signs off on what');
  ck('Social roles and sign-offs: who can make, approve and schedule, the sign-offs, the Tuesday check-in', await p.locator('[aria-label="People"] tbody tr').count() >= 3 && /Carolyn Boucher/.test(await main(p)) && await p.locator('[aria-label="Sign-offs"] li').count() === 6 && await p.locator('[aria-label="Tuesday check-in"]').count() === 1);
  await p.goto(U + '/ops/settings?view=team&s=resources'); await p.waitForSelector('.ops-site, .ops-empty'); ck('Team links: the Resources table (or its Create it)', (await curSection(p, 'Team and roles')) === 'Team links');

  await p.goto(U + '/ops/settings?view=website'); await p.waitForSelector('.ops-site-row');
  const web = await sections(p, 'Website copy');
  ck('Website copy: every website table, under the old headings', ['Links & prices', 'Stats', 'Teachers', 'Reading assignments', 'Polls', 'Library items'].every(x => web.includes(x)) && ['Website', 'Sādhana School', 'Sahṛdaya Upāya', 'Library'].every(h => true));
  ck('Website copy: the old group headings are kept', (await p.locator('.ops-setitem .g').allInnerTexts()).join('|') === 'Website|Sādhana School|Sahṛdaya Upāya|Library');
  ck('Website copy opens on Links & prices for a director who asks for the group', (await curSection(p, 'Website copy')) === 'Links & prices');
  ck('no operations table in Website copy (Team, Task templates…)', !/(^|\|)(Team|Task templates|Track defaults|Circle spaces|Funnel steps)/.test(web));

  await p.goto(U + '/ops/settings?view=connections'); await p.waitForSelector('[aria-label="Scheduled jobs"]');
  ck('Connections and jobs: Systems and jobs, Circle spaces, Funnel steps, Ads audience library, Ads safety net', (await sections(p, 'Connections and jobs')) === 'Systems and jobs|Circle spaces|Funnel steps (Kit tags)|Ads audience library|Ads safety net' && (await p.locator('h1').innerText()) === 'Connections and scheduled jobs');
  ck('systems listed (Google Sheets, Circle, Kit, Instagram, Meta ads, Alerts by text and WhatsApp, Zoom, Make, Motion), with no health claimed', await p.locator('[aria-label="Connections"] tbody tr').count() === 9 && /isn’t shown yet/.test(await main(p)));
  const jobs = await p.locator('[aria-label="Scheduled jobs"] tbody tr').allInnerTexts();
  ck('the twelve scheduled jobs (the eight, the ad results sync, the ad rules, the Audience library update and the Ad safety net), read from vercel.json, with plain times', jobs.length === 12 && jobs.some(j => /Ad safety net\s+Every hour, at 25 past/.test(j)) && jobs.some(j => /Audience library\s+Every day at 11:15 UTC/.test(j)) && jobs.some(j => /Ad results\s+Every hour, at 10 past/.test(j)) && jobs.some(j => /Ad rules and digest\s+Every day at 13:30 UTC/.test(j)) && jobs.some(j => /Ticking things off\s+Every 15 minutes/.test(j)) && jobs.some(j => /The daily job\s+Every day at 13:00 UTC/.test(j)) && jobs.some(j => /Weekly Scaffolding draft\s+Thursdays at 14:00 UTC/.test(j)));
  ck('nothing on the jobs list can be run from here (no buttons)', await p.locator('[aria-label="Scheduled jobs"] button').count() === 0 && await p.locator('[aria-label="Connections"] button').count() === 0);
  await p.goto(U + '/ops/settings?view=connections&s=circlegroups'); await p.waitForSelector('.ops-site'); ck('Circle spaces table', (await curSection(p, 'Connections and jobs')) === 'Circle spaces');
  await p.goto(U + '/ops/settings?view=connections&s=funnel'); await p.waitForSelector('.ops-site'); ck('Funnel steps table (the steps Business › Audience reads)', (await curSection(p, 'Connections and jobs')) === 'Funnel steps (Kit tags)' && /Business → Audience/.test(await main(p)));
  ck('no Connections health, Run now, Dry run or Pause controls (later piece)', !/Run now|Dry run|Pause|Connected|Failing/.test(await (async () => { await p.goto(U + '/ops/settings?view=connections'); return (await main(p)).replace(await p.locator('[aria-label="Connections"] tr', { hasText: 'Meta ads' }).innerText(), ''); })()));   // the Meta ads row says its own mode (ads-settings.sh checks it)

  // the older addresses
  for (const [u, g, s] of [['/ops/settings?t=templates', 'Templates', 'Task templates'], ['/ops/settings?t=links', 'Website copy', 'Links & prices'], ['/ops/settings?t=team', 'Team and roles', 'Team'], ['/ops/settings?t=funnel', 'Connections and jobs', 'Funnel steps (Kit tags)'], ['/ops/settings?t=circlegroups', 'Connections and jobs', 'Circle spaces'],
    ['/ops/settings?t=sreadings', 'Website copy', 'Reading assignments'], ['/ops/settings?t=mpolls', 'Website copy', 'Polls'], ['/ops/settings?t=contracts', 'Templates', 'Agreements'], ['/ops/settings?t=recurring', 'Templates', 'Recurring tasks'], ['/ops/settings?t=resources', 'Team and roles', 'Team links'],
    ['/ops/settings?view=tables&t=stats', 'Website copy', 'Stats'], ['/ops/settings?view=team', 'Team and roles', 'Team'], ['/ops/settings?view=social-rules', 'Templates', 'Social rules'], ['/ops/settings?view=reminders', 'Templates', 'Student reminders'],
    ['/ops/social/team', 'Team and roles', 'Social roles and sign-offs'], ['/ops/social/rules', 'Templates', 'Social rules'], ['/ops/email/reminders', 'Templates', 'Student reminders'], ['/ops/admin?t=funnel', 'Connections and jobs', 'Funnel steps (Kit tags)'], ['/ops/admin?t=links', 'Website copy', 'Links & prices'],
    ['/ops/content?tab=website&t=stats', 'Website copy', 'Stats'], ['/ops/content?tab=social&s=rules', 'Templates', 'Social rules']]) {
    await p.goto(U + u); await p.waitForSelector(`nav[aria-label="${g} sections"]`);
    ck(`${u} opens ${g} › ${s}`, (await curGroup(p)) === g && (await curSection(p, g)) === s);
  }
  await p.goto(U + '/ops/settings?t=nonsense'); ck('an unknown ?t= falls back to the default (no error)', (await curGroup(p)) === 'Templates');
  await p.goto(U + '/ops/settings?t=profiles'); ck('?t=profiles (a table that was never listed) falls back to the default', (await curGroup(p)) === 'Templates');

  // one real save through the editor; the website's cache is asked to refresh (the mock logs it)
  await p.goto(U + '/ops/settings?view=website&s=stats'); await p.waitForSelector('.ops-site-row');
  const before = log(), n0 = (before.match(/SITE REVALIDATE POST secret ok/g) || []).length, w0 = (before.match(/^.*WROTE.*$/gm) || []).length;
  await p.locator('.ops-site-row').first().click(); await p.waitForSelector('form');
  await p.locator('#s-notes').fill('Checked in step 8'); await p.getByRole('button', { name: /Save 1 change/ }).click(); await p.waitForSelector('.ops-site-row');
  await p.waitForTimeout(2500);
  const after = log();
  ck('a save writes the sheet (one change, to the mock)', (after.match(/^.*WROTE.*$/gm) || []).length === w0 + 1 && /Checked in step 8/.test(after));
  ck('and the change is logged to the Change Log tab', /Change Log/.test(after.slice(before.length)));
  ck('and the website’s cache is asked to refresh', (after.match(/SITE REVALIDATE POST secret ok/g) || []).length === n0 + 1);

  // roles
  const fl = await as(cookie('floss@example.com')); await fl.goto(U + '/ops/settings'); await fl.waitForSelector('.ops-setgrid');
  ck('Floss sees Team and roles, Templates, Website copy (no Connections and jobs) and opens on Website copy', (await groups(fl)) === 'Team and roles|Templates|Website copy' && (await curGroup(fl)) === 'Website copy' && (await curSection(fl, 'Website copy')) === 'Links & prices');
  await fl.goto(U + '/ops/settings?view=templates'); ck('Floss’s Templates has Student reminders only (the operations tables are directors only)', (await sections(fl, 'Templates')) === 'Student reminders');
  await fl.goto(U + '/ops/settings?view=team'); ck('Floss’s Team and roles has the Social sign-offs only', (await sections(fl, 'Team and roles')) === 'Social roles and sign-offs');
  await fl.goto(U + '/ops/settings?t=templates'); ck('Floss asking for a Task templates address does not get the table', !/Task templates/.test(await fl.locator('nav[aria-label$="sections"]').innerText()));
  await fl.goto(U + '/ops/settings?view=connections'); ck('Floss asking for Connections and jobs gets her first group', (await curGroup(fl)) !== 'Connections and jobs');
  await fl.goto(U + '/ops/settings?view=social-rules'); ck('Floss asking for Social rules does not get them', !/Social rules/.test(await fl.locator('nav[aria-label$="sections"]').innerText()));
  ck('the editor’s API still refuses Floss the Team table (read and save)', await fl.evaluate(async () => (await fetch('/api/ops/site?tab=team')).status === 401 && (await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: 'team', row: 2, changes: { notes: 'x' }, before: {} }) })).status === 403));
  await fl.goto(U + '/ops/settings?view=website&s=links'); await fl.waitForSelector('.ops-site-row'); ck('Floss can open and edit a website table (Links & prices)', await fl.locator('.ops-site-row').count() > 0);
  const ir = await as(cookie('irene@example.com')); await ir.goto(U + '/ops/settings'); await ir.waitForSelector('.ops-setgrid');
  ck('Irene sees what Floss sees', (await groups(ir)) === 'Team and roles|Templates|Website copy');
  for (const [who, name] of [['carolyn@example.com', 'Carolyn (Publisher)'], ['rebecka@example.com', 'Rebecka (Social role)'], ['ichha@example.com', 'Ichha (Support)'], ['stephanie@example.com', 'Stephanie (Payroll role)']]) {
    const q = await as(cookie(who)); await q.goto(U + '/ops/settings'); await q.waitForSelector('.ops-setgrid');
    const side = (await q.locator('nav[aria-label="Dashboard"] a').allInnerTexts()).join('|');
    ck(`${name}: no Settings in the sidebar, and a direct visit shows only Team and roles and Templates (sign-offs and reminder rules, as before)`, !/Settings/.test(side) && (await groups(q)) === 'Team and roles|Templates' && (await sections(q, 'Team and roles')) === 'Social roles and sign-offs');
    await q.goto(U + '/ops/settings?view=website'); ck(`${name} asking for Website copy does not get it`, (await groups(q)) === 'Team and roles|Templates' && !/Links & prices/.test(await q.locator('main.ops').innerText()));
  }
  const te = await as(cookie('abha@example.com')); await te.goto(U + '/ops/settings'); ck('a teacher is not shown Settings', !new URL(te.url()).pathname.startsWith('/ops/settings') && !/Task templates|Website copy/.test(await te.locator('body').innerText()));

  // phone
  const ph = await as(DIRECTOR, { width: 390, height: 800 });
  for (const [v, wait] of [['templates', '.ops-site-row'], ['templates&s=reminders', '[aria-label="Rules"] li'], ['templates&s=social-rules', '.soc'], ['team&s=signoffs', '[aria-label="People"]'], ['team&s=team', '.ops-site-row'], ['website&s=stats', '.ops-site-row'], ['website&s=mbooks', '.ops-site'], ['connections', '[aria-label="Scheduled jobs"]'], ['connections&s=funnel', '.ops-site']]) {
    await ph.goto(U + `/ops/settings?view=${v}`); await ph.waitForSelector(wait); await ph.waitForTimeout(400);
    ck(`phone: no sideways page scroll (${v})`, !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  }
  await ph.goto(U + '/ops/settings?view=connections'); await ph.waitForSelector('[aria-label="Scheduled jobs"]');
  ck('phone: the section list is a row you scroll sideways inside its own panel, links 44px tall', await ph.evaluate(() => { const l = document.querySelector('.ops-setlist'); return getComputedStyle(l).overflowX !== 'visible' && [...l.querySelectorAll('a')].every(a => a.getBoundingClientRect().height >= 43.5); }));
  ck('phone: the group tabs are 44px tall', await ph.evaluate(() => [...document.querySelectorAll('nav[aria-label="settings views"] a')].every(a => a.getBoundingClientRect().height >= 43.5)));
  ck('phone: the tables scroll inside their panel', await ph.evaluate(() => [...document.querySelectorAll('.bz-panel .ops-table-wrap')].every(w => getComputedStyle(w).overflowX !== 'visible')));
  await ph.screenshot({ path: __dirname + '/out/settings-connections-phone.png', fullPage: true });
  await ph.goto(U + '/ops/settings?view=website&s=stats'); await ph.waitForSelector('.ops-site-row'); await ph.screenshot({ path: __dirname + '/out/settings-website-phone.png', fullPage: true });
  await p.goto(U + '/ops/settings'); await p.waitForSelector('.ops-site-row'); await p.screenshot({ path: __dirname + '/out/settings-templates-desktop.png', fullPage: true });
  ck('no page errors', pages.every(x => !x.errs.length));
  await b.close(); process.exit(bad ? 1 : 0);
})();
