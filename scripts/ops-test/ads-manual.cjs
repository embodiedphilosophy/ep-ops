// The Ads account buttons in a browser (run by ads-manual.sh, after ads-manual-api.mjs on the same app): Ads › Campaigns › "In your Meta account", campaigns not made in Ops. Phases:
//   dry   the safety switch is OFF: "Live changes are off", every press asks first in plain words, then says "Recorded only: Meta wasn't changed", Meta is never written, no Reverse
//   live  the switch is ON at the mock only: Pause changes the campaign and the row; Reverse; +20% above the ceiling is refused in words; a campaign changed in Meta since the page loaded is refused
// Both: the buttons each row gets (Pause or Resume, +20%, Set budget; lifetime and no-budget rows say why and only pause; archived rows none), the exact amount form and its refusals, the wording
// of every question, Rebecka (Ads role) has the buttons and Floss/a teacher have no page, 390px phone width (44px buttons, no sideways scroll). Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'dry';
const U = 'http://localhost:3100', OUT = path.join(__dirname, 'out'), META = 'http://localhost:4556';
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim().replace(/^ep_ops=/, '');
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const mine = async id => (await (await fetch(`${META}/v21.0/${id}`, { headers: { Authorization: 'Bearer x' } })).json());
const KEYS = /mock-ads-token-for-the-settings-test|mock-ads-token-for-the-safety-test/;

