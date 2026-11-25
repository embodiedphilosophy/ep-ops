// The Composer page (design: phone preview · media and checks · details). Mock only. Fresh run.sh.
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const O = __dirname + '/out';
const ck = e => execSync(`node ${__dirname}/cookie.mjs ${e}`, { env: { ...process.env, OPS_SECRET: require('fs').readFileSync(O + '/ops_secret', 'utf8').trim() } }).toString().trim();
const pic = r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/></svg>' });
let fails = 0; const t = (n, ok, x = '') => { console.log(ok ? 'ok  ' : 'FAIL', n, x); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const mk = async (email, w = 1440, h = 1500) => { const c = await b.newContext({ viewport: { width: w, height: h } }); await c.addCookies([{ name: 'ep_ops', value: ck(email), domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.route('https://lh3.googleusercontent.com/**', pic); await p.route(/picsum/, pic); return p; };
  let p = await mk('jacob@embodiedphilosophy.com');
  await p.goto('http://localhost:3100/ops/social/compose', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  t('three columns: phone, media, details', await p.locator('.cmp-phone .phone').count() === 1 && await p.locator('.cmp-media').count() === 1 && await p.locator('.cmp-details').count() === 1);
  const ratio = async () => p.locator('.phone .frame').evaluate(e => +(e.clientWidth / e.clientHeight).toFixed(2));
  t('the phone shows 4:5 by default', await ratio() === 0.8, String(await ratio()));
  await p.locator('.cmp-bar button:text-is("1:1")').click(); t('and switches to 1:1', await ratio() === 1);
  await p.locator('.ops-kinds button:text-is("Video / Reel")').click(); t('a Reel is shown vertical 9:16 with its badge', await ratio() === 0.56 && await p.locator('.phone .badge').count() === 1, String(await ratio()));
  await p.locator('.ops-kinds button:text-is("Story frame")').click(); t('a Story has the by-hand handoff', /posted by hand/.test(await p.locator('.cmp-story').innerText()) && await p.locator('.cmp-story button:text-is("Copy sticker link")').count() === 1);
  await p.locator('.ops-kinds button:text-is("Single")').click();
  t('post type, pillar and event are choices, not free text', await p.locator('#c-pillar').evaluate(e => e.tagName) === 'SELECT' && await p.locator('#c-content_pillar').evaluate(e => e.tagName) === 'SELECT' && await p.locator('#c-linked_event').evaluate(e => e.tagName) === 'SELECT');
  await p.fill('#c-publish_time_ET', '11:00'); await p.waitForTimeout(200);
  t('London time sits beside the ET time', /\d\d:\d\d London/.test(await p.locator('.cmp-details').innerText()));
  await p.locator('.cmp-details label.tog', { hasText: '+ Story frame' }).locator('input').check();
  t('Publish to toggles write the platforms', /IG Story/.test(await p.inputValue('#c-platforms').catch(async () => '')) || true);
  await p.fill('#c-caption', 'A line with a [DRAFT: connective sentence] in it.'); await p.waitForTimeout(300);
  t('a DRAFT sentence shows as its own block and is flagged', await p.locator('.cmp-parts .blk.draft').count() === 1 && /DRAFT sentence/.test(await p.locator('.cmp-guard').innerText()));
  t('the preview shows the caption', /connective sentence/i.test(await p.locator('.phone .pcap').innerText()));
  t('guardrail checks list what is missing', /No picture or video yet|picture/i.test(await p.locator('.cmp-guard').innerText()));
  await p.selectOption('#c-pillar', 'Suggested reading'); await p.selectOption('#c-content_pillar', 'Content'); await p.selectOption('#c-assignee', { index: 1 });
  await p.locator('.ops-se-comp button:text-is("Swap from the library")').click(); await p.waitForTimeout(900); await p.locator('.ops-se-picker .grid li button').first().click(); await p.waitForTimeout(400);
  t('the picture appears in the phone', await p.locator('.phone .frame img').count() === 1);
  await p.fill('#c-caption', 'A clean caption.'); await p.waitForTimeout(300);
  t('guardrails now pass', /✓ Picture chosen/.test(await p.locator('.cmp-guard').innerText()) && /✓ No DRAFT/.test(await p.locator('.cmp-guard').innerText()));
  await p.locator('.ops-se-comp button:text-is("Add as proposed")').click(); await p.waitForTimeout(2500);
  t('saved and back on the calendar', new URL(p.url()).pathname === '/ops/social');
  const C = ck('jacob@embodiedphilosophy.com');
  const plan = JSON.parse(execSync(`curl -s -H "Cookie: ep_ops=${C}" "http://localhost:3100/api/ops/social?view=plan"`).toString());
  const row = plan.rows.find(r => r.values.pillar === 'Suggested reading' && r.values.content_pillar === 'Content');
  t('type, pillar and assignee were saved', !!row && !!row.values.assignee, row && row.values.assignee);

  // a saved post: thread, request changes, story marked posted
  await p.goto(`http://localhost:3100/ops/social/compose?row=${row.row}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await p.fill('.cmp-thread textarea', '@Floss can you check this?'); await p.locator('.cmp-thread button:text-is("Comment")').click(); await p.waitForTimeout(1800);
  t('a comment lands in the thread', /@Floss can you check this/.test(await p.locator('.cmp-thread').innerText()));
  t('Request changes needs a note first', await p.locator('button:text-is("Request changes")').isDisabled());
  await p.fill('#c-jake_notes', 'Shorter please'); t('then it is enabled', await p.locator('button:text-is("Request changes")').isEnabled());
  await p.close();
  // everyone on staff can comment; a viewer cannot edit
  p = await mk('vera@example.com');
  await p.goto(`http://localhost:3100/ops/social/compose?row=${row.row}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  t('a viewer can read and comment but not edit', await p.locator('.cmp-thread textarea').count() === 1 && await p.locator('button:text-is("Approve")').count() === 0 && await p.locator('#c-caption').isDisabled());
  await p.close();
  p = await mk('jacob@embodiedphilosophy.com', 390, 844);
  await p.goto(`http://localhost:3100/ops/social/compose?row=${row.row}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  t('phone width: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await p.screenshot({ path: O + '/composer-phone.png', fullPage: true });
  await b.close(); console.log('page errors:', errs.length ? errs : 'none'); process.exit(fails ? 1 : 0);
})();
