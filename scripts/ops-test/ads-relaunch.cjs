// Relaunch (Ads) in a browser (run by ads-relaunch.sh right after ads-relaunch-api.mjs, on the same state: a Running Purchase campaign "Kali Winter 2027" and a paused Traffic one in Meta,
// no relaunch drafts): the Relaunch button on the Campaigns list and on the campaign page, the confirm (cancel does nothing; the words say it is a draft and the old campaign stays),
// a double click makes ONE draft, the new draft opens in the four steps with the "Nothing has gone to Meta" banner, the old campaign page lists it, phone width (390px: no sideways scroll,
// 44px controls, the confirm fits the screen), opening a page posts nothing, and the Meta mock sees no write. Mock only.
const { chromium } = require('./pw.cjs');
const fs = require('fs'), path = require('path');
const U = 'http://localhost:3100', META = 'http://localhost:4556', OUT = path.join(__dirname, 'out');
let bad = 0; const ck = (n, c, x = '') => { if (!c) { bad++; console.log('FAIL', n, x); } else console.log('ok  ', n); };
const DIRECTOR = fs.readFileSync(path.join(OUT, 'cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const api = async u => (await fetch(U + u, { headers: { Cookie: `ep_ops=${DIRECTOR}` } })).json();
const writes = async () => (await (await fetch(META + '/__log')).json()).requests.filter(r => r.write).length;
const SECRETS = ['mock-ads-token-for-the-settings-test', 'mock-anthropic-key-not-real'];

(async () => {
  const list = (await api('/api/ops/ads')).campaigns, A = list.find(c => c.goal === 'Purchase' && c.status === 'live'), Bc = list.find(c => c.goal === 'Traffic' && c.status === 'sent_paused'), base = list.length, w0 = await writes();
  if (!A || !Bc) { console.log('FAIL the two seeded campaigns are missing (run ads-relaunch-api.mjs first)'); process.exit(1); }
  const b = await chromium.launch();
  const as = async (vp = { width: 1360, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addCookies([{ name: 'ep_ops', value: DIRECTOR, url: U }]); const p = await ctx.newPage(); p.errs = []; p.posts = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('request', r => r.method() === 'POST' && p.posts.push(r.url())); p.on('dialog', d => d.accept()); return p; };
  const row = (p, c) => p.locator('.ads-table tbody tr', { has: p.locator(`a.ads-name[href="/ops/ads/${c.id}"]`) });
  const p = await as();

  console.log('-- the Campaigns list');
  await p.goto(U + '/ops/ads'); await p.waitForSelector('.ads-table');
  ck('opening the list posted nothing', p.posts.length === 0);
  ck('a campaign in Meta has a Relaunch button under its name', (await row(p, A).getByRole('button', { name: 'Relaunch' }).count()) === 1 && (await row(p, Bc).getByRole('button', { name: 'Relaunch' }).count()) === 1);
  ck('a draft has none (there are none yet, so the list has exactly two Relaunch buttons)', (await p.getByRole('button', { name: 'Relaunch' }).count()) === 2);
  await row(p, A).getByRole('button', { name: 'Relaunch' }).click();
  const dlg = p.getByRole('dialog'); await dlg.waitFor();
  const said = await dlg.innerText();
  ck('the confirm says what happens, in plain words', /Make a new draft from this campaign\. Fresh words will be written; the old campaign stays as it is\./.test(said) && /Nothing goes to Meta until you press Send/.test(said), said);
  ck('the daily budget is there to edit, filled in with the campaign’s ($100)', (await dlg.getByLabel('Daily budget in dollars').inputValue()) === '100');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  ck('Cancel closes it and posts nothing', (await p.getByRole('dialog').count()) === 0 && p.posts.length === 0 && (await api('/api/ops/ads')).campaigns.length === base);
  await row(p, A).getByRole('button', { name: 'Relaunch' }).click(); await p.keyboard.press('Escape');
  ck('Escape closes it too', (await p.getByRole('dialog').count()) === 0);

  console.log('-- one double click makes one draft');
  await row(p, A).getByRole('button', { name: 'Relaunch' }).click();
  await p.getByRole('dialog').getByLabel('Daily budget in dollars').fill('80');
  await p.getByRole('dialog').getByRole('button', { name: 'Make a new draft' }).dblclick();
  await p.waitForURL(u => /\/ops\/ads\/cmp_/.test(u.pathname) && !u.pathname.endsWith(A.id), { timeout: 20000 });
  await p.waitForSelector('.ads-steps');
  const mid = (await api('/api/ops/ads')).campaigns, fresh = mid.filter(c => c.status === 'draft');
  ck('there is exactly one new campaign, and it is a draft', mid.length === base + 1 && fresh.length === 1, JSON.stringify(mid.map(c => c.status)));
  ck('the browser opened it', p.url().endsWith(fresh[0].id));
  const page = await p.innerText('.ads');
  ck('it opens in the four steps, as a draft, with the review banner', /Relaunched from/.test(page) && /This is a draft\. Nothing has gone to Meta\. Read the new words before you send it\./.test(page) && (await p.locator('.ads-steps button').count()) === 4);
  ck('its dates come from the newer launch the API flow left (1 to 20 June), so there is no "Set the dates" flag (the missing-dates flag is checked by the API flow)', /Tue 1 Jun to Sun 20 Jun/.test(page) && /dates follow the launch/.test(page) && !/Set the dates/.test(page));
  ck('the banner links back to the old campaign', (await p.locator(`.ads-mode a[href="/ops/ads/${A.id}"]`).count()) === 1);
  ck('the budget the person typed ($80) is the draft’s', fresh[0].daily_cents === 8000, String(fresh[0].daily_cents));
  await p.getByRole('button', { name: /^2 · Creative and copy/ }).click(); await p.waitForTimeout(600);
  ck('step 2 shows the new words to read (no old words, five copy sets)', (await p.locator('.ads-table.copy textarea').count()) >= 5 && !/Zephyrquartz|Quillmarker/i.test(await p.innerText('.ads') + (await p.locator('textarea, input').evaluateAll(els => els.map(e => e.value).join(' ')))));
  await p.getByRole('button', { name: /^4 · Check and start/ }).click(); await p.waitForTimeout(900);
  const sendBtn = p.getByRole('button', { name: /Send to Meta/ }).first();
  ck('"Send to Meta" is a separate step a person must press (and is not pressed by any of this)', (await sendBtn.count()) === 1 && (await writes()) === w0);

  console.log('-- the old campaign’s page');
  const q = await as();
  await q.goto(U + `/ops/ads/${A.id}`); await q.waitForSelector('.ads-live');
  ck('opening it posted nothing', q.posts.length === 0);
  ck('it still shows the old results page, with a Relaunch button in the header', (await q.locator('.ads-head').getByRole('button', { name: 'Relaunch' }).count()) === 1 && (await q.locator('.ads-live-kpis').count()) === 1);
  ck('and lists the new draft', (await q.locator(`.ads-mode a[href="/ops/ads/${fresh[0].id}"]`).count()) === 1);
  console.log('-- from the campaign page (the Traffic one, in Meta and paused)');
  await q.goto(U + `/ops/ads/${Bc.id}`); await q.waitForSelector('.ads-live');
  await q.locator('.ads-head').getByRole('button', { name: 'Relaunch' }).click(); await q.getByRole('dialog').getByRole('button', { name: 'Make a new draft' }).click();
  await q.waitForURL(u => /\/ops\/ads\/cmp_/.test(u.pathname) && !u.pathname.endsWith(Bc.id), { timeout: 20000 }); await q.waitForSelector('.ads-steps');
  const after = (await api('/api/ops/ads')).campaigns, tr = after.find(c => c.status === 'draft' && c.goal === 'Traffic');
  ck('a Traffic draft appeared (still no rules), and the first draft is untouched', after.length === base + 2 && !!tr && after.find(c => c.id === fresh[0].id).daily_cents === 8000);
  ck('asking again for the first campaign opens the draft it already has', await (async () => { const r = await (await fetch(U + '/api/ops/ads', { method: 'POST', headers: { Cookie: `ep_ops=${DIRECTOR}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'relaunch', id: A.id, confirm: true }) })).json(); return r.id === fresh[0].id && r.existing === true; })());

  console.log('-- phone width (390px)');
  const m = await as({ width: 390, height: 800 });
  const fits = async name => {
    const r = await m.evaluate(() => {
      const w = document.documentElement.clientWidth, over = document.documentElement.scrollWidth - w;
      const btns = [...document.querySelectorAll('.ads button, .ads .soc-btn, .ads-modal button, .ads-modal input')].filter(e => e.offsetParent);
      const box = document.querySelector('.ads-modal .box')?.getBoundingClientRect();
      return { over, small: btns.filter(e => e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.getAttribute('aria-label') || '').slice(0, 24)), box: box && { l: box.left, r: box.right, w } };
    });
    ck(`${name}: no sideways scroll on the page`, r.over <= 1, `${r.over}px`);
    ck(`${name}: buttons and fields are 44px tall`, r.small.length === 0, r.small.join(', '));
    return r;
  };
  await m.goto(U + '/ops/ads'); await m.waitForSelector('.ads-table');
  await row(m, A).getByRole('button', { name: 'Relaunch' }).click(); await m.getByRole('dialog').waitFor();
  const r1 = await fits('Campaigns list with the confirm open');
  ck('the confirm sits inside the screen', r1.box && r1.box.l >= 0 && r1.box.r <= r1.box.w, JSON.stringify(r1.box));
  await m.screenshot({ path: path.join(OUT, 'ads-relaunch-confirm-phone.png') });
  await m.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await m.goto(U + `/ops/ads/${A.id}`); await m.waitForSelector('.ads-live');
  await fits('campaign page');
  await m.locator('.ads-head').getByRole('button', { name: 'Relaunch' }).click(); const r2 = await fits('campaign page with the confirm open');
  ck('the confirm sits inside the screen there too', r2.box && r2.box.l >= 0 && r2.box.r <= r2.box.w, JSON.stringify(r2.box));
  await m.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await m.goto(U + `/ops/ads/${fresh[0].id}`); await m.waitForSelector('.ads-steps'); await fits('the new draft');
  ck('the banner shows on the phone', /Nothing has gone to Meta/.test(await m.innerText('.ads')));
  await m.screenshot({ path: path.join(OUT, 'ads-relaunch-draft-phone.png'), fullPage: true });
  ck('no page error, and no POST from opening any page', [p, q, m].every(x => x.errs.length === 0) && m.posts.length === 0);

  console.log('-- nothing reached Meta, and no key in any page');
  ck('the Meta mock saw no write', (await writes()) === w0);
  const html = (await p.content()) + (await q.content()) + (await m.content());
  ck('no key or token in any page', SECRETS.every(s => !html.includes(s)));
  await b.close();
  console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
})();