(async () => {
  fs.mkdirSync(path.join(OUT, 'ads'), { recursive: true });
  const b = await chromium.launch();
  const as = async (c, vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: c, url: U }]); const p = await ctx.newPage(); p.errs = []; p.asked = []; p.on('pageerror', e => p.errs.push(String(e))); p.on('dialog', d => { p.asked.push(d.message()); (p.answer === false ? d.dismiss() : d.accept()); }); return p; };
  const p = await as(DIRECTOR), sec = p.locator('section[aria-label="In your Meta account"]');
  await p.goto(U + '/ops/ads'); await sec.locator('.acct-table tbody tr').first().waitFor();
  const tr = id => sec.locator(`tr[data-id="${id}"]`), btn = (id, name) => tr(id).getByRole('button', { name, exact: true });
  const said = async re => { await p.waitForFunction(r => new RegExp(r).test(document.querySelector('section[aria-label="In your Meta account"]').innerText), re.source, { timeout: 8000 }).catch(() => {}); return sec.innerText(); };
  const live = PHASE === 'live', last = () => p.asked[p.asked.length - 1] || '';

  console.log('-- the buttons each row gets');
  ck('the heading no longer promises "read only", and says the buttons ask first', !/Read only/.test(await sec.innerText()) && /each one asks you first/.test(await sec.innerText()));
  ck('a running campaign: Pause, +20% and Set budget', await btn('W_OPEN', 'Pause').count() === 1 && await btn('W_OPEN', '+20%').count() === 1 && await btn('W_OPEN', 'Set budget').count() === 1);
  ck('a paused one: Resume (not Pause)', await btn('W_PAUSED', 'Resume').count() === 1 && await btn('W_PAUSED', 'Pause').count() === 0);
  ck('a lifetime budget: only Pause, and the row says why in plain words', await btn('W_ZERO', 'Pause').count() === 1 && await btn('W_ZERO', '+20%').count() === 0 && /lifetime budget/.test(await tr('W_ZERO').innerText()));
  ck('no daily budget at all: only Pause, and it says so', await btn('W_OK1', '+20%').count() === 0 && /no daily budget/.test(await tr('W_OK1').innerText()));
  ck('an archived campaign: no buttons at all', await tr('W_ARCH').locator('.acct-act button').count() === 0);
  ck('the explanation says Ops never changes these by itself, and never touches words, audiences or pictures', /Ops never changes them by itself, and never touches their words, audiences or pictures/.test(await sec.innerText()));
  ck(live ? 'no "live changes are off" notice' : 'a notice says live changes are off and the buttons only record', live ? !/Live changes are off/.test(await sec.innerText()) : /Live changes are off\. The buttons ask and record what you pressed, but Meta is not changed/.test(await sec.innerText()));

  console.log('-- saying no');
  p.answer = false; const before = p.asked.length;
  await btn('W_OPEN', 'Pause').click(); await p.waitForTimeout(400);
  ck('Pause asks: "Pause “Evergreen interest test” (spending $…a day)?" in plain words', /^Pause “Evergreen interest test” \(spending \$[\d.,]+ a day\)\?/.test(last()) && /Meta will stop spending on it/.test(last()) && /reverse this afterwards/.test(last()), last());
  ck(live ? 'the question does not mention recording' : 'the question says it will only be recorded: Meta will not be changed', live ? !/only be recorded/.test(last()) : /only be recorded: Meta will not be changed/.test(last()));
  ck('answering no changes nothing: no request, no write, no message', p.asked.length === before + 1 && (await writes()).length === 0 && !(await sec.locator('p.hint').count()));
  p.answer = true;

  console.log('-- an exact amount');
  await btn('W_OPEN', 'Set budget').click();
  const form = tr('W_OPEN').locator('form.acct-amount'), input = form.locator('input');
  ck('a small form with a label, the ceiling, and a Review button', await input.count() === 1 && /New daily budget in all, in dollars/.test(await form.innerText()) && /Up to \$60 a day for one budget/.test(await form.innerText()));
  await input.fill('abc'); await form.getByRole('button', { name: 'Review' }).click();
  ck('"abc" is refused in words, no question asked', /Enter the new daily budget in dollars, like 40 or 40.50/.test(await said(/Enter the new daily budget/)) && !/Set the daily budget/.test(last()));
  await input.fill('75'); const n1 = p.asked.length; await form.getByRole('button', { name: 'Review' }).click(); await said(/above the \$60/);
  ck('$75 is refused straight away: above the $60 a day ceiling, nothing asked, nothing written', /above the \$60 a day ceiling Ops keeps for one budget\. Nothing was changed/.test(await sec.innerText()) && p.asked.length === n1 && (await writes()).length === 0);
  await input.fill('40'); await form.getByRole('button', { name: 'Review' }).click(); await p.waitForTimeout(150);
  ck('$40 asks: "Set the daily budget of “…” to $40 a day (now $30)?"', /^Set the daily budget of “Evergreen interest test” to \$40 a day \(now \$30\)\?/.test(last()) && /reverse this afterwards/.test(last()), last());
  if (live) {
    await said(/Set: the daily budget/);
    ck('live: the campaign at the mock is $40 and the page says so in words', (await mine('W_OPEN')).daily_budget === '4000' && /Set: the daily budget of “Evergreen interest test” is now \$40 a day \(it was \$30\)/.test(await sec.innerText()) && /\$40 a day/.test(await tr('W_OPEN').locator('.c-budget').innerText()));
  } else {
    await said(/Recorded only/);
    ck('off: "Recorded only: Meta wasn’t changed because live changes are off", the mock untouched, the row still $30', /Recorded only: Meta wasn’t changed because live changes are off/.test(await sec.innerText()) && (await writes()).length === 0 && (await mine('W_OPEN')).daily_budget === '3000' && /\$30 a day/.test(await tr('W_OPEN').locator('.c-budget').innerText()));
  }

  console.log('-- Pause, +20%, and a budget on ad sets');
  await btn('W_OPEN', 'Pause').click(); await said(live ? /Paused “/ : /Recorded only/);
  if (live) ck('live: "Paused “…”. Meta will stop spending on it", the row says Paused and offers Resume', /Paused “Evergreen interest test”\. Meta will stop spending on it/.test(await sec.innerText()) && (await mine('W_OPEN')).status === 'PAUSED' && await btn('W_OPEN', 'Resume').count() === 1 && /Paused/.test(await tr('W_OPEN').locator('.c-status').innerText()));
  else { await p.waitForFunction(() => document.querySelectorAll('.acct-changes .ads-pill.dry').length >= 2, null, { timeout: 8000 }).catch(() => {}); ck('off: still running at the mock, still offers Pause; the change list says "Recorded only"', (await mine('W_OPEN')).status === 'ACTIVE' && await btn('W_OPEN', 'Pause').count() === 1 && await sec.locator('.acct-changes .ads-pill.dry').count() >= 2); }
  await btn('W_SETS', '+20%').click(); await said(live ? /Raised 20%/ : /Recorded only/);
  ck('on a budget that sits on ad sets the question lists each ad set, saying so', /^Raise the daily budget of “Quiet evergreen \(budget on its ad sets\)” by 20%, from \$15 to \$18 a day\?/.test(last()) && /Its budget sits on its 2 running ad sets, so that is where it changes: Ad set of Quiet evergreen \(budget on its ad sets\) 1 \$10 → \$12, Ad set of Quiet evergreen \(budget on its ad sets\) 2 \$5 → \$6/.test(last()), last());
  if (live) ck('live: both ad sets at the mock went up, and the message says "on its 2 running ad sets"', (await mine('as_W_SETS_1')).daily_budget === '1200' && (await mine('as_W_SETS_2')).daily_budget === '600' && /on its 2 running ad sets/.test(await sec.innerText()));

  if (live) {
    console.log('-- the ceiling, a conflict, and Reverse');
    await btn('W_LOW', '+20%').click(); await said(/ceiling/);
    ck('+20% on a $60 budget: refused in words with the numbers, nothing changed', /“Weak return test” would go from \$60 to \$72 a day, which is above the \$60 a day ceiling Ops keeps for one budget\. Nothing was changed/.test(await sec.innerText()) && (await mine('W_LOW')).daily_budget === '6000');
    await fetch(`${META}/__touch?id=W_PAST&daily=4000`);
    await btn('W_PAST', '+20%').click(); await said(/changed in Meta since/);
    ck('a budget moved in Meta after the page loaded: refused, says the new amount, the mock keeps what Meta had', /daily budget of “Old retreat promo” has been changed in Meta since you opened this page \(it is now \$40 a day\)/.test(await sec.innerText()) && (await mine('W_PAST')).daily_budget === '4000');
    const list = sec.locator('.acct-changes li');
    ck('"Changes you made here" lists them, with who and when, a Reverse on real ones', await list.count() >= 3 && await sec.locator('.acct-changes').getByRole('button', { name: /^Reverse:/ }).count() >= 3 && /ET/.test(await sec.locator('.acct-changes').innerText()));
    const rv = sec.locator('.acct-changes li', { hasText: 'Evergreen interest test' }).filter({ hasText: 'is paused' }).getByRole('button', { name: /^Reverse:/ });
    await rv.click(); await said(/Reversed:/);
    ck('Reverse asks "Reverse this change?" in the same words as the Campaigns list', /^Reverse this change\?\n\nThe earlier value is put back in Meta\. If it has been changed again since, nothing is done\.$/.test(last()), last());
    ck('Reversed: the campaign runs again at the mock, the row offers Pause, the list marks it Reversed', /Reversed: “Evergreen interest test” is running again/.test(await sec.innerText()) && (await mine('W_OPEN')).status === 'ACTIVE' && await btn('W_OPEN', 'Pause').count() === 1 && await sec.locator('.acct-changes .ads-pill', { hasText: 'Reversed' }).count() >= 1);
  }

  console.log('-- nothing leaks');
  ck('Meta was never written in the off phase', live || (await writes()).length === 0);
  ck('the key and ad account number are in no page and no question asked', !KEYS.test(await p.content()) && !/act_MOCK1/.test((await p.content()).replace(/adsmanager[^"]*act=MOCK1/g, '')) && !p.asked.some(a => KEYS.test(a) || /act_MOCK1/.test(a)));
  ck('no page error', p.errs.length === 0, p.errs.join(' | '));
  await p.screenshot({ path: path.join(OUT, 'ads', `ads-manual-${PHASE}.png`), fullPage: true });

  console.log('-- who has the buttons');
  const rbp = await as(cookie('rebecka@example.com')); await rbp.goto(U + '/ops/ads'); await rbp.locator('.acct-table tbody tr').first().waitFor();
  ck('Rebecka (Ads role) has the buttons', await rbp.locator('tr[data-id="W_OPEN"] .acct-act button').count() >= 2);
  for (const [who, email] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['a teacher', 'abha@example.com']]) {
    const q = await as(cookie(email)); await q.goto(U + '/ops/ads'); await q.waitForTimeout(400);
    ck(`${who}: no Ads page, so no buttons`, !/In your Meta account/.test(await q.content()) && await q.locator('.acct-act').count() === 0);
  }

  console.log('-- phone width (390px)');
  const m = await as(DIRECTOR, { width: 390, height: 844 });
  await m.goto(U + '/ops/ads'); await m.waitForSelector('.acct-table tbody tr');
  await m.locator('tr[data-id="W_SETS"]').getByRole('button', { name: 'Set budget' }).click();
  const r = await m.evaluate(() => {
    const s = document.querySelector('section[aria-label="In your Meta account"]');
    const small = [...s.querySelectorAll('.acct-act button, .acct-act input, .acct-changes button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.placeholder || '').slice(0, 20));
    const form = s.querySelector('form.acct-amount'), sc = s.querySelector('.ads-scroll');
    return { over: document.documentElement.scrollWidth - innerWidth, small, formShown: !!form && form.getBoundingClientRect().width > 0, scrolls: sc.scrollWidth > sc.clientWidth + 20 };
  });
  ck('the amount form opens, and the table still scrolls inside its panel', r.formShown && r.scrolls);
  ck('no sideways scroll on the page', r.over <= 1, `${r.over}px`);
  ck('every button and the amount box are 44px tall', r.small.length === 0, r.small.join(', '));
  ck('no page error at phone width', m.errs.length === 0, m.errs.join(' | '));
  await m.screenshot({ path: path.join(OUT, 'ads', `ads-manual-${PHASE}-phone.png`), fullPage: true });
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
